import { createAdminClient } from '@/lib/supabase/admin'
import { localeDoBuyer, trad } from '@/lib/buyer-locale'
import { renderTemplate } from '@/lib/template-render'
import { resolveSendBridge } from '@/lib/wa-bridge'
import { checkSendRate } from '@/lib/send-guard'
import { Resend } from 'resend'

interface Automation {
  id: string
  buyer_id: string
  name: string
  created_at: string
  trigger_type: 'stage_entered' | 'stage_stale' | 'no_response' | 'meeting_before' | 'event_before'
  trigger_config: { stage_id?: string; hours?: number }
  action_type: 'send_template' | 'move_stage' | 'notify_agent'
  action_config: { template_id?: string; target_stage_id?: string }
  enabled: boolean
}

/**
 * Run enabled automations for a given buyer.
 * Called by cron (every 30min) and on pipeline_lead stage changes.
 */
export async function runAutomations(buyerIds?: string[]): Promise<{ ran: number; failed: number }> {
  const db = createAdminClient()
  let query = db.from('automations').select('*').eq('enabled', true)
  if (buyerIds && buyerIds.length > 0) query = query.in('buyer_id', buyerIds)

  const { data: automations } = await query
  if (!automations || automations.length === 0) return { ran: 0, failed: 0 }

  let ran = 0, failed = 0

  for (const auto of automations as Automation[]) {
    try {
      const targets = await findTargets(auto)
      for (const target of targets) {
        // Idempotency: (automation_id, lead_id, meeting_id) — meeting_id NULL para triggers sem reunião
        let existingQuery = db
          .from('automation_runs')
          .select('id')
          .eq('automation_id', auto.id)
        existingQuery = target.lead_id
          ? existingQuery.eq('lead_id', target.lead_id)
          : existingQuery.is('lead_id', null)
        existingQuery = target.meeting_id
          ? existingQuery.eq('meeting_id', target.meeting_id)
          : existingQuery.is('meeting_id', null)
        const { data: existing } = await existingQuery.maybeSingle()
        if (existing) continue

        // 🛑 TRAVA PERSISTENTE (incidente 2026-07-31): automation_runs é apagado por
        // CASCADE quando a automação é deletada — recriar zerava a trava e reenviava
        // pra TODOS os leads (o mesmo lead recebeu 17x). O follow-up NÃO tem FK com a
        // automação, então sobrevive: se este lead já recebeu ESTE template por
        // automação nos últimos 7 dias, não reenvia.
        if (target.lead_id && auto.action_type === 'send_template' && auto.action_config?.template_id) {
          const { data: tpl } = await db.from('templates').select('name')
            .eq('id', auto.action_config.template_id).maybeSingle()
          if (tpl?.name) {
            const desde = new Date(Date.now() - 7 * 86400_000).toISOString()
            const { data: jaEnviou } = await db.from('follow_ups')
              .select('id').eq('lead_id', target.lead_id)
              .like('description', `[Automação]%${tpl.name}`)
              .gte('created_at', desde).limit(1).maybeSingle()
            if (jaEnviou) {
              console.log(`[automation] pulando ${target.lead_id}: já recebeu "${tpl.name}" por automação nos últimos 7 dias`)
              continue
            }
          }
        }

        // 🔒 RESERVA ANTES DE ENVIAR (corrida provada no incidente 2026-07-31: o mesmo
        // lead recebeu 3 msgs em 0,7s e houve 85 casos de duplicata no MESMO segundo).
        // Antes: checava → ENVIAVA → só então gravava o run. Duas execuções do cron em
        // paralelo passavam juntas pela checagem e ambas enviavam (a janela era o tempo
        // do envio, que tem retry). Agora o INSERT vem primeiro: o UNIQUE
        // (automation_id, lead_id) do banco é o lock atômico — quem perder a corrida
        // recebe erro de duplicidade e PULA, sem enviar nada.
        const { data: reserva, error: reservaErr } = await db.from('automation_runs').insert({
          automation_id: auto.id,
          lead_id: target.lead_id,
          pipeline_lead_id: target.pipeline_lead_id || null,
          meeting_id: target.meeting_id || null,
          meeting_source: target.meeting_source || null,
          status: 'skipped', // vira success/failed depois do envio
        }).select('id').maybeSingle()

        if (reservaErr) {
          if (/duplicate|unique/i.test(reservaErr.message)) {
            console.log(`[automation] corrida evitada: ${target.lead_id || target.meeting_id} já reservado por outra execução`)
          } else if (/null value in column "lead_id"|violates not-null/i.test(reservaErr.message)) {
            console.error('[automation] gatilho de evento da agenda exige a migration 037 (automation_runs.lead_id nulo)')
          } else {
            console.error('[automation] reserva falhou:', reservaErr.message)
          }
          continue
        }

        try {
          await executeAction(auto, target)
          if (reserva?.id) await db.from('automation_runs').update({ status: 'success' }).eq('id', reserva.id)
          ran++
        } catch (err: any) {
          if (reserva?.id) {
            await db.from('automation_runs').update({
              status: 'failed', error: err?.message?.slice(0, 500) || 'Unknown error',
            }).eq('id', reserva.id)
          }
          failed++
        }
      }
    } catch (err) {
      console.error(`[Automation ${auto.id}] Engine error:`, err)
    }
  }

  return { ran, failed }
}

interface Target {
  /** null = evento da agenda sem cliente vinculado (só ação de avisar o corretor) */
  lead_id: string | null
  pipeline_lead_id?: string | null
  meeting_id?: string | null
  meeting_source?: 'appointment' | 'calendar_item' | 'follow_up' | null
  /** título do evento, pra escrever o aviso quando não há cliente */
  titulo?: string | null
  quando?: string | null
}

async function findTargets(auto: Automation): Promise<Target[]> {
  const db = createAdminClient()

  // pipeline_leads NAO tem buyer_id. Pegamos os pipelines do buyer
  // primeiro, depois filtramos pipeline_leads por pipeline_id.
  // Bug historico: usar .eq('buyer_id', X) em pipeline_leads retorna 0
  // sempre (coluna nao existe) -> automacao nunca disparava.
  async function pipelineIdsOfBuyer(buyerId: string): Promise<string[]> {
    const { data } = await db.from('pipelines').select('id').eq('buyer_id', buyerId)
    return (data || []).map(p => p.id)
  }

  if (auto.trigger_type === 'stage_entered') {
    const stageId = auto.trigger_config.stage_id
    if (!stageId) return []
    const pipelineIds = await pipelineIdsOfBuyer(auto.buyer_id)
    if (pipelineIds.length === 0) return []
    // 🛑 NÃO RETROATIVO (incidente 2026-07-31): antes pegava TODOS os leads que já
    // estavam no estágio — criar a automação disparava de uma vez pra base inteira
    // (85 leads na conta da Raquel). Agora só quem ENTROU no estágio depois que a
    // automação foi criada.
    const { data } = await db
      .from('pipeline_leads')
      .select('id, lead_id')
      .eq('stage_id', stageId)
      .in('pipeline_id', pipelineIds)
      .gte('moved_at', auto.created_at)
    return (data || []).map(r => ({ lead_id: r.lead_id, pipeline_lead_id: r.id }))
  }

  if (auto.trigger_type === 'stage_stale') {
    const stageId = auto.trigger_config.stage_id
    const hours = auto.trigger_config.hours || 24
    if (!stageId) return []
    const pipelineIds = await pipelineIdsOfBuyer(auto.buyer_id)
    if (pipelineIds.length === 0) return []
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
    const { data } = await db
      .from('pipeline_leads')
      .select('id, lead_id')
      .eq('stage_id', stageId)
      .in('pipeline_id', pipelineIds)
      .lte('moved_at', cutoff)
    return (data || []).map(r => ({ lead_id: r.lead_id, pipeline_lead_id: r.id }))
  }

  if (auto.trigger_type === 'no_response') {
    const hours = auto.trigger_config.hours || 48
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
    // Leads assigned to this buyer with no incoming activity since cutoff
    const { data: leads } = await db
      .from('leads')
      .select('id')
      .eq('assigned_to', auto.buyer_id)
      .lte('created_at', cutoff)
    return (leads || []).map(r => ({ lead_id: r.id }))
  }

  if (auto.trigger_type === 'meeting_before') {
    // Dispara quando uma reunião está a ~hours horas de acontecer.
    // Cron roda a cada 30min → janela de 35min antes do alvo + 5min de folga.
    const hours = auto.trigger_config.hours || 1
    const targetMs = Date.now() + hours * 60 * 60 * 1000
    const lower = new Date(targetMs - 35 * 60 * 1000).toISOString()
    const upper = new Date(targetMs + 5 * 60 * 1000).toISOString()

    const [apptRes, itemRes, fuRes] = await Promise.all([
      db.from('appointments')
        .select('id, lead_id')
        .eq('buyer_id', auto.buyer_id)
        .gte('scheduled_at', lower)
        .lte('scheduled_at', upper)
        .in('status', ['scheduled', 'confirmed']),
      db.from('calendar_items')
        .select('id, lead_id')
        .eq('buyer_id', auto.buyer_id)
        .eq('kind', 'event')
        .not('lead_id', 'is', null)
        .gte('start_at', lower)
        .lte('start_at', upper)
        .is('completed_at', null),
      // Follow-ups type='meeting' — reunioes criadas no modal do lead
      // caem aqui (nao em appointments/calendar_items)
      db.from('follow_ups')
        .select('id, lead_id')
        .eq('buyer_id', auto.buyer_id)
        .eq('type', 'meeting')
        .gte('scheduled_at', lower)
        .lte('scheduled_at', upper)
        .is('completed_at', null),
    ])

    const targets: Target[] = []
    for (const a of apptRes.data || []) {
      if (a.lead_id) targets.push({ lead_id: a.lead_id, meeting_id: a.id, meeting_source: 'appointment' })
    }
    for (const c of itemRes.data || []) {
      if (c.lead_id) targets.push({ lead_id: c.lead_id, meeting_id: c.id, meeting_source: 'calendar_item' })
    }
    for (const f of fuRes.data || []) {
      if (f.lead_id) targets.push({ lead_id: f.lead_id, meeting_id: f.id, meeting_source: 'follow_up' })
    }
    // 🔒 A MESMA reunião pode existir em appointments E follow_ups (agendamento do
    // site grava nas duas: agenda + timeline do lead — 18/08). Um lembrete por
    // lead nesse horário; a ordem acima já prioriza appointment.
    const jaTem = new Set<string>()
    return targets.filter(t => {
      if (!t.lead_id) return true
      if (jaTem.has(t.lead_id)) return false
      jaTem.add(t.lead_id)
      return true
    })
  }

  if (auto.trigger_type === 'event_before') {
    // Evento da AGENDA — com ou sem cliente vinculado. É a diferença pro gatilho de
    // reunião: aquele exige lead, e evento de agenda quase nunca tem (74 no sistema,
    // nenhum com lead). Sem cliente, a ação possível é avisar o corretor.
    const hours = auto.trigger_config.hours || 1
    const targetMs = Date.now() + hours * 60 * 60 * 1000
    const lower = new Date(targetMs - 35 * 60 * 1000).toISOString()
    const upper = new Date(targetMs + 5 * 60 * 1000).toISOString()

    const { data } = await db.from('calendar_items')
      .select('id, lead_id, title, start_at')
      .eq('buyer_id', auto.buyer_id)
      .eq('kind', 'event')
      .gte('start_at', lower)
      .lte('start_at', upper)
      .is('completed_at', null)

    return (data || []).map(e => ({
      lead_id: e.lead_id || null,
      meeting_id: e.id,
      meeting_source: 'calendar_item' as const,
      titulo: e.title || null,
      quando: e.start_at || null,
    }))
  }

  return []
}

async function executeAction(auto: Automation, target: Target): Promise<void> {
  const db = createAdminClient()

  if (auto.action_type === 'send_template') {
    const templateId = auto.action_config.template_id
    if (!templateId) throw new Error('Missing template_id')
    // evento de agenda sem cliente: não há pra quem mandar
    if (!target.lead_id) throw new Error('Evento sem cliente vinculado — não há destinatário para o template')

    const [{ data: template }, { data: lead }, { data: agent }] = await Promise.all([
      db.from('templates').select('*').eq('id', templateId).single(),
      db.from('leads').select('*').eq('id', target.lead_id).single(),
      db.from('buyers').select('name, email, phone, is_active').eq('id', auto.buyer_id).single(),
    ])

    if (!template || !lead || !agent) throw new Error('Template/lead/agent not found')
    // Comprador suspenso: não dispara automação
    if (agent.is_active === false) { console.log(`[Automation] buyer ${auto.buyer_id} suspenso — skip`); return }

    const body = renderTemplate(template.body, lead, agent)

    if (template.type === 'whatsapp') {
      if (!lead.phone) throw new Error('Lead sem telefone')
      // Envia pela bridge do DONO do lead (não pela global/Regiane)
      // 🛑 LIMITADOR por conta — automação também respeita o teto (2026-07-31)
      const rate = await checkSendRate(db, auto.buyer_id)
      if (!rate.ok) { console.error('[automation] envio bloqueado pelo limitador:', rate.reason); return }
      const sb = await resolveSendBridge(db, auto.buyer_id)
      const cleanPhone = lead.phone.replace(/[\s\-()]/g, '').replace(/^\+/, '')
      const res = await fetch(`${sb.url}/send`, {
        method: 'POST',
        headers: { apikey: sb.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: cleanPhone, message: body }),
      })
      if (!res.ok) throw new Error(`wa-bridge ${res.status}`)
      const { id: waId } = await res.json().catch(() => ({ id: null }))

      // Salva na thread de conversa
      await db.from('whatsapp_messages').insert({
        buyer_id: auto.buyer_id,
        lead_id: target.lead_id,
        direction: 'out',
        from_phone: sb.phone,
        to_phone: cleanPhone,
        body,
        wa_message_id: waId,
        status: 'sent',
      })
    } else {
      if (!lead.email) throw new Error('Lead sem email')
      const resendKey = (process.env.RESEND_API_KEY || '').trim()
      if (!resendKey) throw new Error('Resend not configured')
      const resend = new Resend(resendKey)
      const subject = template.subject ? renderTemplate(template.subject, lead, agent) : `Mensagem de ${agent.name}`
      await resend.emails.send({
        from: `${agent.name} <onboarding@resend.dev>`,
        to: lead.email,
        subject,
        html: body.replace(/\n/g, '<br/>'),
      })
    }

    await db.from('follow_ups').insert({
      lead_id: target.lead_id,
      buyer_id: auto.buyer_id,
      type: template.type,
      description: `[Automação] ${auto.name} → ${template.name}`,
      completed_at: new Date().toISOString(),
    })
    return
  }

  if (auto.action_type === 'move_stage') {
    const targetStageId = auto.action_config.target_stage_id
    if (!target.lead_id) throw new Error('Evento sem cliente vinculado — não há lead para mover')
    if (!targetStageId || !target.pipeline_lead_id) throw new Error('Missing stage or pipeline_lead')
    await db.from('pipeline_leads').update({
      stage_id: targetStageId,
      moved_at: new Date().toISOString(),
    }).eq('id', target.pipeline_lead_id)
    return
  }

  if (auto.action_type === 'notify_agent') {
    const { data: lead } = target.lead_id
      ? await db.from('leads').select('name, phone, email').eq('id', target.lead_id).single()
      : { data: null as any }
    const { data: agent } = await db.from('buyers').select('email, notification_email').eq('id', auto.buyer_id).single()
    if (!agent?.notification_email || !agent.email) return

    const resendKey = (process.env.RESEND_API_KEY || '').trim()
    if (!resendKey) return
    const resend = new Resend(resendKey)

    // Idioma do corretor (settings, via buyer-locale) — cron não vê cookie; falha vira 'pt'
    const loc = await localeDoBuyer(db, auto.buyer_id)
    const T = trad(loc)

    // Evento da agenda sem cliente: o aviso fala do compromisso, não de um lead.
    const hora = target.quando
      ? new Date(target.quando).toLocaleString(loc === 'en' ? 'en-US' : loc === 'es' ? 'es-US' : 'pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : null
    const corpo = target.lead_id
      ? T(
          `<p>Sua automação <b>${auto.name}</b> detectou o lead <b>${lead?.name || target.lead_id}</b> (${lead?.phone || lead?.email || 'sem contato'}).</p><p><a href="https://lead4producers.com/dashboard/pipeline">Abrir pipeline →</a></p>`,
          `<p>Your automation <b>${auto.name}</b> detected the lead <b>${lead?.name || target.lead_id}</b> (${lead?.phone || lead?.email || 'no contact info'}).</p><p><a href="https://lead4producers.com/dashboard/pipeline">Open pipeline →</a></p>`,
          `<p>Tu automatización <b>${auto.name}</b> detectó el lead <b>${lead?.name || target.lead_id}</b> (${lead?.phone || lead?.email || 'sin contacto'}).</p><p><a href="https://lead4producers.com/dashboard/pipeline">Abrir pipeline →</a></p>`
        )
      : T(
          `<p>Lembrete do seu compromisso: <b>${target.titulo || 'Evento da agenda'}</b>${hora ? ` — ${hora}` : ''}.</p><p><a href="https://lead4producers.com/dashboard/agenda">Abrir agenda →</a></p>`,
          `<p>Reminder for your event: <b>${target.titulo || 'Calendar event'}</b>${hora ? ` — ${hora}` : ''}.</p><p><a href="https://lead4producers.com/dashboard/agenda">Open calendar →</a></p>`,
          `<p>Recordatorio de tu compromiso: <b>${target.titulo || 'Evento de la agenda'}</b>${hora ? ` — ${hora}` : ''}.</p><p><a href="https://lead4producers.com/dashboard/agenda">Abrir agenda →</a></p>`
        )

    await resend.emails.send({
      from: 'Lead4Producers <noreply@resend.dev>',
      to: agent.email,
      subject: `⏰ ${target.lead_id ? T(`Automação: ${auto.name}`, `Automation: ${auto.name}`, `Automatización: ${auto.name}`) : target.titulo || auto.name}`,
      html: corpo,
    })
    return
  }

  throw new Error(`Unknown action: ${auto.action_type}`)
}
