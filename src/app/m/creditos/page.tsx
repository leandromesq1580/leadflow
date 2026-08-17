'use client'

import { useEffect, useState } from 'react'
import { startCheckout } from '@/lib/checkout-client'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n-client'
import { MIcon } from '@/components/mobile/icons'
import { PRODUCTS } from '@/lib/stripe'
import { PolicyCheck } from '@/components/policy-check'
import { CRM_PLAN_LIST } from '@/lib/crm-plans'
import type { PurchaseHistoryItem } from '@/lib/purchase-history'

interface CreditsData { totalLeads: number; totalAppts: number; crm_plan: string; crm_subscription_status: string | null; crm_plan_key: string | null; history: PurchaseHistoryItem[] }

export default function MobileCreditos() {
  const t = useT()
  const loc = t._locale
  const L = (pt: string, en: string, es: string) => (loc === 'en' ? en : loc === 'es' ? es : pt)
  const router = useRouter()

  const [d, setD] = useState<CreditsData | null>(null)
  const [err, setErr] = useState(false)
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)
  // No app nativo (iOS/Android) a compra fica ESCONDIDA — evita rejeição da Apple
  // por In-App Purchase (Guia 3.1.1). Detecta pelo User-Agent injetado pelo Capacitor.
  const [isNativeApp, setIsNativeApp] = useState(false)
  // Assinatura via Apple (IAP) — exigência da App Store 3.1.1: o CRM Pro precisa ser
  // comprável no app via In-App Purchase. Plugin nativo StoreKitPlugin (build ≥6).
  const [aplPrice, setAplPrice] = useState<string | null>(null)
  const [aplBusy, setAplBusy] = useState(false)
  const SK = () => (typeof window !== 'undefined' ? (window as any).Capacitor?.Plugins?.StoreKitPlugin : null)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('success=true')) setSuccess(true)
    // Detecta o app nativo por 2 sinais (robusto): User-Agent injetado OU a bridge window.Capacitor.
    if (typeof window !== 'undefined' && (/Lead4ProApp/i.test(navigator.userAgent) || !!(window as any).Capacitor)) setIsNativeApp(true)
    fetch('/api/m/credits', { cache: 'no-store' }).then(r => (r.ok ? r.json() : Promise.reject())).then(setD).catch(() => setErr(true))
    SK()?.getProduct?.().then((p: any) => { if (p?.displayPrice) setAplPrice(p.displayPrice) }).catch(() => {})
  }, [])

  // Sincroniza entitlement Apple → backend (renovações/restores) depois que os dados carregam
  useEffect(() => {
    if (!d || d.crm_subscription_status === 'active') return
    SK()?.entitlement?.().then(async (r: any) => {
      if (r?.active && r.jws) {
        const res = await fetch('/api/iap/apple', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jws: r.jws }) })
        if (res.ok) window.location.reload()
      }
    }).catch(() => {})
  }, [d])

  async function appleSubscribe() {
    if (aplBusy) return
    setAplBusy(true)
    try {
      const r = await SK()?.purchase?.()
      if (r?.status === 'success' && r.jws) {
        const res = await fetch('/api/iap/apple', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jws: r.jws }) })
        if (res.ok) { window.location.reload(); return }
        alert(L('Compra feita, mas não consegui ativar. Toque em "Restaurar compras".', 'Purchased, but activation failed. Tap "Restore purchases".', 'Error al activar.'))
      } else if (r?.status !== 'cancelled') {
        alert(L('Compra não concluída.', 'Purchase not completed.', 'Compra no completada.'))
      }
    } catch { alert(L('App Store indisponível agora.', 'App Store unavailable right now.', 'App Store no disponible.')) }
    setAplBusy(false)
  }

  async function appleRestore() {
    if (aplBusy) return
    setAplBusy(true)
    try {
      await SK()?.restore?.()
      const r = await SK()?.entitlement?.()
      if (r?.active && r.jws) {
        const res = await fetch('/api/iap/apple', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jws: r.jws }) })
        if (res.ok) { window.location.reload(); return }
      }
      alert(L('Nenhuma assinatura ativa encontrada.', 'No active subscription found.', 'No se encontró suscripción.'))
    } catch { alert(L('Não consegui restaurar agora.', "Couldn't restore right now.", 'Error.')) }
    setAplBusy(false)
  }

  async function go(endpoint: string, body?: any) {
    if (busy) return
    setBusy(true)
    try {
      const res = await startCheckout(endpoint as '/api/checkout' | '/api/checkout/subscription', body, { context: 'checkout_mobile' })
      if (res.ok) return
      alert(res.error || L('Não consegui abrir o checkout.', "Couldn't open checkout.", 'Error.'))
    } catch { alert(L('Erro de conexão.', 'Connection error.', 'Error.')) }
    setBusy(false)
  }

  const isActive = d?.crm_subscription_status === 'active'
  const currentPlanKey = d?.crm_plan_key || null
  const leadPkgs = PRODUCTS.lead.packages
  const historyLabel = (item: PurchaseHistoryItem) => {
    let label: string
    if (item.productType === 'crm') {
      const plan = CRM_PLAN_LIST.find(p => p.amountCents === Math.round(item.amount * 100))
      const planLabel = plan
        ? (loc === 'en' ? ({ mensal: 'Monthly', trimestral: 'Quarterly', semestral: 'Semi-annual', anual: 'Annual' } as Record<string, string>)[plan.key]
          : loc === 'es' ? ({ mensal: 'Mensual', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' } as Record<string, string>)[plan.key]
            : plan.label)
        : null
      label = `CRM Pro${planLabel ? ` · ${planLabel}` : ''}`
    } else if (item.productType === 'appointment') {
      label = `${item.quantity} Appointments`
    } else if (item.productType === 'cold_lead') {
      label = `${item.quantity} ${L('Leads frios', 'Cold leads', 'Leads fríos')}`
    } else {
      label = `${item.quantity} Leads`
    }
    if (item.source === 'manual_credit') return `${L('Cortesia', 'Courtesy', 'Cortesía')} · ${label}`
    if (item.source === 'bonus_credit') return `${L('Bônus CRM', 'CRM bonus', 'Bono CRM')} · ${label}`
    return label
  }
  const historyStatus = (item: PurchaseHistoryItem) => item.status === 'refunded'
    ? L('Reembolsado', 'Refunded', 'Reembolsado')
    : item.status === 'pending'
      ? L('Pendente', 'Pending', 'Pendiente')
      : item.status === 'courtesy'
        ? L('Cortesia', 'Courtesy', 'Cortesía')
        : item.status === 'bonus'
          ? L('Bônus', 'Bonus', 'Bono')
          : L('Pago', 'Paid', 'Pagado')

  // Cupom de plataforma (paridade com o web, 2026-07-24): validado no servidor; quando
  // aplicado, os pacotes de LEAD mostram o preço com desconto e o checkout recebe o código.
  const [cupom, setCupom] = useState('')
  const [cupomInfo, setCupomInfo] = useState<{ code: string; unitPrice: number } | null>(null)
  const [cupomErr, setCupomErr] = useState('')
  const [cupomBusy, setCupomBusy] = useState(false)
  async function aplicarCupom(code: string, silent = false) {
    if (!code.trim()) return
    setCupomBusy(true); setCupomErr('')
    try {
      const r = await fetch('/api/coupon/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
      const j = await r.json().catch(() => ({}))
      if (j.valid) { setCupomInfo({ code: j.code, unitPrice: j.unitPrice }); try { sessionStorage.setItem('lead_coupon', j.code) } catch {} }
      else { setCupomInfo(null); try { sessionStorage.removeItem('lead_coupon') } catch {}; if (!silent) setCupomErr(j.error || L('Cupom inválido.', 'Invalid coupon.', 'Cupón inválido.')) }
    } catch { if (!silent) setCupomErr(L('Erro ao validar.', 'Validation error.', 'Error.')) }
    setCupomBusy(false)
  }
  useEffect(() => {
    let saved = ''
    try { saved = sessionStorage.getItem('lead_coupon') || '' } catch {}
    if (saved) { setCupom(saved); aplicarCupom(saved, true) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function changePlan(planKey: string) {
    if (busy || planKey === currentPlanKey) return
    const pl = CRM_PLAN_LIST.find(p => p.key === planKey)
    if (!confirm(L(`Trocar para o plano ${pl?.label}? A diferença é calculada proporcionalmente (proração) — você não cancela nem perde o acesso.`, `Switch to ${pl?.label}? Prorated difference — no cancel, no loss of access.`, `¿Cambiar al plan ${pl?.label}? Diferencia prorrateada.`))) return
    setBusy(true)
    try {
      const r = await fetch('/api/subscription/change', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: planKey }) })
      const j = await r.json().catch(() => ({}))
      if (r.ok) { window.location.reload(); return }
      alert(j.error || L('Não consegui trocar de plano.', "Couldn't switch plan.", 'Error.'))
    } catch { alert(L('Erro de conexão.', 'Connection error.', 'Error.')) }
    setBusy(false)
  }

  function PkgRow({ p, type, isLead }: { p: { id: string; quantity: number; totalDisplay: number; pricePerUnit: number }; type: string; isLead?: boolean }) {
    // Cupom aplicado só mexe nos pacotes de LEAD (o servidor revalida no checkout)
    const per = isLead && cupomInfo ? cupomInfo.unitPrice : p.pricePerUnit
    const total = isLead && cupomInfo ? p.quantity * cupomInfo.unitPrice : p.totalDisplay
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{p.quantity} {type}</p>
          <p className="m-muted" style={{ margin: '1px 0 0', fontSize: 12 }}>
            ${per}/{L('cada', 'each', 'cada')}
            {isLead && cupomInfo && <span style={{ color: '#4ade80', fontWeight: 700 }}> · {cupomInfo.code}</span>}
          </p>
        </div>
        <button onClick={() => go('/api/checkout', { packageId: p.id, couponCode: isLead && cupomInfo ? cupomInfo.code : undefined })} disabled={busy} className="m-tap" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', borderRadius: 11, background: 'var(--m-grad)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>${total.toLocaleString('en-US')}</button>
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
      {err && <p className="m-muted" style={{ textAlign: 'center', paddingTop: 40 }}>{L('Não consegui carregar agora.', "Couldn't load right now.", 'No pude cargar ahora.')}</p>}

      {d && (
        <div className="m-pad" style={{ paddingTop: 8 }}>
          {success && <div style={{ padding: '11px 14px', borderRadius: 12, background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399', fontSize: 13, fontWeight: 600, marginBottom: 14, textAlign: 'center' }}>{L('Compra confirmada! Saldo atualizado em instantes.', 'Purchase confirmed! Balance updating shortly.', '¡Compra confirmada!')}</div>}

          {/* Saldos */}
          <div style={{ display: 'grid', gridTemplateColumns: d.totalAppts > 0 ? '1fr 1fr' : '1fr', gap: 11, marginBottom: 18 }}>
            <div className="m-card" style={{ padding: 16 }}>
              <div className="m-icb" style={{ marginBottom: 10 }}><MIcon name="coin" size={18} /></div>
              <p style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{d.totalLeads}</p>
              <p className="m-muted" style={{ margin: '1px 0 0', fontSize: 12 }}>{L('Leads disponíveis', 'Leads available', 'Leads')}</p>
            </div>
            {d.totalAppts > 0 && (
              <div className="m-card" style={{ padding: 16 }}>
                <div className="m-icb" style={{ marginBottom: 10, background: 'linear-gradient(135deg,rgba(245,158,11,0.25),rgba(236,72,153,0.2))', color: '#fbbf24' }}><MIcon name="calendar" size={18} /></div>
                <p style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{d.totalAppts}</p>
                <p className="m-muted" style={{ margin: '1px 0 0', fontSize: 12 }}>Appointments</p>
              </div>
            )}
          </div>

          {isNativeApp && (
            <div className="m-card" style={{ padding: 16, marginBottom: 18, border: isActive ? undefined : '1px solid rgba(139,92,246,0.4)' }}>
              {isActive ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#c084fc', display: 'flex' }}><MIcon name="sparkle" size={18} /></span>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>CRM Pro</p>
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#34d399', background: 'rgba(52,211,153,0.15)', padding: '3px 10px', borderRadius: 999 }}>{L('Ativo', 'Active', 'Activo')}</span>
                  </div>
                  <p className="m-muted" style={{ fontSize: 12, margin: '10px 0 0', lineHeight: 1.5 }}>
                    {L('Sua assinatura está ativa. Assinaturas feitas pelo App Store são gerenciadas nos Ajustes do iPhone.', 'Your subscription is active. App Store subscriptions are managed in iPhone Settings.', 'Suscripción activa.')}
                  </p>
                </>
              ) : (
                <>
                  {/* Paywall IAP (App Store 3.1.1): assinatura comprável via Apple.
                      3.1.2: título + preço/período + links de Termos e Privacidade. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ color: '#c084fc', display: 'flex' }}><MIcon name="sparkle" size={18} /></span>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>CRM Pro</p>
                  </div>
                  <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800 }}>{aplPrice || '$99.99'}<span className="m-muted" style={{ fontSize: 13, fontWeight: 600 }}>/{L('mês', 'month', 'mes')}</span></p>
                  <p className="m-muted" style={{ fontSize: 12, margin: '0 0 12px', lineHeight: 1.5 }}>
                    {L('Pipeline, time, sequências e automações. Renovação automática mensal; cancele quando quiser nos Ajustes.', 'Pipeline, team, sequences and automations. Auto-renews monthly; cancel anytime in Settings.', 'Pipeline, equipo, secuencias y automatizaciones. Renovación mensual.')}
                  </p>
                  <button onClick={appleSubscribe} disabled={aplBusy} className="m-tap" style={{ width: '100%', height: 48, borderRadius: 13, background: 'var(--m-grad)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: aplBusy ? 0.6 : 1 }}>
                    {aplBusy ? L('Abrindo…', 'Opening…', 'Abriendo…') : L('Assinar pelo App Store', 'Subscribe via App Store', 'Suscribir por App Store')}
                  </button>
                  <button onClick={appleRestore} disabled={aplBusy} className="m-tap" style={{ width: '100%', height: 38, marginTop: 6, borderRadius: 12, background: 'transparent', border: 'none', color: 'var(--m-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {L('Restaurar compras', 'Restore purchases', 'Restaurar compras')}
                  </button>
                  <p className="m-faint" style={{ fontSize: 10.5, margin: '6px 0 0', textAlign: 'center' }}>
                    <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{L('Termos de Uso', 'Terms of Use', 'Términos')}</a>
                    {' · '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{L('Privacidade', 'Privacy Policy', 'Privacidad')}</a>
                  </p>
                </>
              )}
              <p className="m-muted" style={{ fontSize: 12, lineHeight: 1.55, margin: '14px 0 0', textAlign: 'center' }}>
                {L('Seus créditos de leads são gerenciados na sua conta Lead4Pro.', 'Your lead credits are managed in your Lead4Pro account.', 'Tus créditos se gestionan en tu cuenta Lead4Pro.')}
              </p>
            </div>
          )}

          {!isNativeApp && <>
          {/* CRM Pro */}
          <div className="m-card" style={{ padding: 16, marginBottom: 18, border: '1px solid rgba(139,92,246,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ color: '#c084fc', display: 'flex' }}><MIcon name="sparkle" size={18} /></span>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>CRM Pro{isActive && currentPlanKey ? ` · ${CRM_PLAN_LIST.find(p => p.key === currentPlanKey)?.label || ''}` : ''}</p>
              {isActive && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#34d399', background: 'rgba(52,211,153,0.15)', padding: '3px 10px', borderRadius: 999 }}>{L('Ativo', 'Active', 'Activo')}</span>}
            </div>
            {isActive
              ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={() => go('/api/billing/portal')} disabled={busy} className="m-tap" style={{ width: '100%', height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--m-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{L('Gerenciar assinatura', 'Manage subscription', 'Gestionar')}</button>
                <p className="m-muted" style={{ fontSize: 12, margin: '6px 0 0', fontWeight: 600 }}>{L('Trocar de plano', 'Change plan', 'Cambiar de plan')}</p>
                {CRM_PLAN_LIST.map(pl => {
                  const atual = pl.key === currentPlanKey
                  return (
                    <button key={pl.key} onClick={() => changePlan(pl.key)} disabled={busy || atual} className="m-tap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderRadius: 12, background: atual ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.05)', border: `1px solid ${atual ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.1)'}`, color: 'var(--m-text)', cursor: atual ? 'default' : 'pointer', opacity: busy && !atual ? 0.6 : 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{pl.label}{pl.savingsPct > 0 ? ` · -${pl.savingsPct}%` : ''}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: atual ? '#34d399' : '#a5b4fc' }}>{atual ? L('Atual', 'Current', 'Actual') : `$${pl.perMonth}/${L('mês', 'mo', 'mes')}`}</span>
                    </button>
                  )
                })}
              </div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {CRM_PLAN_LIST.map(pl => (
                  <button key={pl.key} onClick={() => go('/api/checkout/subscription', { plan: pl.key })} disabled={busy} className="m-tap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderRadius: 12, background: pl.highlight ? 'rgba(139,92,246,0.16)' : 'rgba(255,255,255,0.05)', border: `1px solid ${pl.highlight ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)'}`, color: 'var(--m-text)', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{pl.label}{pl.savingsPct > 0 ? ` · -${pl.savingsPct}%` : ''}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#a5b4fc' }}>${pl.perMonth}/{L('mês', 'mo', 'mes')}</span>
                  </button>
                ))}
              </div>}
          </div>

          {/* Aceite das políticas (gate de compra) */}
          <PolicyCheck context="checkout_mobile" dark />

          {/* Cupom (aplica nos pacotes de lead) */}
          <div className="m-card" style={{ padding: '12px 16px', marginBottom: 14 }}>
            {cupomInfo ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#4ade80', flex: 1 }}>
                  ✅ {L('Cupom', 'Coupon', 'Cupón')} {cupomInfo.code} — ${cupomInfo.unitPrice}/lead
                </p>
                <button onClick={() => { setCupomInfo(null); setCupom(''); try { sessionStorage.removeItem('lead_coupon') } catch {} }} className="m-tap"
                  style={{ background: 'none', border: 'none', color: 'var(--m-muted)', fontSize: 12, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}>
                  {L('Remover', 'Remove', 'Quitar')}
                </button>
              </div>
            ) : (
              <>
                <p className="m-muted" style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600 }}>{L('Tem um cupom?', 'Have a coupon?', '¿Tienes cupón?')}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={cupom} onChange={e => setCupom(e.target.value.toUpperCase())} placeholder={L('CÓDIGO', 'CODE', 'CÓDIGO')}
                    style={{ flex: 1, height: 40, borderRadius: 11, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--m-text)', padding: '0 12px', fontSize: 13, fontWeight: 700, letterSpacing: 1 }} />
                  <button onClick={() => aplicarCupom(cupom)} disabled={cupomBusy || !cupom.trim()} className="m-tap"
                    style={{ height: 40, padding: '0 16px', borderRadius: 11, background: 'var(--m-grad)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: cupomBusy || !cupom.trim() ? 0.5 : 1 }}>
                    {cupomBusy ? '...' : L('Aplicar', 'Apply', 'Aplicar')}
                  </button>
                </div>
                {cupomErr && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#f87171' }}>{cupomErr}</p>}
              </>
            )}
          </div>

          {/* Pacotes */}
          <div className="m-card" style={{ padding: '4px 16px', marginBottom: 14 }}>
            <p style={{ fontSize: 14, fontWeight: 700, margin: '14px 0 2px' }}>{L('Leads exclusivos', 'Exclusive leads', 'Leads exclusivos')}</p>
            {leadPkgs.map(p => <PkgRow key={p.id} p={p} type="Leads" isLead />)}
          </div>
          <div className="m-card" style={{ padding: '4px 16px', marginBottom: 14 }}>
            <p style={{ fontSize: 14, fontWeight: 700, margin: '14px 0 2px' }}>{L('Leads frios', 'Cold leads', 'Leads fríos')}</p>
            {PRODUCTS.cold_lead.packages.map(p => <PkgRow key={p.id} p={p} type={L('Frios', 'Cold', 'Fríos')} />)}
          </div>
          </>}

          {/* Histórico unificado: pacotes, assinatura CRM e ajustes de crédito */}
          {d.history.length > 0 && (
            <div className="m-card" style={{ padding: 16, marginBottom: 8 }}>
              <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px' }}>{L('Compras e assinaturas', 'Purchases & subscriptions', 'Compras y suscripciones')}</p>
              {d.history.map((h, i) => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: i < d.history.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{historyLabel(h)}</p>
                    <p className="m-muted" style={{ margin: '1px 0 0', fontSize: 11 }}>
                      {new Date(h.purchasedAt).toLocaleDateString(loc === 'en' ? 'en-US' : loc === 'es' ? 'es-US' : 'pt-BR')} · {historyStatus(h)}
                      {h.remaining !== null ? ` · ${h.remaining} ${L('restantes', 'left', 'restantes')}` : ''}
                    </p>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: h.status === 'refunded' ? '#f87171' : h.status === 'pending' ? '#fbbf24' : h.source === 'payment' ? '#4ade80' : 'var(--m-muted)', marginLeft: 12, whiteSpace: 'nowrap' }}>
                    {h.source === 'payment' ? `$${h.amount.toFixed(2)}` : historyStatus(h)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
