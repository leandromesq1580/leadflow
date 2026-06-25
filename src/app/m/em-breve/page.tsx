'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ComingSoon } from '@/components/mobile/coming-soon'

function Inner() {
  const sp = useSearchParams()
  const f = sp.get('f') || 'Em breve'
  return <ComingSoon title={f} />
}

export default function MobileComingSoon() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}><div className="m-spin" /></div>}>
      <Inner />
    </Suspense>
  )
}
