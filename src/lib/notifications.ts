import { Resend } from 'resend'

let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend((process.env.RESEND_API_KEY || '').trim())
  }
  return _resend
}

/**
 * Send WhatsApp notification via Evolution API
 */
async function sendWhatsApp(phone: string, message: string) {
  const evoUrl = process.env.EVOLUTION_API_URL || 'http://31.220.97.186:8080'
  const evoKey = process.env.EVOLUTION_API_KEY || ''
  const instance = process.env.EVOLUTION_INSTANCE || 'leadflow'

  if (!evoKey) return

  // If it's a group ID (contains @g.us), use as-is. Otherwise clean phone number.
  const cleanPhone = phone.includes('@g.us') ? phone : phone.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '')

  try {
    await fetch(`${evoUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: {
        'apikey': evoKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: cleanPhone,
        textMessage: { text: message },
      }),
    })
    console.log(`[WhatsApp] Sent to ${cleanPhone}`)
  } catch (err) {
    console.error('[WhatsApp] Failed:', err)
  }
}

/**
 * Send WhatsApp via Jarvis instance (for admin group notifications)
 */
async function sendWhatsAppViaJarvis(number: string, message: string) {
  const evoUrl = process.env.EVOLUTION_API_URL || 'http://31.220.97.186:8080'
  const jarvisKey = process.env.EVOLUTION_JARVIS_KEY || ''

  if (!jarvisKey) return

  try {
    await fetch(`${evoUrl}/message/sendText/jarvis`, {
      method: 'POST',
      headers: {
        'apikey': jarvisKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number,
        textMessage: { text: message },
      }),
    })
    console.log(`[WhatsApp Jarvis] Sent to group ${number}`)
  } catch (err) {
    console.error('[WhatsApp Jarvis] Failed:', err)
  }
}

interface Buyer {
  name: string
  email: string
  phone: string
}

interface Lead {
  name: string
  phone: string
  city: string
  state: string
  interest: string
}

/**
 * Send email notification to buyer when a new lead is assigned.
 */
export async function sendLeadNotificationEmail(buyer: Buyer, lead: Lead) {
  try {
    await getResend().emails.send({
      from: 'LeadFlow <onboarding@resend.dev>',
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

  // WhatsApp notification to ADMIN GROUP (via jarvis instance - already in group)
  const adminGroupId = process.env.WHATSAPP_ADMIN_GROUP || '120363403347083071@g.us'
  const adminMsg = `🔔 *NOVO LEAD RECEBIDO*

📋 *${lead.name}*
📞 ${lead.phone}
📍 ${lead.state}
💡 ${lead.interest}

👤 Distribuido para: *${buyer.name}*
📧 ${buyer.email}`

  await sendWhatsAppViaJarvis(adminGroupId, adminMsg)

  // WhatsApp notification to BUYER
  if (buyer.phone) {
    const whatsappMsg = `🎯 *Novo Lead LeadFlow!*

📋 *${lead.name}*
📞 ${lead.phone}
📍 ${lead.state}
💡 ${lead.interest}

⚡ Ligue nos proximos 5 minutos!
🔗 leadflow-five-tawny.vercel.app/dashboard`

    await sendWhatsApp(buyer.phone, whatsappMsg)
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
      from: 'LeadFlow <onboarding@resend.dev>',
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
      from: 'LeadFlow System <onboarding@resend.dev>',
      to: process.env.ADMIN_EMAIL!,
      subject: `[LeadFlow Alert] ${message}`,
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
