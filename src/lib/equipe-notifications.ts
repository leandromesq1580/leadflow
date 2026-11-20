import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEquipeWhatsApp } from '@/lib/notifications'
import { SALES_EMAIL } from '@/lib/equipe-booking'

type Payload = { name: string; email: string; phone: string; locale: 'pt'|'en'|'es'; timezone: string; slot: string }
type Job = { id: string; appointment_id: string; scheduled_for: string; lead_id: string; buyer_id: string; channel: 'email'|'whatsapp'; kind: 'confirmation'|'reminder'; payload: Payload; attempts: number }

export function equipeConfirmation(p: Payload, kind: 'confirmation'|'reminder' = 'confirmation') {
 const locale = ['pt','es'].includes(p.locale) ? p.locale : 'en'
 const when = `${new Intl.DateTimeFormat(locale, {timeZone:p.timezone,dateStyle:'full',timeStyle:'short'}).format(new Date(p.slot))} (${p.timezone})`
 const copy = {
  pt: {subject:'Conversa sobre recrutamento confirmada',intro:'Seu agendamento para conversar com Regiane sobre fazer parte da equipe está confirmado.',date:'Data e horário',contact:'Para dúvidas ou alterações, entre em contato com'},
  en: {subject:'Recruitment conversation confirmed',intro:'Your appointment to speak with Regiane about joining the team is confirmed.',date:'Date and time',contact:'For questions or changes, contact'},
  es: {subject:'Conversación de reclutamiento confirmada',intro:'Tu cita para conversar con Regiane sobre formar parte del equipo está confirmada.',date:'Fecha y hora',contact:'Para preguntas o cambios, contacta a'},
 }[locale]
 const reminder = {pt:{subject:'Lembrete: conversa sobre recrutamento',intro:'Lembrete da sua conversa com Regiane sobre fazer parte da equipe.'},en:{subject:'Reminder: recruitment conversation',intro:'A reminder of your conversation with Regiane about joining the team.'},es:{subject:'Recordatorio: conversación de reclutamiento',intro:'Recordatorio de tu conversación con Regiane sobre formar parte del equipo.'}}[locale]
 const content = kind === 'reminder' ? reminder : copy
 return {subject:content.subject,text:`${p.name},\n\n${content.intro}\n\n${copy.date}: ${when}\n\n${copy.contact} ${SALES_EMAIL}.`,when}
}

// No admin/group destination: resolve the booking owner explicitly by BOTH id and email.
// The global bridge is the transport only, not the recipient identity.
export async function dispatchEquipeNotifications(requestId: string | null = null) {
 const db = createAdminClient()
 const {data,error} = await db.rpc('equipe_claim_notifications',{request_id_filter:requestId})
 if(error) throw new Error('equipe_notification_claim_failed')
 for(const job of (data || []) as Job[]) {
  let status: 'sent'|'pending'|'unknown'|'failed' = 'pending'
  try {
   // Recheck after claiming: cancelled/rescheduled jobs may have waited in this batch.
   const {data:appointment,error:appointmentError}=await db.from('appointments').select('status,scheduled_at').eq('id',job.appointment_id).single()
   if(appointmentError) throw new Error('appointment_unavailable')
   if(!appointment || !['scheduled','confirmed'].includes(appointment.status) || Date.parse(appointment.scheduled_at)!==Date.parse(job.scheduled_for) || Date.parse(appointment.scheduled_at)<=Date.now()) {
    status='failed'
   } else {
   const p=job.payload, copy=equipeConfirmation(p,job.kind)
   if(job.channel==='email') {
    const key=(process.env.RESEND_API_KEY||'').trim()
    const from=(process.env.EMAIL_RECRUIT_FROM_EMAIL||process.env.EMAIL_CAMPAIGNS_FROM_EMAIL||process.env.RESEND_FROM_EMAIL||'').trim()
    // Never fall back to Resend's sandbox sender for real visitors.
    if(key && from && !from.includes('@resend.dev')) {
     const result=await new Resend(key).emails.send({from,to:p.email,subject:copy.subject,text:copy.text,replyTo:SALES_EMAIL},{idempotencyKey:`equipe-booking-${job.id}`})
     if(!result.error && result.data?.id) status='sent'
    }
   } else {
    const {data:owner,error:ownerError}=await db.from('buyers').select('phone,whatsapp').eq('id',job.buyer_id).eq('email',SALES_EMAIL).single()
    const phone=String(owner?.whatsapp || '').trim() || String(owner?.phone || '').trim()
    if(ownerError || !phone || !process.env.WA_BRIDGE_URL?.trim() || !process.env.WA_BRIDGE_KEY?.trim()) status='pending' // No transport attempted; safe to retry.
    else {
     status='unknown' // Once handed to WA, ambiguous failures are never replayed.
     const message=`📅 Recrutamento /equipe\n${p.name}\n${p.email}\n${p.phone}\n${copy.when}\nIdioma: ${p.locale}\nhttps://lead4producers.com/dashboard/whatsapp?lead=${encodeURIComponent(job.lead_id)}`
     if(await sendEquipeWhatsApp(phone,message)) status='sent'
    }
   }
   }
  } catch { /* No PII or credentials in logs; outbox records the channel outcome. */ }
  if(status==='pending' && job.attempts>=5) status='failed'
  const {error:saveError}=await db.from('equipe_notification_outbox').update({status,updated_at:new Date().toISOString(),next_attempt_at:new Date(Date.now()+5*60_000).toISOString()}).eq('id',job.id).eq('status','sending').eq('attempts',job.attempts)
  if(saveError) console.error('[Equipe notifications] outcome persistence failed')
 }
}
