import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { migrateWhatsAppOwnership } from '@/lib/lead-ownership'

/**
 * POST /api/admin/create-appointment  (admin-only)
 * Body: { lead_id, buyer_id, scheduled_at (ISO), description?, reassign? }
 *
 * Cria uma reunião (follow-up type=meeting) na AGENDA do comprador escolhido.
 * A agenda (`/api/appointments/calendar`) já lê follow_ups por buyer_id, então
 * o evento aparece automaticamente pra esse comprador.
 * Se reassign=true, também repassa o lead pro comprador (mesma lógica do reassign-lead).
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: me } = await db.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { lead_id, buyer_id, scheduled_at, description, reassign } = await request.json()
  if (!lead_id || !buyer_id || !scheduled_at) {
    return NextResponse.json({ error: 'Faltam lead_id, buyer_id ou data/hora' }, { status: 400 })
  }

  const { data: lead } = await db.from('leads').select('*').eq('id', lead_id).single()
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  const { data: buyer } = await db.from('buyers').select('id, name').eq('id', buyer_id).single()
  if (!buyer) return NextResponse.json({ error: 'Comprador não encontrado' }, { status: 404 })

  // 1) Cria a reunião na agenda do comprador (follow-up meeting com data/hora)
  const { error: fuErr } = await db.from('follow_ups').insert({
    lead_id,
    buyer_id,
    type: 'meeting',
    description: description || null,
    scheduled_at,
  })
  if (fuErr) return NextResponse.json({ error: 'Falha ao criar reunião: ' + fuErr.message }, { status: 500 })

  // 2) Repasse opcional: lead passa a pertencer ao comprador + entra no pipeline dele
  if (reassign) {
    await db.from('leads').update({
      assigned_to: buyer_id,
      assigned_to_member: null,
      assigned_at: new Date().toISOString(),
      status: 'assigned',
    }).eq('id', lead_id)

    await db.from('pipeline_leads').delete().eq('lead_id', lead_id)

    const { data: pipe } = await db.from('pipelines')
      .select('id, stages:pipeline_stages(id, position)')
      .eq('buyer_id', buyer_id).eq('is_default', true).maybeSingle()
    if (pipe?.stages?.length) {
      const firstStage = (pipe.stages as any[]).sort((a, b) => a.position - b.position)[0]
      await db.from('pipeline_leads').upsert({
        lead_id, pipeline_id: pipe.id, stage_id: firstStage.id,
        position: 0, moved_at: new Date().toISOString(),
      }, { onConflict: 'lead_id,pipeline_id' })
    }

    try { await migrateWhatsAppOwnership(db, lead_id, buyer_id) } catch (e) { console.error('[Appt] WA migrate:', (e as any)?.message) }
  }

  return NextResponse.json({ success: true, buyer: buyer.name, reassigned: !!reassign })
}
