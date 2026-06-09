import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { toE164, renderSmsBody, smsSegments, twilioConfigured } from '@/lib/twilio'

/**
 * POST /api/admin/sms/campaign — cria a campanha e ENFILEIRA os destinatários.
 * Body: { name, body, filters: { states?: string[], buyer_id?: string, days?: number }, dry_run?: boolean }
 * dry_run=true → só calcula o público (total + estimativa), não cria nada.
 * O envio em si é feito em lotes pelo /api/admin/sms/dispatch.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: me } = await db.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, body, filters = {}, dry_run } = await request.json().catch(() => ({} as any))
  if (!body?.trim()) return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })
  if (!dry_run && !name?.trim()) return NextResponse.json({ error: 'Nome da campanha vazio' }, { status: 400 })
  if (!dry_run && !twilioConfigured()) {
    return NextResponse.json({ error: 'Twilio não configurado — adicione TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_FROM_NUMBER nas env vars.' }, { status: 400 })
  }

  // Público: leads com telefone, sem opt-out, conforme filtros
  let q = db.from('leads').select('id, name, phone, state').not('phone', 'is', null)
  // sms_opted_out pode não existir se a migration 017 não rodou — tolera
  let leads: any[] = []
  {
    const r1 = await q.eq('sms_opted_out', false).limit(10000)
    if (r1.error && /sms_opted_out/i.test(r1.error.message || '')) {
      const r2 = await db.from('leads').select('id, name, phone, state').not('phone', 'is', null).limit(10000)
      if (r2.error) return NextResponse.json({ error: r2.error.message }, { status: 500 })
      leads = r2.data || []
    } else if (r1.error) {
      return NextResponse.json({ error: r1.error.message }, { status: 500 })
    } else {
      leads = r1.data || []
    }
  }

  // Filtros aplicados em memória (volume atual é pequeno; simples > SQL dinâmico)
  if (filters.states?.length) {
    const set = new Set((filters.states as string[]).map(s => s.toUpperCase()))
    leads = leads.filter(l => l.state && set.has(String(l.state).toUpperCase()))
  }
  if (filters.buyer_id) {
    const { data: own } = await db.from('leads').select('id').eq('assigned_to', filters.buyer_id).limit(10000)
    const ids = new Set((own || []).map(o => o.id))
    leads = leads.filter(l => ids.has(l.id))
  }
  if (filters.days && Number(filters.days) > 0) {
    const cutoff = Date.now() - Number(filters.days) * 86400_000
    const { data: recents } = await db.from('leads').select('id, created_at').gte('created_at', new Date(cutoff).toISOString()).limit(10000)
    const ids = new Set((recents || []).map(o => o.id))
    leads = leads.filter(l => ids.has(l.id))
  }

  // Telefone válido + dedupe por número
  const seen = new Set<string>()
  const targets: { lead: any; to: string }[] = []
  for (const l of leads) {
    const to = toE164(l.phone)
    if (!to || seen.has(to)) continue
    seen.add(to)
    targets.push({ lead: l, to })
  }

  const sample = targets[0]?.lead
  const renderedSample = sample ? renderSmsBody(body, sample) : body
  const estimate = {
    total: targets.length,
    segments_per_msg: smsSegments(renderedSample),
    est_cost_usd: Math.round(targets.length * smsSegments(renderedSample) * 0.0079 * 100) / 100,
    sample_rendered: renderedSample.slice(0, 320),
  }

  if (dry_run) return NextResponse.json({ dry_run: true, ...estimate })
  if (targets.length === 0) return NextResponse.json({ error: 'Nenhum destinatário com telefone válido nesse filtro.' }, { status: 400 })

  const { data: camp, error: cErr } = await db.from('sms_campaigns')
    .insert({ name: name.trim(), body, filters, total: targets.length, status: 'sending' })
    .select().single()
  if (cErr) return NextResponse.json({ error: 'Criação da campanha falhou (migration 017 aplicada?): ' + cErr.message }, { status: 500 })

  // Enfileira em lotes de 500 inserts
  for (let i = 0; i < targets.length; i += 500) {
    const chunk = targets.slice(i, i + 500).map(t => ({
      campaign_id: camp.id,
      lead_id: t.lead.id,
      direction: 'out',
      to_phone: t.to,
      body: renderSmsBody(body, t.lead),
      status: 'queued',
    }))
    const { error: mErr } = await db.from('sms_messages').insert(chunk)
    if (mErr) return NextResponse.json({ error: 'Enfileiramento falhou: ' + mErr.message }, { status: 500 })
  }

  return NextResponse.json({ campaign_id: camp.id, ...estimate })
}
