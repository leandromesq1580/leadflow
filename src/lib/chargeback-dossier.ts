import type { createAdminClient } from './supabase/admin'

type Db = ReturnType<typeof createAdminClient>

export type ChargebackDossier = {
  case: any
  buyer: any | null
  payment: any | null
  consent: any | null
  accesses: any[]
  deliveries: any[]
  notifications: any[]
  events: any[]
}

/** Monta apenas fatos observados no banco; nenhuma afirmacao e inventada. */
export async function loadChargebackDossier(db: Db, caseId: string): Promise<ChargebackDossier | null> {
  const { data: chargeback } = await db.from('chargeback_cases').select('*').eq('id', caseId).maybeSingle()
  if (!chargeback) return null

  let payment: any | null = null
  if (chargeback.payment_id) {
    payment = (await db.from('payments').select('*').eq('id', chargeback.payment_id).maybeSingle()).data
  } else if (chargeback.stripe_payment_intent_id) {
    payment = (await db.from('payments').select('*').eq('stripe_payment_intent_id', chargeback.stripe_payment_intent_id).maybeSingle()).data
  }

  let consent: any | null = null
  if (chargeback.stripe_payment_intent_id) {
    consent = (await db.from('purchase_consents').select('*')
      .eq('stripe_payment_intent_id', chargeback.stripe_payment_intent_id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()).data
  }
  if (!consent && chargeback.buyer_id) {
    consent = (await db.from('purchase_consents').select('*').eq('buyer_id', chargeback.buyer_id)
      .order('checkout_completed_at', { ascending: false }).limit(1).maybeSingle()).data
  }

  const buyerId = chargeback.buyer_id || payment?.buyer_id || consent?.buyer_id || null
  const buyer = buyerId
    ? (await db.from('buyers').select('id, name, email, phone, created_at').eq('id', buyerId).maybeSingle()).data
    : null
  const since = consent?.checkout_completed_at || payment?.created_at || chargeback.created_at

  const accesses = buyerId
    ? ((await db.from('platform_access_logs').select('*').eq('buyer_id', buyerId)
      .gte('occurred_at', since).order('occurred_at', { ascending: true }).limit(250)).data || [])
    : []

  let deliveries: any[] = []
  if (payment?.id) {
    deliveries = (await db.from('lead_delivery_receipts').select('*').eq('payment_id', payment.id)
      .order('delivered_at', { ascending: true }).limit(500)).data || []
  }
  // Para produtos sem mapeamento por credito, nao atribui qualquer entrega ao pagamento.
  const deliveryIds = deliveries.map(row => row.id)
  const notifications = deliveryIds.length
    ? ((await db.from('lead_notification_receipts').select('*').in('delivery_receipt_id', deliveryIds)
      .order('notified_at', { ascending: true }).limit(500)).data || [])
    : []
  const events = (await db.from('chargeback_events').select('*').eq('chargeback_case_id', chargeback.id)
    .order('occurred_at', { ascending: true })).data || []

  return { case: chargeback, buyer, payment, consent, accesses, deliveries, notifications, events }
}

export function dossierLines(d: ChargebackDossier): string[] {
  const money = `${String(d.case.currency || 'usd').toUpperCase()} ${(Number(d.case.amount_cents || 0) / 100).toFixed(2)}`
  const lines = [
    'LEAD4PRO - DOSSIER DE EVIDENCIAS DE COMPRA E ENTREGA',
    `Gerado em: ${new Date().toISOString()}`,
    '',
    '1. CONTESTACAO',
    `Stripe dispute: ${d.case.stripe_dispute_id}`,
    `Status: ${d.case.status}`,
    `Motivo informado: ${d.case.reason || 'nao informado'}`,
    `Valor: ${money}`,
    `Prazo de evidencia: ${d.case.evidence_due_by || 'nao informado'}`,
    `Payment Intent: ${d.case.stripe_payment_intent_id || 'nao localizado'}`,
    '',
    '2. CLIENTE E COMPRA',
    `Cliente: ${d.buyer?.name || 'nao localizado'}`,
    `E-mail: ${d.buyer?.email || 'nao localizado'}`,
    `Conta criada em: ${d.buyer?.created_at || 'nao localizado'}`,
    `Produto: ${d.consent?.product_description || d.payment?.product_type || 'nao localizado'}`,
    `Quantidade: ${d.consent?.quantity ?? d.payment?.quantity ?? 'nao localizada'}`,
    `Idioma dos leads: ${d.consent?.lead_language || d.payment?.lead_language || 'nao aplicavel'}`,
    `Checkout Session: ${d.consent?.stripe_checkout_session_id || d.payment?.stripe_session_id || 'nao localizado'}`,
    '',
    '3. CONSENTIMENTO',
    `Versao da politica: ${d.consent?.policy_version || 'compra anterior ao novo registro'}`,
    `SHA-256 da politica: ${d.consent?.policy_sha256 || 'nao disponivel'}`,
    `Aceite interno em: ${d.consent?.accepted_at || 'nao disponivel'}`,
    `IP do aceite: ${d.consent?.acceptance_ip || 'nao disponivel'}`,
    `Idioma do aceite: ${d.consent?.locale || 'nao disponivel'}`,
    `Checkbox de termos da Stripe: ${d.consent?.stripe_terms_accepted ? 'ACEITO' : 'nao registrado'}`,
    'Politica publicada: https://lead4producers.com/politicas',
    'Termos materiais: assinatura recorrente; leads vendidos separadamente; lead e oportunidade, nao venda garantida; troca apenas por telefone/e-mail inexistente ou invalido.',
    '',
    '4. USO AUTENTICADO DA PLATAFORMA',
    `Eventos registrados depois da compra: ${d.accesses.length}`,
    ...d.accesses.map(a => `${a.occurred_at} | ${a.path} | IP ${a.ip || '-'}`),
    '',
    '5. LEADS ENTREGUES VINCULADOS A ESTA COMPRA',
    `Total comprovado: ${d.deliveries.length}`,
    ...d.deliveries.map(r => `${r.delivered_at} | lead ${r.lead_id} | ${r.state || '-'} | ${r.lead_language || '-'} | ${r.masked_phone || '-'} | ${r.masked_email || '-'} | origem ${r.source}`),
    '',
    '6. NOTIFICACOES DAS ENTREGAS',
    `Total registrado: ${d.notifications.length}`,
    ...d.notifications.map(n => `${n.notified_at} | lead ${n.lead_id} | ${n.channel} | ${n.status}`),
    '',
    '7. TRILHA DA CONTESTACAO',
    ...d.events.map(e => `${e.occurred_at} | ${e.event_type} | ${e.status}`),
    '',
    'Declaracao: este relatorio foi gerado a partir de registros append-only do sistema. Registros historicos importados sao identificados como legacy_backfill e nao sao apresentados como eventos capturados em tempo real.',
  ]
  return lines.map(line => String(line).replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"'))
}
