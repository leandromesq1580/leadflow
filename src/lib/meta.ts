// Meta Lead Ads Webhook — parse incoming lead data

export interface MetaLeadData {
  meta_lead_id: string
  name: string
  email: string
  phone: string
  city: string
  state: string
  interest: string
  campaign_name: string
  form_name: string
  raw_data: Record<string, unknown>
}

/**
 * Parse Meta Lead Ads webhook payload into structured lead data.
 * Meta sends leads in this format:
 * {
 *   "entry": [{
 *     "changes": [{
 *       "value": {
 *         "leadgen_id": "...",
 *         "form_id": "...",
 *         "field_data": [
 *           { "name": "full_name", "values": ["João Silva"] },
 *           { "name": "email", "values": ["joao@email.com"] },
 *           { "name": "phone_number", "values": ["+14075551234"] },
 *           { "name": "city", "values": ["Orlando"] },
 *           { "name": "state", "values": ["FL"] },
 *           { "name": "interest", "values": ["Seguro de vida"] }
 *         ]
 *       }
 *     }]
 *   }]
 * }
 */
export function parseMetaWebhook(body: Record<string, unknown>): MetaLeadData | null {
  try {
    const entry = (body.entry as Array<Record<string, unknown>>)?.[0]
    if (!entry) return null

    const changes = (entry.changes as Array<Record<string, unknown>>)?.[0]
    if (!changes) return null

    const value = changes.value as Record<string, unknown>
    if (!value) return null

    const fieldData = value.field_data as Array<{ name: string; values: string[] }>
    if (!fieldData) return null

    const getField = (name: string): string => {
      const field = fieldData.find(f =>
        f.name.toLowerCase().includes(name.toLowerCase())
      )
      return field?.values?.[0] || ''
    }

    return {
      meta_lead_id: String(value.leadgen_id || ''),
      name: getField('full_name') || getField('name') || '',
      email: getField('email') || '',
      phone: getField('phone') || getField('phone_number') || '',
      city: getField('city') || getField('cidade') || '',
      state: getField('state') || getField('estado') || '',
      interest: getField('interest') || getField('interesse') || 'Seguro de vida',
      campaign_name: String(value.campaign_name || entry.campaign_name || 'Meta Campaign'),
      form_name: String(value.form_name || 'Lead Form'),
      raw_data: body,
    }
  } catch {
    console.error('Failed to parse Meta webhook payload')
    return null
  }
}

/**
 * Verify Meta webhook signature (HMAC SHA256).
 */
export function verifyMetaSignature(
  payload: string,
  signature: string,
  appSecret: string
): boolean {
  // In production, verify HMAC-SHA256 signature
  // For now, we verify the token in the GET request
  if (!appSecret) return true

  try {
    const crypto = require('crypto')
    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(payload)
      .digest('hex')
    return `sha256=${expectedSignature}` === signature
  } catch {
    return false
  }
}
