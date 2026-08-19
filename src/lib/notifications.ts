import { Resend } from 'resend'
import { localeDoBuyer, trad, type BuyerLocale } from './buyer-locale'
import { orientarPendencia, type PolicyChangeAlert, type PolicyStatus } from './insurance-policies'

let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend((process.env.RESEND_API_KEY || '').trim())
  }
  return _resend
}

/**
 * Send WhatsApp notification via wa-bridge (whatsapp-web.js).
 * Supports both direct (phone number) and groups (JID@g.us).
 */
async function sendWhatsApp(phone: string, message: string, bridge?: { url: string; key: string } | null): Promise<boolean> {
  const clean = (s: string) => String(s).trim().replace(/\\n/g, '').replace(/\s+$/, '').replace(/\/$/, '')
  const bridgeUrl = clean(bridge?.url || process.env.WA_BRIDGE_URL || 'http://62.146.229.13:3457')
  const bridgeKey = (bridge?.key || process.env.WA_BRIDGE_KEY || 'leadflow-bridge-2026').trim()

  if (!bridgeKey) return false

  let cleanNumber = phone.includes('@g.us')
    ? phone
    : phone.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '')
  // Número salvo SEM código de país (ex: "9788962345" da Janiane). A whatsapp-web.js
  // não resolve número de 10 dígitos — precisa do DDI. Plataforma é US → prefixa "1".
  // Sem isso o /send é aceito mas NÃO entrega (some sem erro). Não toca em grupos
  // (@g.us) nem em números que já têm DDI (11+ dígitos).
  if (/^\d{10}$/.test(cleanNumber)) cleanNumber = '1' + cleanNumber

  // Uma tentativa REAL: checa res.ok E o corpo (a bridge devolve {success, id}).
  // "200 sem id" ou "success:false" = NÃO entregou — conta como falha (antes
  // engolia tudo como sucesso, por isso falhas sumiam sem ninguém ver).
  const attempt = async (): Promise<boolean> => {
    try {
      const res = await fetch(`${bridgeUrl}/send`, {
        method: 'POST',
        headers: { 'apikey': bridgeKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: cleanNumber, message }),
        signal: AbortSignal.timeout(10000),
      })
      const data: any = await res.json().catch(() => null)
      const ok = res.ok && !!(data && (data.success === true || data.id))
      console.log(`[WhatsApp] ${cleanNumber} — ${res.status} ${ok ? 'OK' : 'FALHOU'}`)
      return ok
    } catch (err) {
      console.error('[WhatsApp] Failed:', err)
      return false
    }
  }

  // Retry 1x: os flaps da bridge ("Promise was collected") são transitórios.
  if (await attempt()) return true
  await new Promise(r => setTimeout(r, 1500))
  return await attempt()
}

/**
 * Avisa o dono do book quando a National Life muda uma apólice ou publica/remove
 * uma exigência. O alerta é agrupado por leitura do portal para não transformar
 * uma varredura com várias alterações em dezenas de mensagens separadas.
 */
export async function notifyPolicyChanges(
  buyerId: string,
  changes: PolicyChangeAlert[],
): Promise<{ push: number; whatsapp: boolean; email: boolean }> {
  const delivered = { push: 0, whatsapp: false, email: false }
  if (!buyerId || !changes.length) return delivered

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers')
    .select('name, email, phone, whatsapp, notification_phone_2')
    .eq('id', buyerId).maybeSingle()
  if (!buyer) return delivered

  const locale = await localeDoBuyer(db, buyerId)
  const L = trad(locale)
  const statusLabel = (status?: PolicyStatus | null) => ({
    submitted: L('Enviada', 'Submitted', 'Enviada'),
    in_review: L('Em análise', 'In review', 'En análisis'),
    issued: L('Emitida', 'Issued', 'Emitida'),
    active: L('Ativa', 'Active', 'Activa'),
    at_risk: L('Em risco', 'At risk', 'En riesgo'),
    lapsed: L('Caducada', 'Lapsed', 'Caducada'),
    cancelled: L('Cancelada', 'Cancelled', 'Cancelada'),
    declined: L('Recusada', 'Declined', 'Rechazada'),
  }[String(status || '')] || status || '—')
  const statusValue = (value: string | null | undefined, fallback?: PolicyStatus | null) => value || statusLabel(fallback)
  const policyLabel = (change: PolicyChangeAlert) => [change.client_name, change.policy_number].filter(Boolean).join(' · ')
  const actionFor = (change: PolicyChangeAlert) => change.requirement
    ? orientarPendencia(change.requirement, locale).action
    : change.action
  const lineFor = (change: PolicyChangeAlert) => {
    if (change.kind === 'requirement_added') return `📥 *${L('Novo pedido', 'New request', 'Nueva solicitud')}* — ${policyLabel(change)}\n${change.requirement || '—'}\n➡️ ${actionFor(change)}`
    if (change.kind === 'requirement_removed') return `✅ *${L('Pendência removida/concluída', 'Requirement removed/completed', 'Pendiente eliminado/completado')}* — ${policyLabel(change)}\n${change.requirement || '—'}`
    if (change.kind === 'status_changed') return `🔄 *${L('Status alterado', 'Status changed', 'Estado actualizado')}* — ${policyLabel(change)}\n${statusValue(change.from_value, change.from_status)} → ${statusValue(change.to_value, change.to_status)}`
    return `🆕 *${L('Nova apólice encontrada', 'New policy found', 'Nueva póliza encontrada')}* — ${policyLabel(change)}\n${statusLabel(change.to_status)}`
  }

  const visible = changes.slice(0, 12)
  const remainder = changes.length - visible.length
  const title = L('National Life — alterações no book', 'National Life — book changes', 'National Life — cambios en el book')
  const message = `🚨 *${title}*\n\n${visible.map(lineFor).join('\n\n')}${remainder > 0 ? `\n\n+${remainder} ${L('alteração(ões) no portal', 'more change(s) in the portal', 'cambio(s) más en el portal')}` : ''}\n\n🔗 lead4producers.com/dashboard/apolices`

  const primaryPhone = String(buyer.whatsapp || buyer.phone || '').trim()
  const secondaryPhone = String(buyer.notification_phone_2 || '').trim()
  const digits = (value: string) => value.replace(/\D/g, '')
  const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character] || character))

  // Os canais rodam juntos para a importação automática não ficar presa caso um
  // provedor esteja lento. Cada canal continua isolado: falha de um não cancela os outros.
  const pushTask = (async () => {
    try {
      const { pushToBuyer } = await import('@/lib/push-notify')
      delivered.push = await pushToBuyer(buyerId, {
        title: `🚨 ${title}`,
        body: changes.length === 1
          ? `${policyLabel(changes[0])}: ${changes[0].requirement || L('status alterado', 'status changed', 'estado actualizado')}`
          : L(`${changes.length} alterações encontradas.`, `${changes.length} changes found.`, `${changes.length} cambios encontrados.`),
        url: '/dashboard/apolices',
        tag: `policies-${changes[0].id}`,
      })
    } catch (error) {
      console.error('[Policy alerts] push falhou:', error)
    }
  })()

  const whatsappTask = (async () => {
    const phones = [primaryPhone]
    if (secondaryPhone && digits(secondaryPhone) !== digits(primaryPhone)) phones.push(secondaryPhone)
    const results = await Promise.all(phones.filter(Boolean).map(async phone => {
      try { return await sendWhatsApp(phone, message) }
      catch (error) { console.error('[Policy alerts] WhatsApp falhou:', error); return false }
    }))
    delivered.whatsapp = results.some(Boolean)
  })()

  const emailTask = (async () => {
    if (!buyer.email) return
    const rows = visible.map(change => {
      const action = actionFor(change)
      const detail = change.kind === 'status_changed'
        ? `${statusValue(change.from_value, change.from_status)} → ${statusValue(change.to_value, change.to_status)}`
        : change.requirement || statusLabel(change.to_status)
      return `<div style="padding:14px 0;border-bottom:1px solid #e2e8f0"><b>${escapeHtml(policyLabel(change))}</b><br><span>${escapeHtml(detail)}</span>${action ? `<br><span style="color:#7c3aed"><b>${escapeHtml(L('O que fazer', 'What to do', 'Qué hacer'))}:</b> ${escapeHtml(action)}</span>` : ''}</div>`
    }).join('')
    try {
      const result = await getResend().emails.send({
        from: 'Lead4Producers <onboarding@resend.dev>',
        to: buyer.email,
        subject: `🚨 ${title} (${changes.length})`,
        html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(L('A National Life publicou alterações que precisam da sua atenção.', 'National Life posted changes that need your attention.', 'National Life publicó cambios que requieren tu atención.'))}</p>${rows}<p style="margin-top:22px"><a href="${escapeHtml(process.env.NEXT_PUBLIC_APP_URL || 'https://lead4producers.com')}/dashboard/apolices" style="background:#7c3aed;color:white;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">${escapeHtml(L('Abrir Gestão de Apólices', 'Open Policy Management', 'Abrir Gestión de Pólizas'))}</a></p></div>`,
      })
      delivered.email = !result.error
    } catch (error) {
      console.error('[Policy alerts] e-mail falhou:', error)
    }
  })()

  await Promise.allSettled([pushTask, whatsappTask, emailTask])

  return delivered
}

/**
 * Avisa o GRUPO de controle que um lead CHEGOU mas ainda não tem dono
 * (nenhum comprador disponível por estado/horário). Garante que o grupo nunca
 * fica cego: todo lead gera aviso, mesmo os que ficam pendentes. Quando o lead
 * for finalmente distribuído, o sendLeadNotificationEmail avisa "entregue pra X".
 */
export async function notifyGroupLeadPending(lead: { name: string; phone: string; state?: string | null; interest?: string | null }) {
  const msg = `🔔 *NOVO LEAD RECEBIDO* (aguardando distribuição)

📋 *${lead.name}*
📞 ${lead.phone}
📍 ${lead.state || '—'}
💡 ${lead.interest || 'Seguro de vida'}

⏳ Nenhum comprador disponível agora (estado/horário). Será entregue automaticamente quando a janela abrir.`
  await notifyAdmins(msg) // grupo + direto (grupo sozinho NAO entrega — ver notifyAdmins)
}

/** Avisa o GRUPO de controle que um CLIENTE (comprador) mandou mensagem. */
export async function notifyGroupClientMessage(clientName: string | null, fromPhone: string, body: string) {
  const msg = `👥 *MENSAGEM DE CLIENTE*

🧑‍💼 *${clientName || 'Cliente'}*
📞 +${fromPhone}

💬 "${body.slice(0, 400)}"

➡️ Responda em Admin → Atendimento a Clientes`
  await notifyAdmins(msg) // grupo + direto
}

/** Avisa o GRUPO de controle que um lead respondeu o SMS em massa. */
export async function notifyGroupSmsReply(leadName: string | null, fromPhone: string, body: string) {
  const msg = `📩 *RESPOSTA DE SMS*

👤 *${leadName || 'Número não cadastrado'}*
📞 +${fromPhone}

💬 "${body.slice(0, 400)}"`
  await notifyAdmins(msg) // grupo + direto
}

/**
 * Avisa o DONO do lead que o lead respondeu por SMS (caso Robson, 2026-08-10).
 * Antes só o admin sabia — o corretor mandava SMS, o lead respondia e ninguém via.
 * Sai pela bridge GLOBAL (regra da casa: aviso da plataforma pro comprador nunca
 * usa a bridge dele). Best-effort: falha aqui não afeta o registro da resposta.
 */
export async function notifySmsReplyToOwner(buyerId: string, leadName: string | null, leadId: string, texto: string) {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const db = createAdminClient()
    const { data: buyer } = await db.from('buyers').select('phone, name').eq('id', buyerId).maybeSingle()
    if (!buyer?.phone) return false
    // Idioma do corretor (cron/webhook não enxerga cookie); falha no lookup vira 'pt'
    const L = trad(await localeDoBuyer(db, buyerId))
    const quem = leadName || L('Seu lead', 'Your lead', 'Tu lead')
    const msg = `💬 *${L(`${quem} respondeu seu SMS!`, `${quem} replied to your SMS!`, `¡${quem} respondió a tu SMS!`)}*

"${texto.slice(0, 300)}"

${L('Responda pela aba Conversa do lead:', "Reply from the lead's Conversation tab:", 'Responde desde la pestaña Conversación del lead:')}
🔗 lead4producers.com/dashboard/whatsapp?lead=${leadId}`
    return await sendWhatsApp(buyer.phone, msg)
  } catch (e) {
    console.error('[Notify] aviso de SMS ao dono falhou:', (e as any)?.message)
    return false
  }
}

/** Avisa o GRUPO de controle sobre uma NOVA COMPRA (pacote de leads/appointments ou assinatura). */
/**
 * Alerta pro time: GRUPO (primário) + NÚMERO DIRETO do admin (backup).
 *
 * POR QUE O BACKUP EXISTE: o envio pro grupo (@g.us) hoje NÃO entrega — o
 * whatsapp-web.js aceita, devolve noAck e a mensagem SOME sem erro. 9 vendas
 * (Joelma, Roberta, Fabiana x3, Marcos, Carla, Renata, Sidnei) se perderam
 * assim, sem ninguém saber. O número direto entrega (comprovado). Enquanto o
 * grupo não voltar, é o backup que garante que o alerta chega.
 *
 * O direto é best-effort e isolado: falha dele não derruba o retorno do grupo.
 */
export async function notifyAdmins(msg: string): Promise<{ groupOk: boolean; directOk: boolean }> {
  const adminGroupId = process.env.WHATSAPP_ADMIN_GROUP || '120363403347083071@g.us'
  const adminPhone = process.env.ADMIN_WHATSAPP || '18632808023'
  const groupOk = await sendWhatsApp(adminGroupId, msg)
  let directOk = false
  if (adminPhone) {
    try {
      directOk = await sendWhatsApp(adminPhone, msg)
    } catch (e: any) {
      console.warn('[Notify] backup direto do admin falhou:', e?.message)
    }
  }
  if (!groupOk && !directOk) console.error('[Notify] alerta NAO chegou nem no grupo nem no direto:', msg.slice(0, 60))
  return { groupOk, directOk }
}

export async function notifyGroupPurchase(p: {
  name: string | null; email: string | null; description: string; amount: number;
  kind: 'pacote' | 'assinatura' | 'renovacao'
}) {
  const head = p.kind === 'renovacao' ? '🔁 *RENOVAÇÃO*' : p.kind === 'assinatura' ? '🟣 *NOVA ASSINATURA*' : '🛒 *NOVA COMPRA*'
  const msg = `${head}

👤 *${p.name || '—'}*
📧 ${p.email || '—'}
🧾 ${p.description}
💵 US$ ${p.amount.toFixed(2)}`
  // Grupo + direto: venda é dinheiro entrando, não pode sumir num buraco de entrega.
  const { groupOk, directOk } = await notifyAdmins(msg)
  console.log(`[Notify] venda "${p.description}" US$${p.amount.toFixed(2)} — grupo=${groupOk} direto=${directOk}`)
}

interface Buyer {
  name: string
  email: string
  phone: string
  /**
   * 2º número (opcional) que TAMBÉM recebe o alerta de Novo Lead.
   * Só destinatário — não conecta bridge/QR. Envio best-effort (ver abaixo).
   */
  notification_phone_2?: string | null
}

interface Lead {
  id?: string
  name: string
  phone: string
  city: string
  state: string
  interest: string
}

/**
 * Send email notification to buyer when a new lead is assigned.
 */
export async function sendLeadNotificationEmail(buyer: Buyer, lead: Lead): Promise<boolean> {
  // REGRA UNIVERSAL: lead MANUAL (sem meta_lead_id) NUNCA gera notificacao de "novo
  // lead". Cadastro/upload do proprio comprador NAO e entrega da plataforma —
  // notificar quebra a confianca (cliente acha que mexemos no lead dele).
  try {
    if ((lead as any).id) {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const { data: src } = await createAdminClient()
        .from('leads').select('meta_lead_id').eq('id', (lead as any).id).maybeSingle()
      if (src && !src.meta_lead_id) {
        console.log(`[Notify] Lead ${(lead as any).id} e MANUAL — pula notificacao (regra: manual nao notifica).`)
        return false
      }
    }
  } catch { /* se a checagem falhar, segue o fluxo normal */ }

  // Idioma do corretor pros avisos abaixo (push, email, WhatsApp). Cron/webhook não
  // enxerga o cookie de idioma → busca no settings; qualquer falha cai em 'pt'.
  let L = trad('pt')
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    L = trad(await localeDoBuyer(createAdminClient(), (buyer as any).id))
  } catch { /* mantém 'pt' */ }

  // Fire-and-forget push
  try {
    const { pushToBuyer } = await import('@/lib/push-notify')
    pushToBuyer((buyer as any).id || '', {
      title: `🎯 ${L('Novo lead', 'New lead', 'Nuevo lead')} — ${lead.name}`,
      body: `${lead.state} · ${lead.interest}. ${L('Ligue nos próximos 5 minutos!', 'Call within the next 5 minutes!', '¡Llama en los próximos 5 minutos!')}`,
      url: '/dashboard/leads',
      tag: `lead-${lead.id}`,
    }).catch(err => console.error('[Push] err', err))
  } catch (e) {}

  try {
    await getResend().emails.send({
      from: 'Lead4Producers <onboarding@resend.dev>',
      to: buyer.email,
      subject: `${L('Novo Lead!', 'New Lead!', '¡Nuevo Lead!')} ${lead.name} — ${lead.state}`,
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
          <div style="background:#1a56db;color:#fff;padding:20px;border-radius:12px 12px 0 0;">
            <h2 style="margin:0;">${L('Novo Lead Disponivel!', 'New Lead Available!', '¡Nuevo Lead Disponible!')}</h2>
          </div>
          <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
            <p style="color:#64748b;margin-top:0;">${L(`Ola ${buyer.name}, voce recebeu um novo lead exclusivo:`, `Hi ${buyer.name}, you've received a new exclusive lead:`, `Hola ${buyer.name}, recibiste un nuevo lead exclusivo:`)}</p>

            <div style="background:#fff;padding:16px;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:16px;">
              <p style="margin:4px 0;"><strong>${L('Nome', 'Name', 'Nombre')}:</strong> ${lead.name}</p>
              <p style="margin:4px 0;"><strong>${L('Telefone', 'Phone', 'Teléfono')}:</strong> <a href="tel:${lead.phone}" style="color:#1a56db;font-weight:700;">${lead.phone}</a></p>
              <p style="margin:4px 0;"><strong>${L('Estado', 'State', 'Estado')}:</strong> ${lead.state}</p>
              <p style="margin:4px 0;"><strong>${L('Interesse', 'Interest', 'Interés')}:</strong> ${lead.interest}</p>
            </div>

            <div style="background:#fef3c7;padding:12px;border-radius:8px;margin-bottom:16px;">
              <p style="margin:0;font-size:14px;color:#92400e;">
                ⚡ <strong>${L('Ligue nos proximos 5 minutos!', 'Call within the next 5 minutes!', '¡Llama en los próximos 5 minutos!')}</strong> ${L('Leads contactados rapidamente tem 3x mais chance de conversao.', 'Leads contacted quickly are 3x more likely to convert.', 'Los leads contactados rápido tienen 3x más probabilidad de conversión.')}
              </p>
            </div>

            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard"
               style="display:block;text-align:center;background:#1a56db;color:#fff;padding:14px;border-radius:8px;text-decoration:none;font-weight:700;">
              ${L('Ver no Painel', 'Open Dashboard', 'Ver en el Panel')}
            </a>
          </div>
        </div>
      `,
    })
    console.log(`[Notify] Email sent to ${buyer.email} for lead ${lead.name}`)
  } catch (error) {
    console.error('[Notify] Failed to send email:', error)
  }

  // WhatsApp notification to ADMIN GROUP "Atendimento EUA"
  const adminGroupId = process.env.WHATSAPP_ADMIN_GROUP || '120363403347083071@g.us'
  const adminMsg = `🔔 *NOVO LEAD RECEBIDO*

📋 *${lead.name}*
📞 ${lead.phone}
📍 ${lead.state}
💡 ${lead.interest}

👤 Distribuido para: *${buyer.name}*
📧 ${buyer.email}`

  // Send to group (primary) + admin direct (backup)
  const groupOk = await sendWhatsApp(adminGroupId, adminMsg)
  const adminPhone = process.env.ADMIN_WHATSAPP || '18632808023'
  if (adminPhone) await sendWhatsApp(adminPhone, adminMsg)

  // WhatsApp notification to BUYER
  let buyerOk = false
  const onlyDigits = (s: string | null | undefined) => String(s || '').replace(/\D/g, '')
  const phone2 = String(buyer.notification_phone_2 || '').trim()
  if (buyer.phone || phone2) {
    const whatsappMsg = `🎯 *${L('Novo Lead — Lead4Producers!', 'New Lead — Lead4Producers!', '¡Nuevo Lead — Lead4Producers!')}*

📋 *${lead.name}*
📞 ${lead.phone}
📍 ${lead.state}
💡 ${lead.interest}

⚡ ${L('Ligue nos proximos 5 minutos!', 'Call within the next 5 minutes!', '¡Llama en los próximos 5 minutos!')}
🔗 lead4producers.com/dashboard`

    // O alerta "você recebeu um lead" é da PLATAFORMA pro comprador → sai SEMPRE
    // pela bridge GLOBAL (Regiane). Antes saía pela bridge PRÓPRIA do comprador
    // (getBridgeForBuyer) e quebrava quando ela estava desconectada — ex: Leandro
    // com bridge :3460 em pending_qr → buyerOk=false → notified_at nunca gravava
    // → a reconciliação reenviava o MESMO lead a cada 2 min (spam infinito).
    // A bridge própria do comprador é pra ELE falar com os leads dele, não pra
    // receber alerta da plataforma. (Self-message só se o comprador for o número
    // da própria bridge global — aí o bridge ainda devolve success, não trava.)
    if (buyer.phone) buyerOk = await sendWhatsApp(buyer.phone, whatsappMsg)

    // 2º NÚMERO (opcional): recebe o MESMO alerta de Novo Lead.
    // 3 blindagens, todas de propósito:
    //  (a) BEST-EFFORT — o resultado é IGNORADO. Se a falha dele contasse pra
    //      buyerOk/notified_at, a reconciliação reenviaria o lead a cada 2min
    //      = o loop de spam (150 msgs) que já aconteceu. NUNCA acoplar.
    //  (b) Pula se for o MESMO número do principal (senão o cara recebe 2x no
    //      mesmo aparelho). Compara só dígitos: "+1 786…" == "1786…".
    //  (c) Não conecta bridge nenhuma — sai pela bridge GLOBAL, igual o principal.
    if (phone2 && onlyDigits(phone2) !== onlyDigits(buyer.phone)) {
      try {
        const ok2 = await sendWhatsApp(phone2, whatsappMsg)
        if (!ok2) console.warn(`[Notify] 2o numero (${phone2}) nao entregou — ignorado de proposito (nao afeta notified_at)`)
      } catch (e: any) {
        console.warn('[Notify] 2o numero falhou (ignorado de proposito):', e?.message)
      }
    }
  }

  // 🔒 GARANTIA: o GRUPO é o registro autoritativo de "lead processado + time
  // avisado". Carimba notified_at quando o GRUPO recebe — MESMO se o alerta ao
  // comprador falhar. Motivo: se o comprador tem telefone INVÁLIDO (ex: a conta
  // "Lead4Pro" com 498632808696), o alerta dele falha PRA SEMPRE → notified_at
  // nunca gravava → a reconciliação reenviava a cada 2min e SPAMMAVA o grupo.
  // Bridge OK (grupo entregou) + comprador falhou = problema no NÚMERO do comprador
  // (dado), não transitório — reenviar não resolve. Bridge caída → groupOk=false →
  // não carimba → reenvia quando voltar (esse é o retry legítimo).
  const buyerNotified = !buyer.phone || buyerOk
  if (groupOk && !buyerNotified) {
    console.error(`[Notify] grupo OK mas COMPRADOR falhou (telefone ${buyer.phone} inválido?) — lead ${(lead as any).id} carimbado p/ NÃO spammar. Corrigir o telefone do comprador.`)
  }
  if (groupOk && (lead as any).id) {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      await createAdminClient().from('leads').update({ notified_at: new Date().toISOString() }).eq('id', (lead as any).id)
    } catch { /* coluna pode não existir ainda — ignora */ }
  }
  return groupOk
}

/**
 * Watchdog da bridge global. Se estiver fora (ready:false), alerta o admin por
 * E-MAIL — canal que funciona mesmo com o WhatsApp fora (foi o que faltou: hoje a
 * bridge ficou 13h caída em silêncio). Throttle de 30min via settings pra não
 * spammar. Retorna se a bridge está pronta (o cron usa pra decidir reconciliar).
 */
export async function checkBridgeHealthAndAlert(): Promise<boolean> {
  const bridgeUrl = (process.env.WA_BRIDGE_URL || 'http://62.146.229.13:3457').trim().replace(/\/$/, '')
  const bridgeKey = (process.env.WA_BRIDGE_KEY || 'leadflow-bridge-2026').trim()
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const db = createAdminClient()

  let ready = false
  try {
    const res = await fetch(`${bridgeUrl}/status`, { headers: { apikey: bridgeKey } })
    const data: any = await res.json().catch(() => null)
    ready = !!(data && data.ready === true)
  } catch { ready = false }

  let alertedAt: string | null = null
  try {
    const { data } = await db.from('settings').select('value').eq('key', 'bridge_down_alerted_at').maybeSingle()
    alertedAt = (data?.value as any)?.at || null
  } catch {}

  if (ready) {
    if (alertedAt) { try { await db.from('settings').upsert({ key: 'bridge_down_alerted_at', value: { at: null }, updated_at: new Date().toISOString() }) } catch {} }
    return true
  }

  // Fora do ar: alerta no máximo 1x a cada 30min
  const recent = alertedAt && (Date.now() - new Date(alertedAt).getTime()) < 30 * 60_000
  if (recent) return false
  try {
    await getResend().emails.send({
      from: 'Lead4Producers <onboarding@resend.dev>',
      to: (process.env.ALERT_EMAIL || 'leandromesq@gmail.com').trim(),
      subject: '🚨 WhatsApp do Lead4Pro CAIU — leads sem notificação',
      html: `<div style="font-family:sans-serif">
        <h2>⚠️ A bridge de WhatsApp está desconectada</h2>
        <p>O número de notificações (Regiane) está <b>fora do ar</b> (ready:false). Enquanto isso, os avisos de lead <b>não chegam no grupo nem nos compradores</b>.</p>
        <p><b>Como resolver:</b> a Regiane abre o Lead4Pro → <b>Configurações → WhatsApp</b> → escaneia o QR.</p>
        <p>Os leads que chegarem nesse meio-tempo são <b>reenviados automaticamente</b> assim que a bridge voltar — ninguém fica sem aviso.</p>
      </div>`,
    })
    await db.from('settings').upsert({ key: 'bridge_down_alerted_at', value: { at: new Date().toISOString() }, updated_at: new Date().toISOString() })
    console.log('[Watchdog] bridge DOWN — alerta por email enviado')
  } catch (e) { console.error('[Watchdog] alert err:', (e as any)?.message) }
  return false
}

/**
 * Monitor de TODAS as bridges (não só a global). Roda no poll-leads (~2min).
 * Detecta quando a bridge de QUALQUER comprador cai e avisa o GRUPO central pra
 * o time pedir reconexão ANTES do cliente bater no erro. Rastreia o estado por
 * comprador num settings key — alerta só na TRANSIÇÃO (up->down e down->up); na
 * 1ª rodada apenas semeia o baseline (sem alertar). O alerta sai pela bridge
 * global (sendWhatsApp pro grupo), que está no ar.
 */
export async function checkAllBridgesAndAlert(): Promise<{ checked: number; down: number; alerts: number }> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const db = createAdminClient()

  const { data: buyers } = await db
    .from('buyers')
    .select('id, name, wa_bridge_url, wa_bridge_key, wa_bridge_phone')
    .not('wa_bridge_url', 'is', null)
  if (!buyers || !buyers.length) return { checked: 0, down: 0, alerts: 0 }

  let prev: Record<string, string> = {}
  try {
    const { data } = await db.from('settings').select('value').eq('key', 'wa_bridge_monitor').maybeSingle()
    prev = ((data?.value as any) || {}) as Record<string, string>
  } catch {}

  const next: Record<string, string> = {}
  let down = 0
  let alerts = 0
  for (const b of buyers) {
    if (!b.wa_bridge_url || !b.wa_bridge_key) continue
    let ready = false
    try {
      const res = await fetch(`${String(b.wa_bridge_url).replace(/\/$/, '')}/status`, {
        headers: { apikey: String(b.wa_bridge_key) },
        signal: AbortSignal.timeout(6000),
      })
      const s: any = await res.json().catch(() => null)
      ready = !!(s && s.ready === true)
    } catch { ready = false }

    const state = ready ? 'up' : 'down'
    next[b.id] = state
    if (!ready) down++

    const before = prev[b.id]
    // Só alerta em transição de um estado CONHECIDO (1ª rodada = baseline, sem spam).
    if (before && before !== state) {
      const who = (b.name || 'Comprador').trim()
      const ph = b.wa_bridge_phone ? ` (${b.wa_bridge_phone})` : ''
      try {
        if (state === 'down') {
          // ALARME DE INCÊNDIO: tem que chegar. Só-grupo ficou MUDO em 2026-07-14/16
          // (piroli, Davi Vaz e Leonel caíram e o alerta se perdeu no grupo) — por
          // isso ninguém soube que estava tudo quebrado. Agora vai no direto também.
          await notifyAdmins(`⚠️ WhatsApp de *${who}*${ph} DESCONECTOU. Peça pra reconectar: Configurações → Conectar WhatsApp → escanear o QR. Enquanto isso, as mensagens dele falham.`)
          await db.from('buyers').update({ wa_bridge_status: 'disconnected' }).eq('id', b.id)
        } else {
          await notifyAdmins(`✅ WhatsApp de *${who}*${ph} reconectou — voltou a enviar normal.`)
          await db.from('buyers').update({ wa_bridge_status: 'connected' }).eq('id', b.id)
        }
        alerts++
      } catch (e) { console.error('[BridgeMonitor] alert err:', (e as any)?.message) }
    }
  }

  try {
    await db.from('settings').upsert({ key: 'wa_bridge_monitor', value: next, updated_at: new Date().toISOString() })
  } catch {}
  console.log(`[BridgeMonitor] checked=${buyers.length} down=${down} alerts=${alerts}`)
  return { checked: buyers.length, down, alerts }
}

interface TeamMember {
  id: string
  name: string
  email: string | null
  phone: string | null
  whatsapp: string | null
  auth_user_id?: string | null
}

/**
 * Send notification to a team member when a lead is assigned to them.
 */
export async function sendTeamMemberNotification(member: TeamMember, lead: Lead, bridge?: { url: string; key: string } | null) {
  // REGRA UNIVERSAL: lead MANUAL (sem meta_lead_id) NUNCA notifica — nem o membro do
  // time. Mesmo guard do sendLeadNotificationEmail; FALTAVA aqui → lead manual
  // delegado a um membro vazava o "Novo Lead" (caso SHARON E PEOPLES).
  try {
    if ((lead as any).id) {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const { data: src } = await createAdminClient()
        .from('leads').select('campaign_name, form_name, raw_data').eq('id', (lead as any).id).maybeSingle()
      const isManual = !!src && (
        (src.raw_data as any)?.source === 'manual' ||
        src.campaign_name === 'Manual' ||
        src.form_name === 'manual_entry'
      )
      if (isManual) {
        console.log(`[Notify team] Lead ${(lead as any).id} e MANUAL — pula notificacao ao membro (regra: manual nao notifica).`)
        return
      }
    }
  } catch { /* se a checagem falhar, segue o fluxo normal */ }

  // Idioma do membro: locale é por buyer, então só existe se ele tem conta própria
  // (auth_user_id → buyers). Membro sem conta segue em 'pt' (comportamento de sempre).
  let L = trad('pt')

  // Push: se o membro tem conta propria (auth_user_id), manda push pro buyer dele
  if (member.auth_user_id) {
    try {
      const { pushToBuyer } = await import('@/lib/push-notify')
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const db = createAdminClient()
      const { data: memberBuyer } = await db.from('buyers').select('id').eq('auth_user_id', member.auth_user_id).single()
      if (memberBuyer?.id) {
        L = trad(await localeDoBuyer(db, memberBuyer.id))
        pushToBuyer(memberBuyer.id, {
          title: `🎯 ${L('Novo lead', 'New lead', 'Nuevo lead')} — ${lead.name}`,
          body: `${lead.state} · ${lead.interest}. ${L('Ligue nos próximos 5 minutos!', 'Call within the next 5 minutes!', '¡Llama en los próximos 5 minutos!')}`,
          url: `/dashboard/pipeline?lead=${(lead as any).id || ''}`,
          tag: `lead-team-${(lead as any).id || member.id}`,
        }).catch(err => console.error('[Push team] err', err))
      }
    } catch (e) { console.error('[Push team] setup failed', e) }
  }

  // Email
  if (member.email) {
    try {
      await getResend().emails.send({
        from: 'Lead4Producers <onboarding@resend.dev>',
        to: member.email,
        subject: `${L('Novo Lead!', 'New Lead!', '¡Nuevo Lead!')} ${lead.name} — ${lead.state}`,
        html: `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
            <div style="background:#6366f1;color:#fff;padding:20px;border-radius:12px 12px 0 0;">
              <h2 style="margin:0;">${L('Novo Lead pra Voce!', 'New Lead for You!', '¡Nuevo Lead para Ti!')}</h2>
            </div>
            <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
              <p style="color:#64748b;margin-top:0;">${L(`Ola ${member.name}, voce recebeu um lead exclusivo:`, `Hi ${member.name}, you've received an exclusive lead:`, `Hola ${member.name}, recibiste un lead exclusivo:`)}</p>
              <div style="background:#fff;padding:16px;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:16px;">
                <p style="margin:4px 0;"><strong>${L('Nome', 'Name', 'Nombre')}:</strong> ${lead.name}</p>
                <p style="margin:4px 0;"><strong>${L('Telefone', 'Phone', 'Teléfono')}:</strong> <a href="tel:${lead.phone}" style="color:#6366f1;font-weight:700;">${lead.phone}</a></p>
                <p style="margin:4px 0;"><strong>${L('Estado', 'State', 'Estado')}:</strong> ${lead.state}</p>
                <p style="margin:4px 0;"><strong>${L('Interesse', 'Interest', 'Interés')}:</strong> ${lead.interest}</p>
              </div>
              <div style="background:#fef3c7;padding:12px;border-radius:8px;">
                <p style="margin:0;font-size:14px;color:#92400e;">
                  ⚡ <strong>${L('Ligue nos proximos 5 minutos!', 'Call within the next 5 minutes!', '¡Llama en los próximos 5 minutos!')}</strong>
                </p>
              </div>
            </div>
          </div>
        `,
      })
      console.log(`[Notify] Team email sent to ${member.email}`)
    } catch (e) {
      console.error('[Notify] Team email failed:', e)
    }
  }

  // WhatsApp
  const memberPhone = member.whatsapp || member.phone
  if (memberPhone) {
    const msg = `🎯 *${L('Novo Lead — Lead4Producers!', 'New Lead — Lead4Producers!', '¡Nuevo Lead — Lead4Producers!')}*

📋 *${lead.name}*
📞 ${lead.phone}
📍 ${lead.state}
💡 ${lead.interest}

⚡ ${L('Ligue nos proximos 5 minutos!', 'Call within the next 5 minutes!', '¡Llama en los próximos 5 minutos!')}`

    await sendWhatsApp(memberPhone, msg, bridge)
  }
}

/**
 * Send email notification to buyer when an appointment is scheduled.
 */
export async function sendAppointmentNotificationEmail(
  buyer: Buyer,
  lead: Lead,
  scheduledAt: string,
  notes: string
) {
  try {
    // Idioma do corretor — os callers selecionam só name/email/phone, então quando
    // não vem id resolve pelo email. Qualquer falha cai em 'pt' (não derruba o envio).
    let loc: BuyerLocale = 'pt'
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const db = createAdminClient()
      let buyerId: string | null = (buyer as any).id || null
      if (!buyerId && buyer.email) {
        const { data } = await db.from('buyers').select('id').eq('email', buyer.email).maybeSingle()
        buyerId = (data as any)?.id || null
      }
      loc = await localeDoBuyer(db, buyerId)
    } catch { /* mantém 'pt' */ }
    const L = trad(loc)

    const date = new Date(scheduledAt)
    const formatted = date.toLocaleDateString(loc === 'en' ? 'en-US' : loc === 'es' ? 'es-US' : 'pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    })

    await getResend().emails.send({
      from: 'Lead4Producers <onboarding@resend.dev>',
      to: buyer.email,
      subject: `${L('Appointment Agendado!', 'Appointment Scheduled!', '¡Appointment Agendado!')} ${lead.name} — ${formatted}`,
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
          <div style="background:#ea580c;color:#fff;padding:20px;border-radius:12px 12px 0 0;">
            <h2 style="margin:0;">${L('Appointment Agendado!', 'Appointment Scheduled!', '¡Appointment Agendado!')}</h2>
          </div>
          <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
            <p style="color:#64748b;margin-top:0;">${L(`Ola ${buyer.name}, um appointment foi agendado para voce:`, `Hi ${buyer.name}, an appointment has been scheduled for you:`, `Hola ${buyer.name}, se agendó un appointment para ti:`)}</p>

            <div style="background:#fff;padding:16px;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:16px;">
              <p style="margin:4px 0;"><strong>${L('Cliente', 'Client', 'Cliente')}:</strong> ${lead.name}</p>
              <p style="margin:4px 0;"><strong>${L('Telefone', 'Phone', 'Teléfono')}:</strong> <a href="tel:${lead.phone}" style="color:#ea580c;font-weight:700;">${lead.phone}</a></p>
              <p style="margin:4px 0;"><strong>${L('Data/Hora', 'Date/Time', 'Fecha/Hora')}:</strong> ${formatted}</p>
              <p style="margin:4px 0;"><strong>${L('Interesse', 'Interest', 'Interés')}:</strong> ${lead.interest}</p>
              ${notes ? `<p style="margin:8px 0 4px;"><strong>Brief:</strong></p><p style="margin:4px 0;color:#64748b;font-size:14px;">${notes}</p>` : ''}
            </div>

            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/appointments"
               style="display:block;text-align:center;background:#ea580c;color:#fff;padding:14px;border-radius:8px;text-decoration:none;font-weight:700;">
              ${L('Ver Appointments', 'View Appointments', 'Ver Appointments')}
            </a>
          </div>
        </div>
      `,
    })
    console.log(`[Notify] Appointment email sent to ${buyer.email}`)
  } catch (error) {
    console.error('[Notify] Failed to send appointment email:', error)
  }
}

/**
 * Send admin alert when no buyers are available for distribution.
 */
export async function sendAdminAlert(message: string) {
  try {
    await getResend().emails.send({
      from: 'Lead4Producers System <onboarding@resend.dev>',
      to: process.env.ADMIN_EMAIL!,
      subject: `[Lead4Producers Alert] ${message}`,
      html: `
        <div style="font-family:sans-serif;padding:20px;">
          <h2 style="color:#dc2626;">Alerta do Sistema</h2>
          <p>${message}</p>
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/admin" style="color:#1a56db;">Ir para o Admin</a>
        </div>
      `,
    })
  } catch (error) {
    console.error('[Notify] Failed to send admin alert:', error)
  }
}
