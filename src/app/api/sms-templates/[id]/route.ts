import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { validateSmsTemplate } from '@/lib/sms-call-choice'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function own(id: string) {
  const db = createAdminClient()
  const me = await callerBuyer(db)
  if (!me) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const
  if (!uuid.test(id)) return { error: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) } as const
  const { data } = await db.from('sms_templates').select('id, name, body, is_default').eq('id', id).eq('buyer_id', me.id).maybeSingle()
  if (!data) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) } as const
  return { db, me, row: data } as const
}

/** PATCH: edita nome/texto e/ou marca como padrão (is_default true|false). Só modelo do próprio comprador. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await own(id)
  if ('error' in r) return r.error
  const input = await request.json().catch(() => null)
  if (!input || typeof input !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined || input.body !== undefined) {
    const v = validateSmsTemplate({ name: input.name ?? r.row.name, body: input.body ?? r.row.body })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    update.name = v.name; update.body = v.body
  }
  if (input.is_default !== undefined) {
    if (typeof input.is_default !== 'boolean') return NextResponse.json({ error: 'Invalid is_default' }, { status: 400 })
    if (input.is_default) {
      const off = await r.db.from('sms_templates').update({ is_default: false }).eq('buyer_id', r.me.id).eq('is_default', true).neq('id', id)
      if (off.error) return NextResponse.json({ error: 'Não foi possível salvar.' }, { status: 500 })
    }
    update.is_default = input.is_default
  }
  const { data, error } = await r.db.from('sms_templates').update(update).eq('id', id).eq('buyer_id', r.me.id).select('id, name, body, is_default, created_at').single()
  if (error) return NextResponse.json({ error: 'Não foi possível salvar.' }, { status: 500 })
  return NextResponse.json({ template: data })
}

/** DELETE: remove o próprio modelo. Escolhas em curso que o usavam caem no padrão. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await own(id)
  if ('error' in r) return r.error
  const { error } = await r.db.from('sms_templates').delete().eq('id', id).eq('buyer_id', r.me.id)
  if (error) return NextResponse.json({ error: 'Não foi possível apagar.' }, { status: 500 })
  return NextResponse.json({ success: true })
}
