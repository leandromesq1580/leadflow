import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendAppointmentNotificationEmail } from '@/lib/notifications'

/**
 * POST /api/admin/create-appointment  (admin-only)
 * Body: { lead_id, buyer_id, scheduled_at (ISO), notes? }
 *
 * Entrega um APPOINTMENT (produto pago) pro cliente que comprou:
 *  - cria na tabela `appointments` (status=scheduled)
 *  - marca o lead como `appointment_set` e atribui ao cliente
 *  - abate 1 crédito de appointment do cliente
 *  - notifica o cliente
 * BLOQUEIA se o cliente não tiver saldo de appointments.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: me } = await db.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { lead_id, buyer_id, scheduled_at, notes } = await request.json()
  if (!lead_id || !buyer_id || !scheduled_at) {
    return NextResponse.json({ error: 'Faltam lead, comprador ou data/hora' }, { status: 400 })
  }

  // Saldo de appointments do cliente (precisa ter comprado e ter saldo)
  const { data: credits } = await db.from('credits')
    .select('id, total_purchased, total_used, purchased_at')
    .eq('buyer_id', buyer_id).eq('type', 'appointment')
    .order('purchased_at', { ascending: true })
  const remaining = (credits || []).reduce((s, c) => s + (c.total_purchased - c.total_used), 0)
  if (remaining <= 0) {
    return NextResponse.json({ error: 'Esse cliente não tem saldo de appointments (não comprou ou já usou tudo).' }, { status: 400 })
  }

  // 1) Cria o appointment (produto) na tabela appointments
  const { error: apptErr } = await db.from('appointments').insert({
    lead_id, buyer_id, scheduled_at,
    qualification_notes: notes || '',
    status: 'scheduled',
  })
  if (apptErr) return NextResponse.json({ error: 'Falha ao criar appointment: ' + apptErr.message }, { status: 500 })

  // 2) Marca o lead como appointment_set + entrega pro cliente
  await db.from('leads').update({
    status: 'appointment_set',
    assigned_to: buyer_id,
    assigned_at: new Date().toISOString(),
  }).eq('id', lead_id)

  // 3) Abate 1 crédito de appointment (o mais antigo com saldo)
  const creditToUse = (credits || []).find(c => (c.total_purchased - c.total_used) > 0)
  if (creditToUse) {
    await db.from('credits').update({ total_used: creditToUse.total_used + 1 }).eq('id', creditToUse.id)
  }

  // 4) Notifica o cliente
  try {
    const { data: buyer } = await db.from('buyers').select('name, email, phone').eq('id', buyer_id).single()
    const { data: lead } = await db.from('leads').select('name, phone, city, state, interest').eq('id', lead_id).single()
    if (buyer && lead) await sendAppointmentNotificationEmail(buyer as any, lead as any, scheduled_at, notes || '')
  } catch (e) { console.error('[Appt] notify:', (e as any)?.message) }

  return NextResponse.json({ success: true, remaining: remaining - 1 })
}
