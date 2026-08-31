import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  distributeLeadToNextBuyer,
  forceAssignRoundRobin,
  redistributePendingLeads,
  tryAdminRule,
} from '@/lib/distribute'
import { dispatchScheduledSms } from '@/lib/sms-auto'
import { releasePendingRewards } from '@/lib/referral'
import { dripLegacyCrmBonusLeads } from '@/lib/crm-bonus-drip'
import {
  notifyGroupLeadPending,
  sendLeadNotificationEmail,
  checkBridgeHealthAndAlert,
  checkAllBridgesAndAlert,
} from '@/lib/notifications'
import { stateFromPhone } from '@/lib/us-area-codes'
import { acquireMetaPollLease, fetchMetaFormLeads, releaseMetaPollLease } from '@/lib/meta-poll'
import { randomUUID } from 'node:crypto'
import { META_FORM_LANGUAGES } from '@/lib/lead-language'

export const maxDuration = 300

const FORM_IDS = Object.keys(META_FORM_LANGUAGES)

interface RoutingStep {
  email: string
  limit: number
  delivered: number
}
interface LeadRouting {
  mode: 'normal' | 'exclusive' | 'random' | 'roundrobin' | 'sequential'
  exclusive_email?: string | null
  pool_emails?: string[]
  steps?: RoutingStep[]
  fallback_mode?: 'normal' | 'exclusive'
  fallback_email?: string | null
  // Regra do administrador (1 a cada N): a cada N leads do sistema, 1 vai pro admin.
  admin_rule?: { admin_emails?: string[]; one_in?: number; daily_quota?: number }
}

/**
 * Decide o(s) email(s) alvo pra um lead conforme o modo de roteamento.
 * Retorna null = usar distribuicao normal (creditos/estado).
 * stepIndex (sequential) indica qual etapa contar como entregue.
 */
function resolveRoutingTarget(r: LeadRouting | null): { emails: string[]; stepIndex?: number } | null {
  if (!r || !r.mode || r.mode === 'normal') return null
  if (r.mode === 'exclusive') return r.exclusive_email ? { emails: [r.exclusive_email] } : null
  if (r.mode === 'roundrobin')
    return (r.pool_emails || []).filter(Boolean).length ? { emails: (r.pool_emails || []).filter(Boolean) } : null
  if (r.mode === 'random') {
    // Passa o pool inteiro — o forceAssignRoundRobin filtra por licença estadual
    // e distribui entre os elegíveis (não pré-sorteia 1 que pode não ter o estado).
    const pool = (r.pool_emails || []).filter(Boolean)
    return pool.length ? { emails: pool } : null
  }
  if (r.mode === 'sequential') {
    const steps = r.steps || []
    const idx = steps.findIndex((s) => (s.delivered || 0) < (s.limit || 0))
    if (idx >= 0) return { emails: [steps[idx].email], stepIndex: idx }
    // fila esgotada → fallback (exclusive p/ um email, ou normal)
    if (r.fallback_mode === 'exclusive' && r.fallback_email) return { emails: [r.fallback_email] }
    return null
  }
  return null
}

/**
 * GET /api/poll-leads — Polls Meta Graph API for new leads not yet in DB.
 * Reconciles Meta forms independently of webhook delivery. Timer: every 2 minutes.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const secret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || url.searchParams.get('secret')
  const allowedSecrets = [process.env.CRON_SECRET, process.env.POLL_SECRET || 'lead4producers-poll-2026']
    .filter(Boolean)
    .map((s) => s!.trim().replace(/\\n/g, ''))
  if (!secret || !allowedSecrets.includes(secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pageToken = (process.env.META_PAGE_TOKEN || '').trim().replace(/\\n/g, '')
  if (!pageToken) {
    return NextResponse.json({ error: 'No META_PAGE_TOKEN' }, { status: 500 })
  }

  const supabase = createAdminClient()
  const owner = randomUUID()
  const started = Date.now()
  let acquired = false
  let previousHealth: any = {}
  let imported = 0
  let skipped = 0
  let remaining = 0
  const issues: string[] = []
  try {
    acquired = await acquireMetaPollLease(supabase, owner)
    if (!acquired) return NextResponse.json({ status: 'busy', imported: 0 }, { status: 409 })
    const health = await supabase.from('settings').select('value').eq('key', 'meta_poll_health').maybeSingle()
    if (health.error) throw health.error
    previousHealth = health.data?.value || {}
    const startedAt = new Date(started).toISOString()
    const heartbeat = await supabase
      .from('settings')
      .upsert({
        key: 'meta_poll_health',
        value: { ...previousHealth, last_started_at: startedAt, status: 'running' },
        updated_at: startedAt,
      })
    if (heartbeat.error) throw heartbeat.error

    // Roteamento de leads (admin → Configuracoes → Roteamento de Leads). Lido do banco.
    // Modos: normal | exclusive | random | roundrobin | sequential. Sem config = normal.
    let routing: LeadRouting | null = null
    {
      const { data: lr, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'lead_routing')
        .maybeSingle()
      if (error) throw error // Never bypass the configured priority on a DB failure.
      routing = (lr?.value as LeadRouting) || null
    }

    // A successful checkpoint retains a 72h overlap. After an outage, the window
    // expands from that checkpoint; there is no "latest 20" truncation.
    const checkpoint = Date.parse(previousHealth.last_success_at)
    const since = new Date(
      Number.isFinite(checkpoint) ? Math.min(checkpoint, started) - 72 * 3600_000 : started - 7 * 86400_000,
    )
    const leads = await fetchMetaFormLeads(FORM_IDS, pageToken, since)

    for (const lead of leads) {
      const formId = lead.form_id
      // Check duplicate
      const { data: existing, error: duplicateError } = await supabase
        .from('leads')
        .select('id')
        .eq('meta_lead_id', lead.id)
        .maybeSingle()
      if (duplicateError) throw duplicateError

      if (existing) {
        skipped++
        continue
      }
      // Bounded batches avoid function timeouts. The next run scans the same
      // window, skips persisted IDs and resumes with the oldest missing lead.
      if (imported >= 10 || Date.now() - started > 90_000) {
        remaining++
        continue
      }

      // Parse fields
      const fields: Record<string, string> = {}
      for (const f of lead.field_data || []) {
        fields[f.name] = f.values?.[0] || ''
      }

      const name = fields.full_name || fields.nome_completo || 'Lead Meta'
      const email = fields.email || ''
      const phone = fields.phone || fields.phone_number || ''
      if (!/^\d{10,15}$/.test(phone.replace(/\D/g, ''))) {
        issues.push(`Lead ${lead.id}: missing/invalid phone; not delivered or charged`)
        continue
      }

      // Estado baseado no DDD do telefone (fallback FL se nao US)
      const inferredState = stateFromPhone(phone) || 'FL'

      // Save lead
      const { data: newLead, error } = await supabase
        .from('leads')
        .insert({
          meta_lead_id: lead.id,
          name,
          email,
          phone,
          city: '',
          state: inferredState,
          interest: 'Seguro de vida',
          campaign_name: lead.campaign_name || 'Meta Lead Ads',
          form_name: formId,
          lead_language: META_FORM_LANGUAGES[formId],
          raw_data: lead,
          type: 'hot',
          status: 'new',
          product_type: 'lead',
          created_at: lead.created_time,
        })
        .select()
        .single()

      if (error || !newLead) {
        if (error?.code === '23505') {
          skipped++
          continue
        } // webhook won the insert
        throw new Error(`Lead ${lead.id}: save failed (${error?.code || 'no_row'})`)
      }
      imported++

      // Aplica o modo de roteamento. Sem alvo (modo normal ou fila sequencial
      // esgotada com fallback normal) → distribuicao padrao por creditos/estado.
      let buyer = null
      // 🔑 REGRA DO ADMINISTRADOR: cota diária garantida (ex: Regiane) tem PRIORIDADE
      // sobre o roteamento/distribuição. Respeita estado; só entra se o admin estiver
      // sob a cota do dia. Se não bater, segue o fluxo normal abaixo.
      buyer = await tryAdminRule(newLead, routing?.admin_rule)
      const target = buyer ? null : resolveRoutingTarget(routing)
      if (target && target.emails.length > 0) {
        buyer = await forceAssignRoundRobin(newLead, target.emails)
        // Sequential: conta o lead entregue nessa etapa e persiste no banco
        if (buyer && routing?.mode === 'sequential' && target.stepIndex != null && routing.steps?.[target.stepIndex]) {
          routing.steps[target.stepIndex].delivered = (routing.steps[target.stepIndex].delivered || 0) + 1
          // try/catch: falha ao persistir a contagem NUNCA pode interromper a distribuição
          try {
            await supabase
              .from('settings')
              .upsert({ key: 'lead_routing', value: routing as any, updated_at: new Date().toISOString() })
          } catch (e) {
            console.error('[Poll] falha ao persistir delivered (lead já atribuído ok):', (e as any)?.message)
          }
        }
      }
      if (!buyer) {
        buyer = await distributeLeadToNextBuyer(newLead)
      }
      // Lead chegou mas ficou pendente (ninguém disponível por estado/horário):
      // avisa o grupo MESMO ASSIM — nunca deixar o grupo cego.
      if (!buyer) {
        try {
          await notifyGroupLeadPending(newLead)
        } catch (e) {
          console.error('[Poll] aviso pendente err:', (e as any)?.message)
        }
      }
      console.log(`[Poll] Lead ${newLead.id} — ${name} → ${buyer?.name || 'PENDENTE (grupo avisado)'}`)
    }

    // Reprocessa leads que ficaram pendentes por horário (entrega quando a janela
    // de algum comprador abre). Passa o alvo de roteamento p/ respeitar a mesma
    // programação dos leads novos. try/catch: nunca pode derrubar o poll principal.
    let redistributed = 0
    try {
      const pendTarget = resolveRoutingTarget(routing)
      redistributed = await redistributePendingLeads(pendTarget?.emails || null)
    } catch (e) {
      console.error('[Poll] redistribute err:', (e as any)?.message)
    }

    // Somente encerra ciclos pagos antes de 01/08/2026. Compra nova,
    // re-assinatura e renovação nunca iniciam nem continuam bônus.
    let crmDripped = 0
    try {
      crmDripped = await dripLegacyCrmBonusLeads()
    } catch (e) {
      console.error('[Poll] legacy CRM drip err:', (e as any)?.message)
    }
    // Fila de SMS automático (agendados fora da janela TCPA) — despacha no horário permitido
    try {
      await dispatchScheduledSms()
    } catch (e) {
      console.error('[Poll] sms fila err:', (e as any)?.message)
    }
    // Indicação: libera recompensas cuja carência de 14 dias venceu
    try {
      await releasePendingRewards()
    } catch (e) {
      console.error('[Poll] referral release err:', (e as any)?.message)
    }

    // 🔒 WATCHDOG + RECONCILIAÇÃO (rede de segurança das notificações).
    // 1) Checa a saúde da bridge; se cair, alerta o admin por email (1x/30min).
    // 2) Se a bridge está OK, reenvia os leads atribuídos nas últimas 6h que NÃO
    //    foram notificados (notified_at IS NULL) — pega o que falhou por flap/queda.
    //    Só roda quando a bridge está pronta (não adianta reenviar pra bridge fora).
    let renotified = 0
    let missedCount = 0
    let reconcileError: string | null = null
    let bridgeReady = true
    try {
      bridgeReady = await checkBridgeHealthAndAlert()
    } catch (e) {
      console.error('[Poll] watchdog err:', (e as any)?.message)
    }
    // Monitor de TODAS as bridges (avisa o grupo quando a de qualquer comprador cai).
    let bridgeMonitor: { checked: number; down: number; alerts: number } | null = null
    try {
      bridgeMonitor = await checkAllBridgesAndAlert()
    } catch (e) {
      console.error('[Poll] bridge-monitor err:', (e as any)?.message)
    }
    if (bridgeReady) {
      try {
        const cutoff = new Date(Date.now() - 6 * 3600_000).toISOString()
        // Sem embed (evita ambiguidade do PostgREST entre a coluna assigned_to e o
        // embed de mesmo nome). Busca os leads pendentes e os buyers à parte.
        const { data: missed, error: mErr } = await supabase
          .from('leads')
          .select('id, name, phone, state, interest, assigned_to, created_at, meta_lead_id')
          .not('assigned_to', 'is', null)
          .not('meta_lead_id', 'is', null)
          .is('notified_at', null)
          .gte('assigned_at', cutoff)
          .limit(25)
        if (mErr) throw mErr
        const missedLeads = missed || []
        missedCount = missedLeads.length
        if (missedLeads.length) {
          const ids = [...new Set(missedLeads.map((l: any) => l.assigned_to))]
          // `notification_phone_2` só existe depois da migration 031. Se a coluna não
          // existe, o PostgREST devolve 400 e o select inteiro volta VAZIO → nenhum lead
          // seria notificado. Por isso o fallback: sem a coluna, segue sem o 2º número.
          const COLS = 'id, name, email, phone, notification_email, notification_sms'
          let bsRes: { data: any[] | null; error: any } = await supabase
            .from('buyers')
            .select(`${COLS}, notification_phone_2`)
            .in('id', ids)
          if (bsRes.error) bsRes = await supabase.from('buyers').select(COLS).in('id', ids)
          const bs = bsRes.data
          const bmap = new Map((bs || []).map((b: any) => [b.id, b]))
          for (const lead of missedLeads) {
            const buyer = bmap.get((lead as any).assigned_to)
            if (!buyer) continue
            // sendLeadNotificationEmail carimba notified_at quando grupo+comprador ok
            const ok = await sendLeadNotificationEmail(buyer as any, lead as any)
            if (ok) renotified++
          }
          if (renotified) console.log(`[Poll] reconciliação: ${renotified}/${missedCount} lead(s) reenviado(s)`)
        }
      } catch (e) {
        reconcileError = (e as any)?.message || 'erro'
        console.error('[Poll] reconcile err:', reconcileError)
      }
    }

    const result = {
      status: issues.length ? 'partial' : 'ok',
      trigger:
        request.headers.has('x-vercel-cron-schedule') || request.headers.get('user-agent')?.startsWith('vercel-cron')
          ? 'vercel-cron'
          : 'manual',
      imported,
      skipped,
      remaining,
      issues,
      redistributed,
      crm_dripped: crmDripped,
      renotified,
      missed_count: missedCount,
      reconcile_error: reconcileError,
      bridge_ready: bridgeReady,
      bridge_monitor: bridgeMonitor,
      timestamp: new Date().toISOString(),
    }
    const saved = await supabase.from('settings').upsert({
      key: 'meta_poll_health',
      value: {
        ...result,
        last_started_at: new Date(started).toISOString(),
        duration_ms: Date.now() - started,
        last_success_at: !issues.length && !remaining ? result.timestamp : previousHealth.last_success_at || null,
      },
      updated_at: result.timestamp,
    })
    if (saved.error) throw saved.error
    return NextResponse.json(result, { status: issues.length ? 503 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Meta poll database/transport failure'
    console.error('[Poll] failed:', message)
    if (acquired)
      await supabase.from('settings').upsert({
        key: 'meta_poll_health',
        value: {
          ...previousHealth,
          status: 'error',
          last_started_at: new Date(started).toISOString(),
          failed_at: new Date().toISOString(),
          error: message,
          imported,
        },
        updated_at: new Date().toISOString(),
      })
    return NextResponse.json({ status: 'error', error: message, imported }, { status: 503 })
  } finally {
    if (acquired)
      await releaseMetaPollLease(supabase, owner).catch(() =>
        console.error('[Poll] lease release failed; expires automatically'),
      )
  }
}
