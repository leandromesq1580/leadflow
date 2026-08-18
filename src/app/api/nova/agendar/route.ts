import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * POST /api/nova/agendar — agendamento NATIVO da landing /nova (decisão do dono,
 * 14/08: nada de Cal.com — o prospect vira LEAD no pipeline da conta de vendas e
 * a consultoria entra na AGENDA do sistema dessa conta).
 *
 * Rota pública (a landing não tem sessão): validação rígida + honeypot. O lead
 * NÃO leva as marcas de manual (campaign 'Manual'/form manual_entry/source manual)
 * de propósito — é inbound real, e as regras de lead manual não se aplicam.
 */

const EMAIL_VENDAS = 'regiane@myhomefirst.us'

export async function POST(req: Request) {
  let body: Record<string, string> = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  // honeypot: campo invisível que humano não preenche
  if (body.site) return NextResponse.json({ ok: true })

  const pega = (k: string, max = 120) => String(body[k] || '').trim().slice(0, max)
  const nome = pega('nome')
  const email = pega('email')
  const telefone = pega('telefone', 30)
  const licenca = pega('licenca', 60)
  const estado = pega('estado', 40)
  const fuso = pega('fuso', 60)
  const idioma = ['en', 'es'].includes(body.idioma) ? body.idioma : 'pt'
  const slot = new Date(String(body.slot || ''))

  if (nome.length < 2) return NextResponse.json({ error: 'Nome obrigatório.' }, { status: 400 })
  if (!email.includes('@') && telefone.replace(/\D/g, '').length < 8) {
    return NextResponse.json({ error: 'Informe e-mail ou telefone.' }, { status: 400 })
  }
  const agora = Date.now()
  if (isNaN(slot.getTime()) || slot.getTime() < agora - 60_000 || slot.getTime() > agora + 90 * 86_400_000) {
    return NextResponse.json({ error: 'Horário inválido.' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: vendas } = await db.from('buyers').select('id, name').eq('email', EMAIL_VENDAS).single()
  if (!vendas) return NextResponse.json({ error: 'Agenda indisponível no momento.' }, { status: 503 })

  // 1) o prospect vira lead no pipeline do time de vendas
  const { data: lead, error: leadErr } = await db.from('leads').insert({
    name: nome,
    email,
    phone: telefone,
    state: estado,
    interest: 'Consultoria Lead4Pro',
    campaign_name: 'Consultoria — Landing Nova',
    form_name: 'consultoria_landing',
    type: 'hot',
    status: 'appointment_set',
    product_type: 'lead',
    assigned_to: vendas.id,
    raw_data: { source: 'landing_nova', licenca, fuso, idioma, slot: slot.toISOString() },
  }).select('id').single()
  if (leadErr || !lead) return NextResponse.json({ error: 'Não consegui registrar — tente de novo.' }, { status: 500 })

  // primeira coluna do pipeline padrão (mesmo idiom do lead manual)
  try {
    const { data: pipe } = await db.from('pipelines')
      .select('id, pipeline_stages(id, position)')
      .eq('buyer_id', vendas.id).eq('is_default', true).single()
    if (pipe) {
      const stages = ((pipe as any).pipeline_stages || []).sort((a: any, b: any) => a.position - b.position)
      if (stages.length > 0) {
        await db.from('pipeline_leads').insert({
          lead_id: lead.id, pipeline_id: pipe.id, stage_id: stages[0].id,
          position: 0, moved_at: new Date().toISOString(),
        })
      }
    }
  } catch { /* pipeline é conforto; a consultoria abaixo é o que não pode falhar */ }

  // 2) a consultoria entra na agenda do sistema
  const { error: apptErr } = await db.from('appointments').insert({
    lead_id: lead.id,
    buyer_id: vendas.id,
    scheduled_at: slot.toISOString(),
    qualification_notes: `Consultoria estratégica (landing /nova · ${idioma.toUpperCase()}) · Licença: ${licenca || '—'} · Estado: ${estado || '—'} · Fuso do prospect: ${fuso || '—'}`,
    status: 'scheduled',
  })
  if (apptErr) return NextResponse.json({ error: 'Não consegui agendar — tente de novo.' }, { status: 500 })

  // 2b) a reunião também vira follow-up do LEAD (aba Follow-ups / no-show / timeline).
  // O motor de "Aviso de reunião" deduplica por lead — não gera lembrete em dobro.
  try {
    await db.from('follow_ups').insert({
      lead_id: lead.id, buyer_id: vendas.id, type: 'meeting',
      description: `Consultoria estratégica agendada pelo site (${idioma.toUpperCase()})`,
      scheduled_at: slot.toISOString(),
    })
  } catch { /* timeline é conforto; agenda acima é o contrato */ }

  // 3) aviso imediato pro time (falha aqui não derruba o agendamento)
  const quando = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }).format(slot)
  try {
    const { pushToBuyer } = await import('@/lib/push-notify')
    await pushToBuyer(vendas.id, {
      title: `📅 Consultoria agendada — ${nome}`,
      body: `${quando} (ET) · ${estado || 'estado n/i'} · ${licenca || 'licença n/i'} · via landing ${idioma.toUpperCase()}`,
      url: '/dashboard/appointments',
      tag: `consultoria-${lead.id}`,
    })
  } catch { /* push é conforto */ }

  // 3b) grupo do WhatsApp (pedido 18/08: todo agendamento do site avisa o grupo)
  try {
    const { notifyAdmins } = await import('@/lib/notifications')
    await notifyAdmins(
      `📅 *CONSULTORIA AGENDADA PELO SITE*\n\n` +
      `👤 ${nome}\n` +
      `📞 ${telefone || '—'}\n` +
      `📧 ${email || '—'}\n` +
      `📍 ${estado || 'estado n/i'}\n` +
      `🕑 ${quando} (ET)\n` +
      `🗣 ${idioma.toUpperCase()} · ${licenca || 'licença n/i'}\n\n` +
      `👥 Na agenda de: ${(vendas.name || 'Lead4Pro').trim()}`)
  } catch { /* aviso é conforto — o agendamento já está garantido acima */ }

  return NextResponse.json({ ok: true })
}
