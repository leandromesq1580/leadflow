import { SequenceRejectedSettled } from './sequence-batch'
import type { createAdminClient } from './supabase/admin'
import {
  COMPANY_WHATSAPP_PHONE,
  cloudAutomationEnabled,
  getWhatsAppCloudConfig,
  normalizeCloudRecipient,
  sendCloudTemplate,
  sendCloudText,
  verifyCompanyCloudPhone,
  type WhatsAppCloudConfig,
} from './wa-cloud'

type Db = ReturnType<typeof createAdminClient>
type Locale = 'pt' | 'en' | 'es'
type MessageContext = { phone: string; leadId: string; buyerId: string; templateKey: string; locale: Locale }
type MessageContent =
  | { name: string; language: string; body: string }
  | { name: null; language: null; body: null }

export type CloudMessagePlan = Omit<MessageContext, 'phone'> & {
  config: WhatsAppCloudConfig
  to: string
  body: string | null
  content: MessageContent
}

type Dispatch = { operationId: string; body: string }
let verifiedPhone: { id: string; version: string; until: number } | undefined

async function confirmConfiguredPhone(config: WhatsAppCloudConfig): Promise<boolean> {
  if (verifiedPhone?.id === config.phoneNumberId && verifiedPhone.version === config.graphVersion
    && verifiedPhone.until > Date.now()) return true
  if (!await verifyCompanyCloudPhone(config)) return false
  verifiedPhone = { id: config.phoneNumberId, version: config.graphVersion, until: Date.now() + 60_000 }
  return true
}

export class CloudMessageWithheld extends Error {
  constructor() {
    super('WhatsApp Cloud: envio retido por configuração, consentimento, janela ou modelo')
  }
}

export async function prepareCloudMessage(db: Db, context: MessageContext): Promise<CloudMessagePlan | null> {
  const config = getWhatsAppCloudConfig()
  const to = normalizeCloudRecipient(context.phone)
  if (!cloudAutomationEnabled() || !config || !to || to === COMPANY_WHATSAPP_PHONE) return null
  const { leadId, buyerId, templateKey, locale } = context
  const { data, error } = await db.rpc('wa_cloud_message_plan', {
    p_phone: to, p_lead_id: leadId, p_buyer_id: buyerId, p_source_key: templateKey, p_locale: locale,
  }).abortSignal(AbortSignal.timeout(5000))
  if (error) throw new Error('WhatsApp Cloud: consulta de permissão indisponível')
  if (!data || !await confirmConfiguredPhone(config)) return null
  const content = data as MessageContent
  return { config, leadId, buyerId, templateKey, locale, to, body: content.body, content }
}

async function reserveCloudMessage(db: Db, plan: CloudMessagePlan, dispatch: Dispatch, enrollmentId: string | null) {
  const { data, error } = await db.rpc('reserve_wa_cloud_dispatch', {
    p_operation_id: dispatch.operationId,
    p_phone: plan.to,
    p_lead_id: plan.leadId,
    p_buyer_id: plan.buyerId,
    p_source_key: plan.templateKey,
    p_locale: plan.locale,
    p_plan: plan.content,
    p_body: dispatch.body,
    p_enrollment_id: enrollmentId,
  }).abortSignal(AbortSignal.timeout(5000))
  if (error) throw new Error('WhatsApp Cloud: reserva indisponível')
  return data === true
}

export function beginCloudSequence(db: Db, plan: CloudMessagePlan, input: Dispatch & { enrollmentId: string }) {
  return reserveCloudMessage(db, plan, input, input.enrollmentId)
}

export async function dispatchCloudMessage(db: Db, plan: CloudMessagePlan, input: Dispatch & { alreadyReserved?: boolean }) {
  if (!input.alreadyReserved && !await reserveCloudMessage(db, plan, input, null)) {
    throw new CloudMessageWithheld()
  }
  const { operationId, body } = input
  const { config, to, content } = plan
  const result = content.name === null
    ? await sendCloudText(config, { to, body, operationId })
    : await sendCloudTemplate(config, { to, name: content.name, language: content.language, operationId })
  const messageId = result.kind === 'accepted' ? result.messageId : null
  const { data, error } = await db.rpc('finish_wa_cloud_dispatch', {
    p_operation_id: operationId, p_message_id: messageId, p_status: result.kind,
  }).abortSignal(AbortSignal.timeout(5000))

  if (result.kind === 'rejected') {
    if (input.alreadyReserved && !error && data === true) {
      const settled = await db.rpc('settle_wa_cloud_sequence_rejection', {
        p_operation_id: operationId, p_code: result.code,
      }).abortSignal(AbortSignal.timeout(5000))
      if (!settled.error && settled.data === true) throw new SequenceRejectedSettled()
    }
    throw new Error('WhatsApp Cloud: mensagem rejeitada pela Meta')
  }
  if (!messageId || error || data !== true) throw new Error('WhatsApp Cloud: envio sem confirmação persistida')
  return { id: messageId, from: COMPANY_WHATSAPP_PHONE, to }
}
