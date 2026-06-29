'use client'

import { useT } from '@/lib/i18n-client'
import { CommunityFeed } from '@/components/community/community-feed'

export default function MobileComunidade() {
  const t = useT()
  const loc = t._locale
  const L = (pt: string, en: string, es: string) => (loc === 'en' ? en : loc === 'es' ? es : pt)

  return (
    <div className="m-pad" style={{ paddingTop: 6 }}>
      <p style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 800 }}>{L('Comunidade', 'Community', 'Comunidad')}</p>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: '#9aa0ac' }}>{L('Troque ideias e compartilhe vendas com quem fecha.', 'Share ideas and wins with closers.', 'Comparte ideas y ventas con quienes cierran.')}</p>
      <CommunityFeed theme="dark" />
    </div>
  )
}
