'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n-client'

interface LeadPendente {
  id: string; name: string; phone: string | null; state: string | null
  interest: string | null; created_at: string; segundos: number
}

/**
 * SPEED-TO-LEAD (reconcept, Fase 1) — o balcão do "liga AGORA": leads entregues
 * ainda sem NENHUM contato, com cronômetro correndo. Verde até 60s, vermelho
 * depois — a regra da casa é contato em menos de 1 minuto. Some quando zera.
 */
export function SpeedToLead() {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [leads, setLeads] = useState<LeadPendente[] | null>(null)
  const base = useRef<number>(Date.now())
  const [, tick] = useState(0)

  useEffect(() => {
    let vivo = true
    const carregar = () => fetch('/api/speed-to-lead', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (vivo && d) { base.current = Date.now(); setLeads(d.leads || []) } })
      .catch(() => {})
    carregar()
    const poll = setInterval(carregar, 45_000)
    const relogio = setInterval(() => tick(x => x + 1), 1000)
    return () => { vivo = false; clearInterval(poll); clearInterval(relogio) }
  }, [])

  if (!leads || leads.length === 0) return null

  const fmt = (s: number) => s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`
  const extra = Math.floor((Date.now() - base.current) / 1000)

  return (
    <div className="rounded-2xl p-5 mb-6" style={{ background: 'linear-gradient(135deg,#1a1a2e,#2d1b4e)', border: '1px solid #4c1d95' }}>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-[20px] flex-shrink-0" style={{ background: '#dc2626' }}>⏱️</div>
        <div className="flex-1 min-w-[220px]">
          <p className="text-[15px] font-extrabold text-white">
            {leads.length === 1
              ? L('1 lead esperando contato', '1 lead waiting for contact', '1 lead esperando contacto')
              : L(`${leads.length} leads esperando contato`, `${leads.length} leads waiting for contact`, `${leads.length} leads esperando contacto`)}
            <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full align-middle" style={{ background: '#dc262633', color: '#fca5a5', letterSpacing: '0.08em' }}>
              ⚡ SPEED-TO-LEAD
            </span>
          </p>
          <p className="text-[12px] mt-0.5" style={{ color: '#a78bfa' }}>
            {L('Cada minuto sem ligar derruba a conversão. Regra da casa: contato em menos de 60 segundos.',
               'Every minute without calling kills conversion. House rule: contact within 60 seconds.',
               'Cada minuto sin llamar tumba la conversión. Regla de la casa: contacto en menos de 60 segundos.')}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {leads.slice(0, 3).map(l => {
            const s = l.segundos + extra
            const estourou = s >= 60
            return (
              <Link key={l.id} href={`/dashboard/leads/${l.id}`}
                className="flex items-center gap-3 rounded-xl px-3 py-2 transition-transform hover:scale-[1.02]"
                style={{ background: '#0f0a1e', border: `1px solid ${estourou ? '#dc2626' : '#059669'}` }}>
                <div>
                  <p className="text-[13px] font-bold text-white">{l.name}</p>
                  <p className="text-[10.5px]" style={{ color: '#94a3b8' }}>{[l.interest, l.state].filter(Boolean).join(' · ')}</p>
                </div>
                <span className="text-[13px] font-extrabold px-2 py-1 rounded-lg" style={{ background: estourou ? '#dc262622' : '#05966922', color: estourou ? '#f87171' : '#34d399', fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(s)}
                </span>
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-[14px]" style={{ background: '#059669' }}>📞</span>
              </Link>
            )
          })}
          {leads.length > 3 && (
            <Link href="/dashboard/leads" className="self-center text-[12px] font-bold px-3 py-2 rounded-lg" style={{ color: '#a78bfa', border: '1px dashed #4c1d95' }}>
              +{leads.length - 3} {L('mais', 'more', 'más')}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
