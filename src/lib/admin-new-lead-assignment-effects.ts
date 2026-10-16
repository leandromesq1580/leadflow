type Effect = { id: string; token: string; kind: string; lead_id: string; buyer_id: string; stage_id: string }
type EffectPorts = {
  canNotify(): Promise<boolean>
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
  notify(effect: Effect): Promise<void>
  enroll(effect: Effect): Promise<void>
  automate(effect: Effect): Promise<void>
}
/** Notification uncertainty is durable and quarantined, never automatically resent. */
export async function drainAdminNewLeadAssignmentEffects(ports?: EffectPorts, limit = 5) {
  const io = ports || await runtimePorts()
  const summary = { completed: 0, deferred: 0 }
  for (const kind of ['notification', 'enrollment', 'automation']) {
    if (kind === 'notification' && !await io.canNotify()) continue
    for (let i = 0; i < limit; i++) {
      const claim = await io.rpc('claim_admin_new_lead_effect', { p_kind: kind })
      if (claim.error) throw new Error('effect_claim_unavailable')
      if (!claim.data) break
      const effect = claim.data as Effect
      let state = 'done'
      try {
        if (kind === 'notification') await io.notify(effect)
        else if (kind === 'enrollment') await io.enroll(effect)
        else await io.automate(effect)
      } catch { state = kind === 'notification' ? 'unknown' : 'pending' }
      const finish = await io.rpc('finish_admin_new_lead_effect', { p_id: effect.id, p_token: effect.token, p_state: state })
      if (finish.error || finish.data !== true) throw new Error('effect_finish_unavailable')
      if (state === 'done') summary.completed++
      else summary.deferred++
    }
  }
  return summary
}

async function runtimePorts(): Promise<EffectPorts> {
  const [{ createAdminClient }, { checkBridgeHealthAndAlert, sendLeadNotificationEmail }, { runAutomations }, config] = await Promise.all([
    import('@/lib/supabase/admin'), import('@/lib/notifications'), import('@/lib/automation-engine'), import('@/lib/ai-sequence-config'),
  ])
  const db = createAdminClient()
  return {
    canNotify: async () => { try { return await checkBridgeHealthAndAlert() } catch { return false } },
    rpc: (name, args) => db.rpc(name, args),
    notify: async effect => {
      const [lead, buyer] = await Promise.all([
        db.from('leads').select('*').eq('id', effect.lead_id).eq('assigned_to', effect.buyer_id).single(),
        db.from('buyers').select('*').eq('id', effect.buyer_id).single(),
      ])
      if (lead.error || buyer.error || !lead.data || !buyer.data) throw new Error('notification_read_failed')
      // The shared notifier reads back its guard and notified_at before sending.
      if (!await sendLeadNotificationEmail(buyer.data, lead.data)) throw new Error('notification_unconfirmed')
    },
    automate: async effect => {
      const summary = await runAutomations([effect.buyer_id], [effect.lead_id])
      if (summary.failed) throw new Error('automation_deferred')
    },
    enroll: async effect => {
      const { data, error } = await db.from('sequences').select('id,mode,ai_config')
        .eq('buyer_id', effect.buyer_id).eq('enabled', true).eq('trigger_stage_id', effect.stage_id)
      if (error) throw new Error('sequence_read_failed')
      for (const sequence of data || []) {
        let due: Date
        if (sequence.mode === 'ai_until_reply') {
          const c = config.validateAIConfig(sequence.ai_config)
          due = config.nextSendAt(new Date(Date.now() + c.initial_delay_minutes * 60_000), c)
        } else {
          const first = await db.from('sequence_steps').select('delay_hours').eq('sequence_id', sequence.id).order('step_order').limit(1).maybeSingle()
          if (first.error) throw new Error('sequence_step_read_failed')
          due = new Date(Date.now() + (first.data?.delay_hours || 0) * 3_600_000)
        }
        const enrolled = await db.rpc('enroll_admin_new_lead_sequence', { p_effect: effect.id, p_token: effect.token, p_sequence: sequence.id, p_due: due.toISOString() })
        if (enrolled.error) throw new Error('sequence_enroll_failed')
      }
    },
  }
}
