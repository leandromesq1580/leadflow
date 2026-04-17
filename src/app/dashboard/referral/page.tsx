'use client'

import { useState, useEffect } from 'react'

interface ReferralData {
  code: string
  credit_cents: number
  total_referrals: number
  rewards: Array<{ trigger: string; cents: number; granted_at: string; name: string; email: string }>
}

const TRIGGER_LABELS: Record<string, string> = {
  signup: 'Se cadastrou',
  first_purchase: '1ª compra',
  crm_subscription: 'Assinou CRM Pro',
}

export default function ReferralPage() {
  const [data, setData] = useState<ReferralData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const ref = supabaseUrl.replace('https://', '').split('.')[0]
    const cookie = document.cookie.split('; ').find(c => c.startsWith(`sb-${ref}-auth-token=`))
    if (cookie) {
      try {
        const token = JSON.parse(atob(cookie.split('=')[1]))
        const payload = JSON.parse(atob(token.access_token.split('.')[1]))
        fetchData(payload.sub)
      } catch {}
    }
  }, [])

  async function fetchData(authId: string) {
    const b = await fetch(`/api/settings?auth_user_id=${authId}`).then(r => r.json())
    if (!b?.id) { setLoading(false); return }
    const r = await fetch(`/api/referral?buyer_id=${b.id}`)
    if (r.ok) setData(await r.json())
    setLoading(false)
  }

  const link = data ? `https://lead4producers.com/register?ref=${data.code}` : ''

  async function copy() {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function share() {
    const msg = `Oi! Conheço uma plataforma de leads de seguro de vida pra corretor BR nos EUA. Se cadastrar pelo meu link, nós dois ganhamos crédito: ${link}`
    if (navigator.share) navigator.share({ text: msg, url: link })
    else window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  if (loading) return <div className="p-8 text-[13px]" style={{ color: '#64748b' }}>Carregando...</div>
  if (!data) return <div className="p-8 text-[13px]" style={{ color: '#64748b' }}>Sem dados</div>

  return (
    <div className="max-w-[720px]">
      <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>Programa de Indicação</h1>
      <p className="text-[14px] mb-6" style={{ color: '#64748b' }}>Indique corretores e ganhe crédito em dólar</p>

      {/* Credit card */}
      <div className="rounded-2xl p-6 mb-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)' }}>
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.5)' }}>Seu crédito</p>
            <p className="text-[42px] font-extrabold text-white mt-1">${(data.credit_cents / 100).toFixed(2)}</p>
            <p className="text-[12px] mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {data.total_referrals} {data.total_referrals === 1 ? 'indicação' : 'indicações'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>Recompensa</p>
            <p className="text-[13px] text-white mt-1">$25 por CRM Pro mensal</p>
            <p className="text-[13px] text-white">$100 por CRM Pro anual</p>
          </div>
        </div>
      </div>

      {/* Share link */}
      <div className="rounded-2xl p-5 mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#94a3b8' }}>Seu link de indicação</p>
        <div className="flex gap-2">
          <input readOnly value={link}
            className="flex-1 px-3 py-2 rounded-lg text-[12px] font-mono"
            style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
          <button onClick={copy}
            className="px-4 py-2 rounded-lg text-[12px] font-bold"
            style={{ background: copied ? '#10b981' : '#eef2ff', color: copied ? '#fff' : '#6366f1' }}>
            {copied ? '✓ Copiado' : 'Copiar'}
          </button>
          <button onClick={share}
            className="px-4 py-2 rounded-lg text-[12px] font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            Compartilhar
          </button>
        </div>
        <p className="text-[11px] mt-2" style={{ color: '#94a3b8' }}>
          Código: <span className="font-mono font-bold" style={{ color: '#1a1a2e' }}>{data.code}</span>
        </p>
      </div>

      {/* How it works */}
      <div className="rounded-2xl p-5 mb-6" style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}>
        <p className="text-[13px] font-bold mb-3" style={{ color: '#0c4a6e' }}>Como funciona</p>
        <ol className="space-y-2 text-[13px]" style={{ color: '#0c4a6e' }}>
          <li><b>1.</b> Compartilhe seu link com corretores</li>
          <li><b>2.</b> Eles se cadastram pelo link e começam a usar</li>
          <li><b>3.</b> Quando assinarem CRM Pro, você ganha crédito automaticamente</li>
          <li><b>4.</b> Crédito é aplicado na sua próxima compra de leads ou mensalidade</li>
        </ol>
      </div>

      {/* Rewards list */}
      {data.rewards.length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <p className="text-[13px] font-bold mb-3" style={{ color: '#1a1a2e' }}>Histórico</p>
          <div className="space-y-2">
            {data.rewards.map((r, i) => (
              <div key={i} className="flex justify-between items-center py-2" style={{ borderBottom: i < data.rewards.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <div>
                  <p className="text-[13px] font-bold" style={{ color: '#1a1a2e' }}>{r.name}</p>
                  <p className="text-[11px]" style={{ color: '#94a3b8' }}>{TRIGGER_LABELS[r.trigger]} · {new Date(r.granted_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <span className="text-[14px] font-bold" style={{ color: r.cents > 0 ? '#10b981' : '#94a3b8' }}>
                  {r.cents > 0 ? `+$${(r.cents / 100).toFixed(2)}` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
