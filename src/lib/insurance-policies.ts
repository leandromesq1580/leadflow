/**
 * GESTÃO DE APÓLICES (pós-venda) — 2026-08-03.
 *
 * Traz pro CRM o modelo do "Status do Book" que o dono já usava por fora: a apólice
 * não é um registro parado — ela é classificada num BUCKET DE AÇÃO calculado a partir
 * de datas e pendências, para o corretor saber o que fazer hoje e não perder comissão.
 *
 * Buckets (prioridade decrescente):
 *  🔴 urgente        — aviso de lapse / dívida vencendo: se cair, perde cliente E comissão
 *  💰 pagamento      — pendência de PAGAMENTO (EFT/prêmio/conta não encontrada): a National
 *                      avisou e sem resolver a apólice cai (caso Silvia, 17/08)
 *  🟠 assinatura     — emitida mas o cliente não assinou (eDelivery, Policy Receipt, Amendment)
 *  📤 nao_processada — enviada no eApp e a seguradora ainda não processou (>5 dias)
 *  🔬 analise        — em análise na seguradora (underwriting) — espelho do cartão
 *                      "Novos negócios em análise" do portal NL
 *  🔵 acompanhar     — emitida sem pendência conhecida, aguardando ativar
 *  ✅ em_dia         — ativa e sem pendência
 *  ⚪ encerrada      — caducada/cancelada/recusada (recuperar)
 */

export type PolicyStatus = 'submitted' | 'in_review' | 'issued' | 'active' | 'at_risk' | 'lapsed' | 'cancelled' | 'declined'
export type Bucket = 'urgente' | 'pagamento' | 'assinatura' | 'nao_processada' | 'analise' | 'acompanhar' | 'em_dia' | 'encerrada'

/** Pendência que fala de DINHEIRO (forma de pagamento, prêmio, conta bancária). */
export function pendenciaDePagamento(req: string): boolean {
  return /eft|premium|payment|pagamento|prêmio|bank|draft|nsf|ach|billing|debit|account/i.test(req)
}

export interface Policy {
  id: string
  buyer_id: string
  lead_id: string | null
  client_name: string
  client_phone: string | null
  client_email: string | null
  policy_number: string | null
  carrier: string | null
  product: string | null
  coverage_cents: number | null
  premium_cents: number | null
  premium_mode: string | null
  status: PolicyStatus
  submitted_at: string | null
  issued_at: string | null
  effective_date: string | null
  paid_through: string | null
  requirements: string[] | null
  /** histórico do Case Communication vindo do portal (migration 040) */
  case_comm?: { quem: string | null; quando: string | null; texto: string }[] | null
  amount_due_cents: number | null
  due_date: string | null
  next_action: string | null
  notes: string | null
  beneficiary: string | null
  last_contact_at: string | null
  done_at: string | null
  created_at: string
  updated_at: string
}

export type PolicyChangeKind = 'policy_added' | 'status_changed' | 'requirement_added' | 'requirement_removed'

export interface PolicyChangeAlert {
  id: string
  created_at: string
  kind: PolicyChangeKind
  policy_id: string | null
  policy_number: string | null
  client_name: string
  from_status?: PolicyStatus | null
  to_status?: PolicyStatus | null
  /** Valor literal exibido no portal quando ele é mais específico que o status interno. */
  from_value?: string | null
  to_value?: string | null
  requirement?: string | null
  action?: string | null
}

/** Locale das funções compartilhadas (default 'pt' — retrocompatível). */
export type PolicyLocale = 'pt' | 'en' | 'es'
const pick = (locale: PolicyLocale) => (pt: string, en: string, es: string) =>
  locale === 'en' ? en : locale === 'es' ? es : pt

export interface RequirementGuidance {
  action: string
  responsible: string
  responsibleKey: 'agent' | 'client' | 'carrier'
  urgent: boolean
}

/** Traduz o nome técnico da exigência da National Life em uma ação executável. */
export function orientarPendencia(requirement: string, locale: PolicyLocale = 'pt'): RequirementGuidance {
  const L = pick(locale)
  const value = String(requirement || '').trim()
  const normalized = value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const guidance = (responsibleKey: RequirementGuidance['responsibleKey'], action: string, urgent = true): RequirementGuidance => ({
    action,
    responsibleKey,
    urgent,
    responsible: responsibleKey === 'client'
      ? L('Cliente', 'Client', 'Cliente')
      : responsibleKey === 'carrier'
        ? L('Seguradora', 'Carrier', 'Aseguradora')
        : L('Corretor', 'Agent', 'Agente'),
  })

  if (/edelivery/.test(normalized)) return guidance('client', L(
    'Enviar o link de eDelivery e cobrar a assinatura do cliente.',
    'Send the eDelivery link and follow up for the client signature.',
    'Enviar el enlace de eDelivery y pedir la firma del cliente.'))
  if (/eft|bank|banking|automatic premium|premium authorization/.test(normalized)) return guidance('client', L(
    'Pedir o formulário EFT e os dados bancários, conferir e enviar pelo portal.',
    'Request the EFT form and banking details, verify them, and submit through the portal.',
    'Pedir el formulario EFT y los datos bancarios, verificarlos y enviarlos por el portal.'))
  if (/policy receipt|receipt/.test(normalized)) return guidance('client', L(
    'Pedir a assinatura do Policy Receipt e devolver o documento à National Life.',
    'Get the Policy Receipt signed and return it to National Life.',
    'Pedir la firma del Policy Receipt y devolverlo a National Life.'))
  if (/amendment|alteration|change form/.test(normalized)) return guidance('client', L(
    'Explicar a alteração, colher a assinatura do cliente e enviar o Amendment.',
    'Explain the change, obtain the client signature, and submit the Amendment.',
    'Explicar el cambio, obtener la firma del cliente y enviar el Amendment.'))
  if (/illustration/.test(normalized)) return guidance('client', L(
    'Revisar a ilustração com o cliente, colher a assinatura e enviar a versão assinada.',
    'Review the illustration with the client, obtain the signature, and submit the signed copy.',
    'Revisar la ilustración con el cliente, obtener la firma y enviar la copia firmada.'))
  if (/id verification|identity|identification|photo id|driver.*license/.test(normalized)) return guidance('client', L(
    'Solicitar um documento de identidade válido e concluir a verificação no portal.',
    'Request a valid photo ID and complete the verification in the portal.',
    'Solicitar una identificación válida y completar la verificación en el portal.'))
  if (/medical|exam|paramed|aps|physician|health record/.test(normalized)) return guidance('client', L(
    'Confirmar o exame ou prontuário pendente com o cliente e acompanhar a entrega.',
    'Confirm the pending exam or medical record with the client and track its delivery.',
    'Confirmar el examen o expediente médico pendiente con el cliente y acompañar la entrega.'))
  if (/first premium|1.? premio|initial premium|payment|past due/.test(normalized)) return guidance('client', L(
    'Confirmar a forma de pagamento e cobrar o primeiro prêmio imediatamente.',
    'Confirm the payment method and collect the first premium immediately.',
    'Confirmar el método de pago y cobrar la primera prima inmediatamente.'))
  if (/underwriting|case communication|case manager|info needed|information needed|replacement|producer|application/.test(normalized)) return guidance('agent', L(
    'Abrir o Case Communication, ler a pergunta completa e responder ou anexar o solicitado.',
    'Open Case Communication, read the full request, and reply or attach what was requested.',
    'Abrir Case Communication, leer la solicitud completa y responder o adjuntar lo pedido.'))
  if (/signature|signed|sign /.test(normalized)) return guidance('client', L(
    'Enviar o documento ao cliente, colher a assinatura e devolver pelo portal.',
    'Send the document to the client, obtain the signature, and return it through the portal.',
    'Enviar el documento al cliente, obtener la firma y devolverlo por el portal.'))

  return guidance('agent', L(
    `Abrir “${value}” na National Life, conferir a descrição completa e enviar a resposta ou o documento pedido.`,
    `Open “${value}” in National Life, review the full description, and send the requested response or document.`,
    `Abrir “${value}” en National Life, revisar la descripción completa y enviar la respuesta o documento solicitado.`))
}

export function BUCKETS(locale: PolicyLocale = 'pt'): { key: Bucket; label: string; icon: string; color: string; bg: string; hint: string }[] {
  const L = pick(locale)
  return [
    { key: 'urgente', label: L('Urgente', 'Urgent', 'Urgente'), icon: '🔴', color: '#b91c1c', bg: '#fef2f2',
      hint: L(
        'Dinheiro parado ou apólice prestes a cair. Se cair, você perde o cliente E a comissão volta (chargeback).',
        'Money on hold or a policy about to lapse. If it lapses, you lose the client AND the commission comes back (chargeback).',
        'Dinero detenido o póliza a punto de caer. Si cae, pierdes al cliente Y la comisión se devuelve (chargeback).') },
    { key: 'pagamento', label: L('Pendente de pagamento', 'Payment pending', 'Pago pendiente'), icon: '💰', color: '#c2410c', bg: '#fff7ed',
      hint: L(
        'A seguradora não conseguiu cobrar (EFT, prêmio, conta não encontrada). Resolver com o cliente antes que a apólice caia.',
        'The carrier could not collect (EFT, premium, account not found). Sort it out with the client before the policy lapses.',
        'La aseguradora no pudo cobrar (EFT, prima, cuenta no encontrada). Resuélvelo con el cliente antes de que caiga la póliza.') },
    { key: 'assinatura', label: L('Cobrar assinatura', 'Chase signature', 'Pedir firma'), icon: '🟠', color: '#b45309', bg: '#fffbeb',
      hint: L(
        'A apólice foi emitida, mas falta o cliente assinar (eDelivery, recibo, alteração). Sem isso a entrega não conclui.',
        'The policy was issued, but the client still needs to sign (eDelivery, receipt, amendment). Without it, delivery is not complete.',
        'La póliza fue emitida, pero falta que el cliente firme (eDelivery, recibo, enmienda). Sin eso la entrega no se completa.') },
    { key: 'nao_processada', label: L('Não processadas', 'Not processed', 'Sin procesar'), icon: '📤', color: '#4f46e5', bg: '#eef2ff',
      hint: L(
        'Enviadas para a seguradora e ainda sem retorno. Acima de 5 dias, é hora de cobrar.',
        'Submitted to the carrier with no response yet. Past 5 days, it is time to follow up.',
        'Enviadas a la aseguradora y todavía sin respuesta. Pasados 5 días, es hora de dar seguimiento.') },
    { key: 'analise', label: L('Em análise', 'In review', 'En análisis'), icon: '🔬', color: '#7c3aed', bg: '#f5f3ff',
      hint: L(
        'A seguradora está analisando o caso (underwriting) — espelho do "novos negócios em análise" do portal. Acompanhe o parecer.',
        'The carrier is reviewing the case (underwriting) — mirrors the portal\'s "new business pending review". Watch for the decision.',
        'La aseguradora está analizando el caso (underwriting) — espejo del "nuevos negocios en análisis" del portal. Sigue el dictamen.') },
    { key: 'acompanhar', label: L('Acompanhar', 'Follow up', 'Dar seguimiento'), icon: '🔵', color: '#0369a1', bg: '#f0f9ff',
      hint: L(
        'Emitidas aguardando ativar — confirmar 1º pagamento e vigência.',
        'Issued and waiting to activate — confirm the first payment and effective date.',
        'Emitidas en espera de activarse — confirma el primer pago y la fecha de vigencia.') },
    { key: 'em_dia', label: L('Em dia', 'In good standing', 'Al día'), icon: '✅', color: '#047857', bg: '#ecfdf5',
      hint: L(
        'Ativas e sem pendência. Momento de pedir indicação e revisar cobertura.',
        'Active with nothing pending. A good time to ask for referrals and review coverage.',
        'Activas y sin pendientes. Buen momento para pedir referidos y revisar la cobertura.') },
    { key: 'encerrada', label: L('Recuperar', 'Win back', 'Recuperar'), icon: '⚪', color: '#64748b', bg: '#f8fafc',
      hint: L(
        'Caducadas, canceladas ou recusadas — vale uma tentativa de recuperação.',
        'Lapsed, cancelled or declined — worth a win-back attempt.',
        'Caducadas, canceladas o rechazadas — vale la pena intentar recuperarlas.') },
  ]
}

const DIA = 86400_000
export function diasDesde(d?: string | null): number | null {
  if (!d) return null
  return Math.floor((Date.now() - new Date(d + 'T12:00:00').getTime()) / DIA)
}
export function diasAte(d?: string | null): number | null {
  if (!d) return null
  return Math.ceil((new Date(d + 'T12:00:00').getTime() - Date.now()) / DIA)
}

/** Bucket calculado (nunca guardado — sempre reflete a realidade das datas). */
export function bucketOf(p: Policy): Bucket {
  if (p.status === 'lapsed' || p.status === 'cancelled' || p.status === 'declined') return 'encerrada'

  const venceEm = diasAte(p.due_date)
  const temDivida = (p.amount_due_cents || 0) > 0
  if (p.status === 'at_risk' || temDivida || (venceEm !== null && venceEm <= 30)) return 'urgente'

  const pend = (p.requirements || []).filter(Boolean)
  // dinheiro antes de papel: pendência de pagamento tem fila própria (caso Silvia)
  if (pend.some(pendenciaDePagamento)) return 'pagamento'
  if (p.status === 'issued' && pend.length > 0) return 'assinatura'
  if (p.status === 'in_review') return 'analise'
  if (p.status === 'submitted') {
    const d = diasDesde(p.submitted_at)
    return d !== null && d > 5 ? 'nao_processada' : 'acompanhar'
  }
  if (p.status === 'issued') return 'acompanhar'
  if (p.status === 'active') return pend.length > 0 ? 'assinatura' : 'em_dia'
  return 'acompanhar'
}

/** Frase de ação sugerida quando o corretor não escreveu uma. */
export function acaoSugerida(p: Policy, locale: PolicyLocale = 'pt'): string {
  if (p.next_action) return p.next_action
  const L = pick(locale)
  const b = bucketOf(p)
  const venceEm = diasAte(p.due_date)
  const divida = p.amount_due_cents ? `$${(p.amount_due_cents / 100).toFixed(2)}` : null
  if (b === 'urgente') {
    if (divida && venceEm !== null) return L(
      `Ligar e cobrar o pagamento de ${divida} — prazo em ${venceEm} dia(s).`,
      `Call and collect the ${divida} payment — due in ${venceEm} day(s).`,
      `Llamar y cobrar el pago de ${divida} — vence en ${venceEm} día(s).`)
    if (divida) return L(
      `Ligar e cobrar o pagamento de ${divida}.`,
      `Call and collect the ${divida} payment.`,
      `Llamar y cobrar el pago de ${divida}.`)
    return L('Apólice em risco — falar com o cliente hoje.',
      'Policy at risk — talk to the client today.',
      'Póliza en riesgo — habla con el cliente hoy.')
  }
  if (b === 'pagamento') {
    const req = (p.requirements || []).filter(pendenciaDePagamento).join(', ')
    return L(
      `Resolver o pagamento com o cliente${req ? ` (${req})` : ''} — a seguradora não conseguiu cobrar.`,
       `Sort out the payment with the client${req ? ` (${req})` : ''} — the carrier could not collect.`,
       `Resolver el pago con el cliente${req ? ` (${req})` : ''} — la aseguradora no pudo cobrar.`)
  }
  const requirementActions = [...new Set((p.requirements || []).filter(Boolean).map(requirement => orientarPendencia(requirement, locale).action))]
  if (requirementActions.length > 0) return L(
    `Fazer agora: ${requirementActions.slice(0, 3).join(' • ')}`,
    `Do now: ${requirementActions.slice(0, 3).join(' • ')}`,
    `Hacer ahora: ${requirementActions.slice(0, 3).join(' • ')}`)
  if (b === 'analise') {
    return L(
      'Em análise na seguradora — acompanhar o parecer e responder o Case Communication se pedirem algo.',
      'Under carrier review — watch for the decision and answer the Case Communication if they ask for anything.',
      'En análisis en la aseguradora — sigue el dictamen y responde el Case Communication si piden algo.')
  }
  if (b === 'assinatura') {
    const req = (p.requirements || []).join(', ')
    const d = diasDesde(p.issued_at)
    return L(
      `Cobrar assinatura${req ? `: ${req}` : ''}${d !== null ? ` — parado há ${d} dia(s)` : ''}.`,
      `Chase the signature${req ? `: ${req}` : ''}${d !== null ? ` — stalled for ${d} day(s)` : ''}.`,
      `Pedir la firma${req ? `: ${req}` : ''}${d !== null ? ` — detenido hace ${d} día(s)` : ''}.`)
  }
  if (b === 'nao_processada') {
    const d = diasDesde(p.submitted_at)
    return L(
      `Cobrar a seguradora — ${d} dia(s) sem processar a aplicação.`,
      `Follow up with the carrier — ${d} day(s) without processing the application.`,
      `Dar seguimiento a la aseguradora — ${d} día(s) sin procesar la aplicación.`)
  }
  if (b === 'acompanhar') return L('Confirmar o primeiro pagamento e a data de vigência.',
    'Confirm the first payment and the effective date.',
    'Confirmar el primer pago y la fecha de vigencia.')
  if (b === 'em_dia') return L('Em dia. Boa hora para pedir indicação ou revisar a cobertura.',
    'In good standing. A good time to ask for referrals or review coverage.',
    'Al día. Buen momento para pedir referidos o revisar la cobertura.')
  return L('Tentar recuperar o cliente.', 'Try to win the client back.', 'Intentar recuperar al cliente.')
}

/** Ordena por urgência real dentro do bucket (prazo mais curto / parado há mais tempo). */
export function ordenar(a: Policy, b: Policy): number {
  const pa = diasAte(a.due_date) ?? 9999
  const pb = diasAte(b.due_date) ?? 9999
  if (pa !== pb) return pa - pb
  const da = diasDesde(a.issued_at || a.submitted_at) ?? -1
  const db = diasDesde(b.issued_at || b.submitted_at) ?? -1
  return db - da
}

export interface PolicyKpis {
  total: number
  ativas: number
  pendentes: number   // com documento/pendência
  emRisco: number     // caducadas ou caindo
  premioMensalCents: number
  coberturaCents: number
  porBucket: Record<Bucket, number>
}

export function kpisDe(lista: Policy[]): PolicyKpis {
  const porBucket = BUCKETS().reduce((acc, b) => ({ ...acc, [b.key]: 0 }), {} as Record<Bucket, number>)
  let ativas = 0, pendentes = 0, emRisco = 0, premio = 0, cobertura = 0
  for (const p of lista) {
    const b = bucketOf(p)
    porBucket[b]++
    if (p.status === 'active') { ativas++; premio += p.premium_cents || 0; cobertura += p.coverage_cents || 0 }
    if ((p.requirements || []).length > 0) pendentes++
    if (b === 'urgente' || p.status === 'lapsed') emRisco++
  }
  return { total: lista.length, ativas, pendentes, emRisco, premioMensalCents: premio, coberturaCents: cobertura, porBucket }
}

export const money = (cents?: number | null) =>
  cents == null ? '—' : `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`

export function STATUS_LABEL(locale: PolicyLocale = 'pt'): Record<PolicyStatus, string> {
  const L = pick(locale)
  return {
    submitted: L('Enviada', 'Submitted', 'Enviada'),
    in_review: L('Em análise', 'In review', 'En análisis'),
    issued: L('Emitida', 'Issued', 'Emitida'),
    active: L('Ativa', 'Active', 'Activa'),
    at_risk: L('Em risco', 'At risk', 'En riesgo'),
    lapsed: L('Caducada', 'Lapsed', 'Caducada'),
    cancelled: L('Cancelada', 'Cancelled', 'Cancelada'),
    declined: L('Recusada', 'Declined', 'Rechazada'),
  }
}

export function REQUISITOS_COMUNS(locale: PolicyLocale = 'pt'): string[] {
  const L = pick(locale)
  return ['eDelivery', 'Policy Receipt', 'Amendment', 'ID Verification', 'Illustration',
    L('Exame médico', 'Medical exam', 'Examen médico'), L('1º prêmio', '1st premium', '1er pago'),
    // ✋ = pendência manual: o sync do portal preserva (o portal não sabe dela)
    L('✋ Pagamento devolvido (EFT)', '✋ Payment returned (EFT)', '✋ Pago devuelto (EFT)')]
}
