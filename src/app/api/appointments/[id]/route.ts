import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** Soma o saldo de appointment de um buyer. */
async function apptRemaining(db: ReturnType<typeof createAdminClient>, buyerId: string) {
  const { data } = await db.from('credits')
    .select('id, total_purchased, total_used, purchased_at')
    .eq('buyer_id', buyerId).eq('type', 'appointment')
    .order('purchased_at', { ascending: true })
  const rows = data || []
  const remaining = rows.reduce((s, c) => s + (c.total_purchased - c.total_used), 0)
  return { rows, remaining }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const db = createAdminClient()

  const { data: current } = await db.from('appointments').select('buyer_id, lead_id').eq('id', id).single()
  if (!current) return NextResponse.json({ error: 'Appointment não encontrado' }, { status: 404 })

  const update: Record<string, unknown> = {}
  if (body.scheduled_at !== undefined) update.scheduled_at = body.scheduled_at
  if (body.status !== undefined) update.status = body.status
  if (body.qualification_notes !== undefined) update.qualification_notes = body.qualification_notes

  // Troca de cliente: abate do novo + devolve pro antigo (ajuste de crédito)
  if (body.buyer_id && body.buyer_id !== current.buyer_id) {
    const { rows: newRows, remaining: newRem } = await apptRemaining(db, body.buyer_id)
    if (newRem <= 0) {
      return NextResponse.json({ error: 'O novo cliente não tem saldo de appointments.' }, { status: 400 })
    }
    // abate 1 do novo (crédito mais antigo com saldo)
    const useCredit = newRows.find(c => (c.total_purchased - c.total_used) > 0)
    if (useCredit) await db.from('credits').update({ total_used: useCredit.total_used + 1 }).eq('id', useCredit.id)
    // devolve 1 pro antigo
    const { data: oldCredit } = await db.from('credits')
      .select('id, total_used').eq('buyer_id', current.buyer_id).eq('type', 'appointment')
      .gt('total_used', 0).order('purchased_at', { ascending: false }).limit(1).maybeSingle()
    if (oldCredit) await db.from('credits').update({ total_used: Math.max(0, oldCredit.total_used - 1) }).eq('id', oldCredit.id)

    update.buyer_id = body.buyer_id
    await db.from('leads').update({ assigned_to: body.buyer_id }).eq('id', current.lead_id)
  }

  const { data, error } = await db.from('appointments').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ appointment: data })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()

  // Excluir devolve 1 crédito de appointment pro cliente
  const { data: appt } = await db.from('appointments').select('buyer_id').eq('id', id).single()
  if (appt?.buyer_id) {
    const { data: c } = await db.from('credits')
      .select('id, total_used').eq('buyer_id', appt.buyer_id).eq('type', 'appointment')
      .gt('total_used', 0).order('purchased_at', { ascending: false }).limit(1).maybeSingle()
    if (c) await db.from('credits').update({ total_used: Math.max(0, c.total_used - 1) }).eq('id', c.id)
  }

  const { error } = await db.from('appointments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
