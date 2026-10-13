'use client'

/** Separate channels: color is reinforced by a text label, never color alone. */
export function ReplyBadges({ whatsapp = 0, sms = 0 }: { whatsapp?: number; sms?: number }) {
  return <span className="inline-flex items-center gap-1" aria-live="polite">
    {whatsapp > 0 && <span aria-label={`WhatsApp: ${whatsapp}`} className="inline-flex items-center justify-center rounded-full text-[10px] font-extrabold text-white" style={{ background: '#dc2626', minHeight: 22, padding: '0 7px' }}>💬 {whatsapp > 99 ? '99+' : whatsapp}</span>}
    {sms > 0 && <span aria-label={`SMS: ${sms}`} className="inline-flex items-center justify-center rounded-full text-[10px] font-extrabold text-white" style={{ background: '#15803d', minHeight: 22, padding: '0 7px' }}>💬 SMS {sms > 99 ? '99+' : sms}</span>}
  </span>
}
