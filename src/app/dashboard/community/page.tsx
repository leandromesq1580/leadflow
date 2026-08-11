import { CommunityFeed } from '@/components/community/community-feed'
import { getLocale } from '@/lib/locale'

export const dynamic = 'force-dynamic'

export default async function CommunityPage() {
  const locale = await getLocale()
  const L = (pt: string, en: string, es: string) => locale === 'en' ? en : locale === 'es' ? es : pt
  return (
    <div className="max-w-[720px]">
      <h1 className="text-[24px] font-extrabold mb-1" style={{ color: '#1a1a2e' }}>{L('Comunidade', 'Community', 'Comunidad')}</h1>
      <p className="text-[14px] mb-6" style={{ color: '#64748b' }}>{L('Troque ideias, compartilhe vendas e aprenda com quem fecha.', 'Swap ideas, share sales, and learn from those who close.', 'Intercambia ideas, comparte ventas y aprende de los que cierran.')}</p>
      <CommunityFeed theme="light" />
    </div>
  )
}
