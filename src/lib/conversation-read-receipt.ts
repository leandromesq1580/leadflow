type DisplayedMessage = { id: string; direction: string; channel?: string; read_at?: string | null }

/** Only acknowledge SMS IDs present in the rendered thread, never newer arrivals. */
export async function acknowledgeConversation(leadId: string, messages: DisplayedMessage[], buyerId?: string) {
  const smsIds = messages.filter(m => m.channel === 'sms' && m.direction === 'in' && !m.read_at)
    .map(m => m.id.replace(/^sms-/, ''))
  const chunks = smsIds.length ? Array.from({ length: Math.ceil(smsIds.length / 200) }, (_, i) => smsIds.slice(i * 200, (i + 1) * 200)) : [[]]
  for (const sms_ids of chunks) {
    const res = await fetch('/api/whatsapp/messages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lead_id: leadId, ...(buyerId ? { buyer_id: buyerId } : {}), sms_ids }) })
    if (!res.ok) return false
  }
  return true
}
