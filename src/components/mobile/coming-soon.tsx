'use client'

import Link from 'next/link'
import { MIcon } from './icons'

export function ComingSoon({ title, note }: { title: string; note?: string }) {
  return (
    <div className="m-pad" style={{ paddingTop: 90, textAlign: 'center' }}>
      <div className="m-icb" style={{ width: 66, height: 66, borderRadius: 20, margin: '0 auto 20px' }}>
        <MIcon name="clock" size={30} />
      </div>
      <h1 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 10px' }}>{title}</h1>
      <p className="m-muted" style={{ fontSize: 14, lineHeight: 1.55, maxWidth: 290, margin: '0 auto' }}>
        {note || 'Essa tela chega na próxima atualização do app. No computador ela já está disponível normalmente.'}
      </p>
      <Link href="/m" className="m-link" style={{
        display: 'inline-block', marginTop: 26, background: 'var(--m-grad)', color: '#fff',
        padding: '12px 24px', borderRadius: 13, fontSize: 13, fontWeight: 600,
      }}>
        Voltar ao início
      </Link>
    </div>
  )
}
