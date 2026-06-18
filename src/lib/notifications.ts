import { Resend } from 'resend'

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
  const bridgeUrl = clean(bridge?.url || process.env.WA_BRIDGE_URL || 'http://31.220.97.186:3457')
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
 * Avisa o GRUPO de controle que um lead CHEGOU mas ainda não tem dono
 * (nenhum comprador disponível por estado/horário). Garante que o grupo nunca
 * fica cego: todo lead gera aviso, mesmo os que ficam pendentes. Quando o lead
 * for finalmente distribuído, o sendLeadNotificationEmail avisa "entregue pra X".
 */
export async function notifyGroupLeadPending(lead: { name: string; phone: string; state?: string | null; interest?: string | null }) {
  const adminGroupId = process.env.WHATSAPP_ADMIN_GROUP || '120363403347083071@g.us'
  const msg = `🔔 *NOVO LEAD RECEBIDO* (aguardando distribuição)

📋 *${lead.name}*
📞 ${lead.phone}
📍 ${lead.state || '—'}
💡 ${lead.interest || 'Seguro de vida'}

⏳ Nenhum comprador disponível agora (estado/horário). Será entregue automaticamente quando a janela abrir.`
  await sendWhatsApp(adminGroupId, msg) // bridge global do grupo
}

/** Avisa o GRUPO de controle que um CLIENTE (comprador) mandou mensagem. */
export async function notifyGroupClientMessage(clientName: string | null, fromPhone: string, body: string) {
  const adminGroupId = process.env.WHATSAPP_ADMIN_GROUP || '120363403347083071@g.us'
  const msg = `👥 *MENSAGEM DE CLIENTE*

🧑‍💼 *${clientName || 'Cliente'}*
📞 +${fromPhone}

💬 "${body.slice(0, 400)}"

➡️ Responda em Admin → Atendimento a Clientes`
  await sendWhatsApp(adminGroupId, msg)
}

/** Avisa o GRUPO de controle que um lead respondeu o SMS em massa. */
export async function notifyGroupSmsReply(leadName: string | null, fromPhone: string, body: string) {
  const adminGroupId = process.env.WHATSAPP_ADMIN_GROUP || '120363403347083071@g.us'
  const msg = `📩 *RESPOSTA DE SMS*

👤 *${leadName || 'Número não cadastrado'}*
📞 +${fromPhone}

💬 "${body.slice(0, 400)}"`
  await sendWhatsApp(adminGroupId, msg)
}

interface Buyer {
  name: string
  email: string
  phone: string
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
  // Fire-and-forget push
  try {
    const { pushToBuyer } = await import('@/lib/push-notify')
    pushToBuyer((buyer as any).id || '', {
      title: `🎯 Novo lead — ${lead.name}`,
      body: `${lead.state} · ${lead.interest}. Ligue nos próximos 5 minutos!`,
      url: '/dashboard/leads',
      tag: `lead-${lead.id}`,
    }).catch(err => console.error('[Push] err', err))
  } catch (e) {}

  try {
    await getResend().emails.send({
      from: 'Lead4Producers <onboarding@resend.dev>',
      to: buyer.email,
      subject: `Novo Lead! ${lead.name} — ${lead.state}`,
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
          <div style="background:#1a56db;color:#fff;padding:20px;border-radius:12px 12px 0 0;">
            <h2 style="margin:0;">Novo Lead Disponivel!</h2>
          </div>
          <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
            <p style="color:#64748b;margin-top:0;">Ola ${buyer.name}, voce recebeu um novo lead exclusivo:</p>

            <div style="background:#fff;padding:16px;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:16px;">
              <p style="margin:4px 0;"><strong>Nome:</strong> ${lead.name}</p>
              <p style="margin:4px 0;"><strong>Telefone:</strong> <a href="tel:${lead.phone}" style="color:#1a56db;font-weight:700;">${lead.phone}</a></p>
              <p style="margin:4px 0;"><strong>Estado:</strong> ${lead.state}</p>
              <p style="margin:4px 0;"><strong>Interesse:</strong> ${lead.interest}</p>
            </div>

            <div style="background:#fef3c7;padding:12px;border-radius:8px;margin-bottom:16px;">
              <p style="margin:0;font-size:14px;color:#92400e;">
                ⚡ <strong>Ligue nos proximos 5 minutos!</strong> Leads contactados rapidamente tem 3x mais chance de conversao.
              </p>
            </div>

            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard"
               style="display:block;text-align:center;background:#1a56db;color:#fff;padding:14px;border-radius:8px;text-decoration:none;font-weight:700;">
              Ver no Painel
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
  if (buyer.phone) {
    const whatsappMsg = `🎯 *Novo Lead — Lead4Producers!*

📋 *${lead.name}*
📞 ${lead.phone}
📍 ${lead.state}
💡 ${lead.interest}

⚡ Ligue nos proximos 5 minutos!
🔗 lead4producers.com/dashboard`

    // O alerta "você recebeu um lead" é da PLATAFORMA pro comprador → sai SEMPRE
    // pela bridge GLOBAL (Regiane). Antes saía pela bridge PRÓPRIA do comprador
    // (getBridgeForBuyer) e quebrava quando ela estava desconectada — ex: Leandro
    // com bridge :3460 em pending_qr → buyerOk=false → notified_at nunca gravava
    // → a reconciliação reenviava o MESMO lead a cada 2 min (spam infinito).
    // A bridge própria do comprador é pra ELE falar com os leads dele, não pra
    // receber alerta da plataforma. (Self-message só se o comprador for o número
    // da própria bridge global — aí o bridge ainda devolve success, não trava.)
    buyerOk = await sendWhatsApp(buyer.phone, whatsappMsg)
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
  const bridgeUrl = (process.env.WA_BRIDGE_URL || 'http://31.220.97.186:3457').trim().replace(/\/$/, '')
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
export async function sendTeamMemberNotification(member: TeamMember, lead: Lead) {
  // Push: se o membro tem conta propria (auth_user_id), manda push pro buyer dele
  if (member.auth_user_id) {
    try {
      const { pushToBuyer } = await import('@/lib/push-notify')
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const db = createAdminClient()
      const { data: memberBuyer } = await db.from('buyers').select('id').eq('auth_user_id', member.auth_user_id).single()
      if (memberBuyer?.id) {
        pushToBuyer(memberBuyer.id, {
          title: `🎯 Novo lead — ${lead.name}`,
          body: `${lead.state} · ${lead.interest}. Ligue nos próximos 5 minutos!`,
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
        subject: `Novo Lead! ${lead.name} — ${lead.state}`,
        html: `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
            <div style="background:#6366f1;color:#fff;padding:20px;border-radius:12px 12px 0 0;">
              <h2 style="margin:0;">Novo Lead pra Voce!</h2>
            </div>
            <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
              <p style="color:#64748b;margin-top:0;">Ola ${member.name}, voce recebeu um lead exclusivo:</p>
              <div style="background:#fff;padding:16px;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:16px;">
                <p style="margin:4px 0;"><strong>Nome:</strong> ${lead.name}</p>
                <p style="margin:4px 0;"><strong>Telefone:</strong> <a href="tel:${lead.phone}" style="color:#6366f1;font-weight:700;">${lead.phone}</a></p>
                <p style="margin:4px 0;"><strong>Estado:</strong> ${lead.state}</p>
                <p style="margin:4px 0;"><strong>Interesse:</strong> ${lead.interest}</p>
              </div>
              <div style="background:#fef3c7;padding:12px;border-radius:8px;">
                <p style="margin:0;font-size:14px;color:#92400e;">
                  ⚡ <strong>Ligue nos proximos 5 minutos!</strong>
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
    const msg = `🎯 *Novo Lead — Lead4Producers!*

📋 *${lead.name}*
📞 ${lead.phone}
📍 ${lead.state}
💡 ${lead.interest}

⚡ Ligue nos proximos 5 minutos!`

    await sendWhatsApp(memberPhone, msg)
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
    const date = new Date(scheduledAt)
    const formatted = date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    })

    await getResend().emails.send({
      from: 'Lead4Producers <onboarding@resend.dev>',
      to: buyer.email,
      subject: `Appointment Agendado! ${lead.name} — ${formatted}`,
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
          <div style="background:#ea580c;color:#fff;padding:20px;border-radius:12px 12px 0 0;">
            <h2 style="margin:0;">Appointment Agendado!</h2>
          </div>
          <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
            <p style="color:#64748b;margin-top:0;">Ola ${buyer.name}, um appointment foi agendado para voce:</p>

            <div style="background:#fff;padding:16px;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:16px;">
              <p style="margin:4px 0;"><strong>Cliente:</strong> ${lead.name}</p>
              <p style="margin:4px 0;"><strong>Telefone:</strong> <a href="tel:${lead.phone}" style="color:#ea580c;font-weight:700;">${lead.phone}</a></p>
              <p style="margin:4px 0;"><strong>Data/Hora:</strong> ${formatted}</p>
              <p style="margin:4px 0;"><strong>Interesse:</strong> ${lead.interest}</p>
              ${notes ? `<p style="margin:8px 0 4px;"><strong>Brief:</strong></p><p style="margin:4px 0;color:#64748b;font-size:14px;">${notes}</p>` : ''}
            </div>

            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/appointments"
               style="display:block;text-align:center;background:#ea580c;color:#fff;padding:14px;border-radius:8px;text-decoration:none;font-weight:700;">
              Ver Appointments
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
