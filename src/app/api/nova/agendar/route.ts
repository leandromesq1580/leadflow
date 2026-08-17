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

  // A disponibilidade mostrada no navegador pode ter sido carregada há alguns
  // minutos. Confere novamente no servidor para não aceitar duas pessoas no
  // mesmo horário quando duas abas confirmam quase juntas.
  const { data: ocupado, error: ocupadoErr } = await db.from('appointments')
    .select('id')
    .eq('buyer_id', vendas.id)
    .eq('scheduled_at', slot.toISOString())
    .in('status', ['scheduled', 'confirmed'])
    .limit(1)
    .maybeSingle()
  if (ocupadoErr) {
    console.error('[nova/agendar] falha ao conferir disponibilidade:', ocupadoErr)
    return NextResponse.json({ error: 'Não consegui confirmar o horário — tente novamente.' }, { status: 503 })
  }
  if (ocupado) {
    return NextResponse.json({
      error: 'Esse horário acabou de ser reservado. Escolha outro horário.',
      code: 'slot_taken',
    }, { status: 409 })
  }

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
  const leadId = lead.id

  // Se uma das duas gravações obrigatórias falhar, removemos o lead. Assim a
  // landing nunca confirma parcialmente (só pipeline ou só agenda).
  async function desfazerLead(motivo: string) {
    const { error } = await db.from('leads').delete().eq('id', leadId)
    if (error) console.error(`[nova/agendar] falha ao desfazer lead apó ${motivo}:`, error)
  }

  // 2) a consultoria entra na agenda do sistema
  const { data: appointment, error: apptErr } = await db.from('appointments').insert({
    lead_id: leadId,
    buyer_id: vendas.id,
    scheduled_at: slot.toISOString(),
    qualification_notes: `Consultoria estratégica (landing /nova · ${idioma.toUpperCase()}) · Licença: ${licenca || '—'} · Estado: ${estado || '—'} · Fuso do prospect: ${fuso || '—'}`,
    status: 'scheduled',
  }).select('id').single()
  if (apptErr || !appointment) {
    console.error('[nova/agendar] falha ao gravar agenda:', apptErr)
    await desfazerLead('erro na agenda')
    return NextResponse.json({ error: 'Não consegui agendar — tente de novo.' }, { status: 500 })
  }

  // 3) o lead entra na primeira coluna do pipeline padrão
  const { data: pipe, error: pipeErr } = await db.from('pipelines')
    .select('id, pipeline_stages(id, position)')
    .eq('buyer_id', vendas.id).eq('is_default', true).single()
  const stages = ((pipe?.pipeline_stages || []) as Array<{ id: string; position: number }>)
    .sort((a, b) => a.position - b.position)
  if (pipeErr || !pipe || stages.length === 0) {
    console.error('[nova/agendar] pipeline padrão indisponível:', pipeErr)
    await desfazerLead('erro ao localizar pipeline')
    return NextResponse.json({ error: 'Não consegui registrar no atendimento — tente de novo.' }, { status: 500 })
  }

  const { error: cardErr } = await db.from('pipeline_leads').upsert({
    lead_id: leadId,
    pipeline_id: pipe.id,
    stage_id: stages[0].id,
    position: 0,
    moved_at: new Date().toISOString(),
  }, { onConflict: 'lead_id,pipeline_id' })
  if (cardErr) {
    console.error('[nova/agendar] falha ao gravar pipeline:', cardErr)
    await desfazerLead('erro no pipeline')
    return NextResponse.json({ error: 'Não consegui registrar no atendimento — tente de novo.' }, { status: 500 })
  }

  // 4) aviso imediato pro time (falha aqui não derruba o agendamento)
  try {
    const { pushToBuyer } = await import('@/lib/push-notify')
    const quando = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }).format(slot)
    await pushToBuyer(vendas.id, {
      title: `📅 Consultoria agendada — ${nome}`,
      body: `${quando} (ET) · ${estado || 'estado n/i'} · ${licenca || 'licença n/i'} · via landing ${idioma.toUpperCase()}`,
      url: '/dashboard/appointments',
      tag: `consultoria-${leadId}`,
    })
  } catch { /* push é conforto */ }

  return NextResponse.json({ ok: true, lead_id: leadId, appointment_id: appointment.id })
}
