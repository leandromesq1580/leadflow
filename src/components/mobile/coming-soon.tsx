'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n-client'
import { MIcon } from './icons'

export function ComingSoon({ title, note }: { title: string; note?: string }) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => (t._locale === 'en' ? en : t._locale === 'es' ? es : pt)
  return (
    <div className="m-pad" style={{ paddingTop: 90, textAlign: 'center' }}>
      <div className="m-icb" style={{ width: 66, height: 66, borderRadius: 20, margin: '0 auto 20px' }}>
        <MIcon name="clock" size={30} />
      </div>
      <h1 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 10px' }}>{title}</h1>
      <p className="m-muted" style={{ fontSize: 14, lineHeight: 1.55, maxWidth: 290, margin: '0 auto' }}>
        {note || L('Essa tela chega na próxima atualização do app. No computador ela já está disponível normalmente.', 'This screen arrives in the next app update. On desktop it is already available.', 'Esta pantalla llega en la próxima actualización de la app. En la computadora ya está disponible.')}
      </p>
      <Link href="/m" className="m-link" style={{
        display: 'inline-block', marginTop: 26, background: 'var(--m-grad)', color: '#fff',
        padding: '12px 24px', borderRadius: 13, fontSize: 13, fontWeight: 600,
      }}>
        {L('Voltar ao início', 'Back to home', 'Volver al inicio')}
      </Link>
    </div>
  )
}
