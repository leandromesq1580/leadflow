import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributeLeadToNextBuyer, forceAssignRoundRobin } from '@/lib/distribute'
import { stateFromPhone } from '@/lib/us-area-codes'

const FORM_IDS = [
  '25952858404333766',  // FORMULARIO SEGURO-SEM PERGUNTA (principal)
  '1963007337624994',   // FORMULARIO SEGURO-SEM PERGUNTA-ESPANHOL
]

interface RoutingStep { email: string; limit: number; delivered: number }
interface LeadRouting {
  mode: 'normal' | 'exclusive' | 'random' | 'roundrobin' | 'sequential'
  exclusive_email?: string | null
  pool_emails?: string[]
  steps?: RoutingStep[]
  fallback_mode?: 'normal' | 'exclusive'
  fallback_email?: string | null
}

/**
 * Decide o(s) email(s) alvo pra um lead conforme o modo de roteamento.
 * Retorna null = usar distribuicao normal (creditos/estado).
 * stepIndex (sequential) indica qual etapa contar como entregue.
 */
function resolveRoutingTarget(r: LeadRouting | null): { emails: string[]; stepIndex?: number } | null {
  if (!r || !r.mode || r.mode === 'normal') return null
  if (r.mode === 'exclusive') return r.exclusive_email ? { emails: [r.exclusive_email] } : null
  if (r.mode === 'roundrobin') return (r.pool_emails || []).filter(Boolean).length ? { emails: (r.pool_emails || []).filter(Boolean) } : null
  if (r.mode === 'random') {
    const pool = (r.pool_emails || []).filter(Boolean)
    return pool.length ? { emails: [pool[Math.floor(Math.random() * pool.length)]] } : null
  }
  if (r.mode === 'sequential') {
    const steps = r.steps || []
    const idx = steps.findIndex(s => (s.delivered || 0) < (s.limit || 0))
    if (idx >= 0) return { emails: [steps[idx].email], stepIndex: idx }
    // fila esgotada → fallback (exclusive p/ um email, ou normal)
    if (r.fallback_mode === 'exclusive' && r.fallback_email) return { emails: [r.fallback_email] }
    return null
  }
  return null
}

/**
 * GET /api/poll-leads — Polls Meta Graph API for new leads not yet in DB.
 * Workaround while app is in Development mode (webhooks don't fire for real users).
 * Called by cron every 2 minutes.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'lead4producers-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pageToken = (process.env.META_PAGE_TOKEN || '').trim().replace(/\\n/g, '')
  if (!pageToken) {
    return NextResponse.json({ error: 'No META_PAGE_TOKEN' }, { status: 500 })
  }

  const supabase = createAdminClient()
  let imported = 0
  let skipped = 0

  // Roteamento de leads (admin → Configuracoes → Roteamento de Leads). Lido do banco.
  // Modos: normal | exclusive | random | roundrobin | sequential. Sem config = normal.
  let routing: LeadRouting | null = null
  try {
    const { data: lr } = await supabase.from('settings').select('value').eq('key', 'lead_routing').maybeSingle()
    routing = (lr?.value as LeadRouting) || null
  } catch {}

  for (const formId of FORM_IDS) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v25.0/${formId}/leads?fields=id,created_time,field_data&limit=20&access_token=${pageToken}`
      )
      const data = await res.json()
      if (data.error) {
        console.error(`[Poll] Form ${formId} error:`, data.error.message)
        continue
      }

      for (const lead of data.data || []) {
        // Check duplicate
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .eq('meta_lead_id', lead.id)
          .single()

        if (existing) {
          skipped++
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
            campaign_name: 'Meta Lead Ads',
            form_name: formId,
            raw_data: lead,
            type: 'hot',
            status: 'new',
            product_type: 'lead',
            created_at: lead.created_time,
          })
          .select()
          .single()

        if (error || !newLead) {
          console.error('[Poll] Save failed:', error)
          continue
        }

        // Aplica o modo de roteamento. Sem alvo (modo normal ou fila sequencial
        // esgotada com fallback normal) → distribuicao padrao por creditos/estado.
        let buyer = null
        const target = resolveRoutingTarget(routing)
        if (target && target.emails.length > 0) {
          buyer = await forceAssignRoundRobin(newLead, target.emails)
          // Sequential: conta o lead entregue nessa etapa e persiste no banco
          if (buyer && routing?.mode === 'sequential' && target.stepIndex != null && routing.steps?.[target.stepIndex]) {
            routing.steps[target.stepIndex].delivered = (routing.steps[target.stepIndex].delivered || 0) + 1
            // try/catch: falha ao persistir a contagem NUNCA pode interromper a distribuição
            try {
              await supabase.from('settings').upsert({ key: 'lead_routing', value: routing as any, updated_at: new Date().toISOString() })
            } catch (e) {
              console.error('[Poll] falha ao persistir delivered (lead já atribuído ok):', (e as any)?.message)
            }
          }
        }
        if (!buyer) {
          buyer = await distributeLeadToNextBuyer(newLead)
        }
        console.log(`[Poll] Lead ${newLead.id} — ${name} → ${buyer?.name || 'no buyer'}`)
        imported++
      }
    } catch (err) {
      console.error(`[Poll] Form ${formId} fetch error:`, err)
    }
  }

  return NextResponse.json({
    status: 'ok',
    imported,
    skipped,
    timestamp: new Date().toISOString(),
  })
}
