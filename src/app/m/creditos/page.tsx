'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n-client'
import { MIcon } from '@/components/mobile/icons'
import { PRODUCTS } from '@/lib/stripe'
import { CRM_PLAN_LIST } from '@/lib/crm-plans'

interface CreditsData { totalLeads: number; totalAppts: number; crm_plan: string; crm_subscription_status: string | null; starterEligible: boolean; history: Array<{ id: string; type: string; total_purchased: number; total_used: number; price_per_unit: number; purchased_at: string }> }

export default function MobileCreditos() {
  const t = useT()
  const loc = t._locale
  const L = (pt: string, en: string, es: string) => (loc === 'en' ? en : loc === 'es' ? es : pt)
  const router = useRouter()

  const [d, setD] = useState<CreditsData | null>(null)
  const [err, setErr] = useState(false)
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('success=true')) setSuccess(true)
    fetch('/api/m/credits', { cache: 'no-store' }).then(r => (r.ok ? r.json() : Promise.reject())).then(setD).catch(() => setErr(true))
  }, [])

  async function go(endpoint: string, body?: any) {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const j = await r.json().catch(() => ({}))
      if (j.url) { window.location.href = j.url; return }
      alert(j.error || L('Não consegui abrir o checkout.', "Couldn't open checkout.", 'Error.'))
    } catch { alert(L('Erro de conexão.', 'Connection error.', 'Error.')) }
    setBusy(false)
  }

  const isPro = d?.crm_plan === 'pro'
  const leadPkgs = PRODUCTS.lead.packages.filter(p => p.id !== 'lead_5' || d?.starterEligible)

  function PkgRow({ p, type }: { p: { id: string; quantity: number; totalDisplay: number; pricePerUnit: number }; type: string }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{p.quantity} {type}{p.id === 'lead_5' ? ' · Starter' : ''}</p>
          <p className="m-muted" style={{ margin: '1px 0 0', fontSize: 12 }}>${p.pricePerUnit}/{L('cada', 'each', 'cada')}</p>
        </div>
        <button onClick={() => go('/api/checkout', { packageId: p.id })} disabled={busy} className="m-tap" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', borderRadius: 11, background: 'var(--m-grad)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>${p.totalDisplay}</button>
      </div>
    )
  }

  return (
    <div>
      <div className="m-pad" style={{ paddingTop: 6, display: 'flex', alignItems: 'center', gap: 12, height: 44 }}>
        <button onClick={() => router.push('/m/mais')} className="m-tap" style={{ background: 'none', border: 'none', color: 'var(--m-text)', display: 'flex', cursor: 'pointer', padding: 0 }}><MIcon name="arrowLeft" size={24} /></button>
        <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{L('Créditos & planos', 'Credits & plans', 'Créditos')}</p>
      </div>

      {!d && !err && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 70 }}><div className="m-spin" /></div>}
      {err && <p className="m-muted" style={{ textAlign: 'center', paddingTop: 40 }}>Não consegui carregar agora.</p>}

      {d && (
        <div className="m-pad" style={{ paddingTop: 8 }}>
          {success && <div style={{ padding: '11px 14px', borderRadius: 12, background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399', fontSize: 13, fontWeight: 600, marginBottom: 14, textAlign: 'center' }}>{L('Compra confirmada! Saldo atualizado em instantes.', 'Purchase confirmed! Balance updating shortly.', '¡Compra confirmada!')}</div>}

          {/* Saldos */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginBottom: 18 }}>
            <div className="m-card" style={{ padding: 16 }}>
              <div className="m-icb" style={{ marginBottom: 10 }}><MIcon name="coin" size={18} /></div>
              <p style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{d.totalLeads}</p>
              <p className="m-muted" style={{ margin: '1px 0 0', fontSize: 12 }}>{L('Leads disponíveis', 'Leads available', 'Leads')}</p>
            </div>
            <div className="m-card" style={{ padding: 16 }}>
              <div className="m-icb" style={{ marginBottom: 10, background: 'linear-gradient(135deg,rgba(245,158,11,0.25),rgba(236,72,153,0.2))', color: '#fbbf24' }}><MIcon name="calendar" size={18} /></div>
              <p style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{d.totalAppts}</p>
              <p className="m-muted" style={{ margin: '1px 0 0', fontSize: 12 }}>Appointments</p>
            </div>
          </div>

          {/* CRM Pro */}
          <div className="m-card" style={{ padding: 16, marginBottom: 18, border: '1px solid rgba(139,92,246,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isPro ? 12 : 10 }}>
              <span style={{ color: '#c084fc', display: 'flex' }}><MIcon name="sparkle" size={18} /></span>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>CRM Pro</p>
              {isPro && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#34d399', background: 'rgba(52,211,153,0.15)', padding: '3px 10px', borderRadius: 999 }}>{L('Ativo', 'Active', 'Activo')}</span>}
            </div>
            {isPro
              ? <button onClick={() => go('/api/billing/portal')} disabled={busy} className="m-tap" style={{ width: '100%', height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--m-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{L('Gerenciar assinatura', 'Manage subscription', 'Gestionar')}</button>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {CRM_PLAN_LIST.map(pl => (
                  <button key={pl.key} onClick={() => go('/api/checkout/subscription', { plan: pl.key })} disabled={busy} className="m-tap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderRadius: 12, background: pl.highlight ? 'rgba(139,92,246,0.16)' : 'rgba(255,255,255,0.05)', border: `1px solid ${pl.highlight ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)'}`, color: 'var(--m-text)', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{pl.label}{pl.savingsPct > 0 ? ` · -${pl.savingsPct}%` : ''}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#a5b4fc' }}>${pl.perMonth}/{L('mês', 'mo', 'mes')}</span>
                  </button>
                ))}
              </div>}
          </div>

          {/* Pacotes */}
          <div className="m-card" style={{ padding: '4px 16px', marginBottom: 14 }}>
            <p style={{ fontSize: 14, fontWeight: 700, margin: '14px 0 2px' }}>{L('Leads exclusivos', 'Exclusive leads', 'Leads exclusivos')}</p>
            {leadPkgs.map(p => <PkgRow key={p.id} p={p} type="Leads" />)}
          </div>
          <div className="m-card" style={{ padding: '4px 16px', marginBottom: 14 }}>
            <p style={{ fontSize: 14, fontWeight: 700, margin: '14px 0 2px' }}>{L('Leads frios', 'Cold leads', 'Leads fríos')}</p>
            {PRODUCTS.cold_lead.packages.map(p => <PkgRow key={p.id} p={p} type={L('Frios', 'Cold', 'Fríos')} />)}
          </div>
          <div className="m-card" style={{ padding: '4px 16px', marginBottom: 18 }}>
            <p style={{ fontSize: 14, fontWeight: 700, margin: '14px 0 2px' }}>Appointments</p>
            {PRODUCTS.appointment.packages.map(p => <PkgRow key={p.id} p={p} type="Appts" />)}
          </div>

          {/* Histórico */}
          {d.history.length > 0 && (
            <div className="m-card" style={{ padding: 16, marginBottom: 8 }}>
              <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px' }}>{L('Histórico', 'History', 'Historial')}</p>
              {d.history.map((h, i) => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: i < d.history.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{h.total_purchased} {h.type === 'appointment' ? 'Appts' : 'Leads'}</p>
                    <p className="m-muted" style={{ margin: '1px 0 0', fontSize: 11 }}>{new Date(h.purchased_at).toLocaleDateString('pt-BR')} · {h.total_purchased - h.total_used} {L('restantes', 'left', 'restantes')}</p>
                  </div>
                  <span className="m-faint" style={{ fontSize: 12 }}>${h.price_per_unit}/{L('un', 'un', 'un')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
