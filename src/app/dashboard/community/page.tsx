import { CommunityFeed } from '@/components/community/community-feed'

export const dynamic = 'force-dynamic'

export default function CommunityPage() {
  return (
    <div className="max-w-[720px]">
      <h1 className="text-[24px] font-extrabold mb-1" style={{ color: '#1a1a2e' }}>Comunidade</h1>
      <p className="text-[14px] mb-6" style={{ color: '#64748b' }}>Troque ideias, compartilhe vendas e aprenda com quem fecha.</p>
      <CommunityFeed theme="light" />
    </div>
  )
}
