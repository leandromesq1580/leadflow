'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n-client'
import { MIcon } from '@/components/mobile/icons'

interface Referral {
  code: string; credit_cents: number; total_referrals: number
  rewards: Array<{ trigger: string; cents: number; granted_at: string; name: string; email: string }>
}

export default function MobileIndicacoes() {
  const t = useT()
  const loc = t._locale
  const L = (pt: string, en: string, es: string) => (loc === 'en' ? en : loc === 'es' ? es : pt)
  const router = useRouter()

  const [ref, setRef] = useState<Referral | null>(null)
  const [err, setErr] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/m/team-context', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => {
      if (!d?.buyer_id) { setErr(true); return }
      return fetch(`/api/referral?buyer_id=${d.buyer_id}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : Promise.reject())).then(setRef)
    }).catch(() => setErr(true))
  }, [])

  const link = ref ? `https://lead4producers.com/register?ref=${ref.code}` : ''
  const triggerLabel = (tg: string) => ({ signup: L('Se cadastrou', 'Signed up', 'Se registró'), first_purchase: L('1ª compra', 'First purchase', '1ª compra'), crm_subscription: L('Assinou CRM Pro', 'Subscribed CRM Pro', 'Suscribió CRM Pro') } as Record<string, string>)[tg] || tg

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch {}
  }
  async function share() {
    const text = L(`Use meu link e ganhe no Lead4Pro: ${link}`, `Use my link on Lead4Pro: ${link}`, `Usa mi enlace en Lead4Pro: ${link}`)
    try { if (navigator.share) { await navigator.share({ text, url: link }); return } } catch { return }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  return (
    <div>
      <div className="m-pad" style={{ paddingTop: 6, display: 'flex', alignItems: 'center', gap: 12, height: 44 }}>
        <button onClick={() => router.push('/m/mais')} className="m-tap" style={{ background: 'none', border: 'none', color: 'var(--m-text)', display: 'flex', cursor: 'pointer', padding: 0 }}><MIcon name="arrowLeft" size={24} /></button>
        <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{L('Indicações', 'Referrals', 'Referidos')}</p>
      </div>

      {!ref && !err && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><div className="m-spin" /></div>}
      {err && <p className="m-muted" style={{ textAlign: 'center', paddingTop: 40 }}>{L('Não consegui carregar agora.', "Couldn't load right now.", 'No pude cargar ahora.')}</p>}

      {ref && (
        <div className="m-pad" style={{ paddingTop: 8 }}>
          <div style={{ padding: 20, borderRadius: 20, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 16px 38px -14px rgba(99,102,241,0.7)', textAlign: 'center', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{L('Você já ganhou', "You've earned", 'Ya ganaste')}</p>
            <p style={{ margin: '4px 0 10px', fontSize: 34, fontWeight: 800, color: '#fff' }}>${(ref.credit_cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.9)' }}>{ref.total_referrals} {ref.total_referrals === 1 ? L('indicação', 'referral', 'referido') : L('indicações', 'referrals', 'referidos')}</p>
          </div>

          <div className="m-card" style={{ padding: 16, marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 4px' }}>{L('Seu link', 'Your link', 'Tu enlace')}</p>
            <p className="m-faint" style={{ fontSize: 12, margin: '0 0 11px' }}>{L('Código', 'Code', 'Código')}: {ref.code}</p>
            <input className="m-input" readOnly value={link} style={{ marginBottom: 10, fontSize: 12 }} onFocus={e => e.currentTarget.select()} />
            <div style={{ display: 'flex', gap: 9 }}>
              <button onClick={copy} className="m-tap" style={{ flex: 1, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--m-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{copied ? L('✓ Copiado', '✓ Copied', '✓ Copiado') : L('Copiar', 'Copy', 'Copiar')}</button>
              <button onClick={share} className="m-tap" style={{ flex: 1, height: 44, borderRadius: 12, background: 'var(--m-grad)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{L('Compartilhar', 'Share', 'Compartir')}</button>
            </div>
          </div>

          <div className="m-card" style={{ padding: 16, marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 6px' }}>{L('Como funciona', 'How it works', 'Cómo funciona')}</p>
            <p className="m-muted" style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
              {L('Compartilhe seu link. Quem se cadastrar e assinar o CRM Pro pelo seu link te rende crédito: $25 por mensal, $100 por anual.', 'Share your link. People who sign up and subscribe CRM Pro via your link earn you credit: $25 monthly, $100 yearly.', 'Comparte tu enlace. Quien se suscriba al CRM Pro con tu enlace te da crédito: $25 mensual, $100 anual.')}
            </p>
          </div>

          {ref.rewards.length > 0 && (
            <div className="m-card" style={{ padding: 16 }}>
              <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px' }}>{L('Histórico', 'History', 'Historial')}</p>
              {ref.rewards.map((rw, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: i < ref.rewards.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rw.name || L('Anônimo', 'Anonymous', 'Anónimo')}</p>
                    <p className="m-muted" style={{ margin: '1px 0 0', fontSize: 12 }}>{triggerLabel(rw.trigger)}</p>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: rw.cents ? '#34d399' : 'var(--m-faint)' }}>{rw.cents ? `+$${(rw.cents / 100).toFixed(0)}` : '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
