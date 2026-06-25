'use client'

import { useT } from '@/lib/i18n-client'
import { ComingSoon } from '@/components/mobile/coming-soon'

export default function MobilePipeline() {
  const t = useT()
  const loc = t._locale
  return <ComingSoon title="Pipeline" note={loc === 'en' ? 'Your sales pipeline is coming to the app soon. On desktop it works normally.' : loc === 'es' ? 'Tu pipeline llega pronto al app. En el computador ya funciona.' : 'Seu funil de vendas chega ao app em breve. No computador já funciona normalmente.'} />
}
