import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { validateSmsTemplate } from '@/lib/sms-call-choice'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'private, no-store' }

/** GET: modelos de SMS do comprador logado + chave geral. POST: cria modelo. Sempre do PRÓPRIO comprador da sessão. */
export async function GET() {
  const db = createAdminClient()
  const me = await callerBuyer(db)
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  const [t, b] = await Promise.all([
    db.from('sms_templates').select('id, name, body, is_default, created_at').eq('buyer_id', me.id).order('created_at'),
    db.from('buyers').select('sms_auto_enabled').eq('id', me.id).maybeSingle(),
  ])
  if (t.error) return NextResponse.json({ error: 'Não foi possível carregar os modelos.' }, { status: 500, headers: NO_STORE })
  return NextResponse.json({ templates: t.data || [], auto_enabled: b.data?.sms_auto_enabled !== false }, { headers: NO_STORE })
}

export async function POST(request: NextRequest) {
  const db = createAdminClient()
  const me = await callerBuyer(db)
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const input = await request.json().catch(() => null)
  const v = validateSmsTemplate(input || {})
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { count } = await db.from('sms_templates').select('id', { count: 'exact', head: true }).eq('buyer_id', me.id)
  if ((count || 0) >= 20) return NextResponse.json({ error: 'Limite de 20 modelos.' }, { status: 400 })
  const { data, error } = await db.from('sms_templates').insert({ buyer_id: me.id, name: v.name, body: v.body }).select('id, name, body, is_default, created_at').single()
  if (error) return NextResponse.json({ error: 'Não foi possível salvar.' }, { status: 500 })
  return NextResponse.json({ template: data })
}
