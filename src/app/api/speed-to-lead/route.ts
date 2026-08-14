import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/speed-to-lead — leads entregues que AINDA NÃO receberam nenhum contato
 * (nem ligação, nem SMS, nem WhatsApp enviados). É o cronômetro da regra da casa:
 * cada minuto sem ligar derruba a conversão — contato em < 60 segundos.
 *
 * Janela: últimas 48h (depois disso o lead aparece nos alertas de esquecidos, que
 * já existem — aqui é o balcão do "liga AGORA").
 */
export async function GET() {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const desde = new Date(Date.now() - 48 * 3600_000).toISOString()
  const { data: leads } = await db
    .from('leads')
    .select('id, name, phone, state, interest, created_at')
    .eq('assigned_to', caller.id)
    .eq('status', 'assigned')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(30)

  const lista = leads || []
  if (!lista.length) return NextResponse.json({ leads: [] })

  const ids = lista.map(l => l.id)
  // qualquer interação de saída conta como "contatado"
  const [{ data: calls }, { data: sms }, { data: wpp }] = await Promise.all([
    db.from('calls').select('lead_id').in('lead_id', ids),
    db.from('sms_messages').select('lead_id').in('lead_id', ids),
    db.from('whatsapp_messages').select('lead_id').in('lead_id', ids).eq('direction', 'out'),
  ])
  const contatados = new Set([
    ...(calls || []).map(c => c.lead_id),
    ...(sms || []).map(s => s.lead_id),
    ...(wpp || []).map(w => w.lead_id),
  ])

  const pendentes = lista
    .filter(l => !contatados.has(l.id))
    .map(l => ({
      id: l.id, name: l.name, phone: l.phone, state: l.state, interest: l.interest,
      created_at: l.created_at,
      segundos: Math.max(0, Math.floor((Date.now() - new Date(l.created_at).getTime()) / 1000)),
    }))
    .sort((a, b) => a.segundos - b.segundos)

  return NextResponse.json({ leads: pendentes })
}
