import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** POST {lead_id, mode:'default'|'off'|'template', template_id?} — escolha de SMS pós-ligação da ligação EM CURSO (vale 30 min). */
export async function POST(request: NextRequest) {
  const db = createAdminClient()
  const me = await callerBuyer(db)
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await request.json().catch(() => null)
  if (!b || typeof b.lead_id !== 'string' || !uuid.test(b.lead_id)) return NextResponse.json({ error: 'Invalid lead_id' }, { status: 400 })
  if (!['default', 'off', 'template'].includes(b.mode)) return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
  let templateId: string | null = null
  if (b.mode === 'template') {
    if (typeof b.template_id !== 'string' || !uuid.test(b.template_id)) return NextResponse.json({ error: 'Invalid template_id' }, { status: 400 })
    const { data: t } = await db.from('sms_templates').select('id').eq('id', b.template_id).eq('buyer_id', me.id).maybeSingle()
    if (!t) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    templateId = t.id
  }
  const { error } = await db.from('sms_call_choices').upsert(
    { buyer_id: me.id, lead_id: b.lead_id, mode: b.mode, template_id: templateId, updated_at: new Date().toISOString() },
    { onConflict: 'buyer_id,lead_id' })
  if (error) return NextResponse.json({ error: 'Não foi possível salvar.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
