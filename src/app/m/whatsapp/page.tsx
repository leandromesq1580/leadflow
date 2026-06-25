'use client'

import { useT } from '@/lib/i18n-client'
import { ComingSoon } from '@/components/mobile/coming-soon'

export default function MobileWhatsApp() {
  const t = useT()
  const loc = t._locale
  return <ComingSoon title="WhatsApp" note={loc === 'en' ? 'In-app chat is coming soon. For now, open a lead and tap WhatsApp to reply.' : loc === 'es' ? 'El chat llega pronto. Por ahora, abre un lead y toca WhatsApp para responder.' : 'O chat dentro do app chega em breve. Por enquanto, abra um lead e toque em WhatsApp pra responder.'} />
}
