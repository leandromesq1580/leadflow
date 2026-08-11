'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useT } from '@/lib/i18n-client'
import { ComingSoon } from '@/components/mobile/coming-soon'

function Inner() {
  const t = useT()
  const L = (pt: string, en: string, es: string) => (t._locale === 'en' ? en : t._locale === 'es' ? es : pt)
  const sp = useSearchParams()
  const f = sp.get('f') || L('Em breve', 'Coming soon', 'Muy pronto')
  return <ComingSoon title={f} />
}

export default function MobileComingSoon() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}><div className="m-spin" /></div>}>
      <Inner />
    </Suspense>
  )
}
