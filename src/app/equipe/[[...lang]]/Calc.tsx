'use client'
import { useState } from 'react'

/** Simulador aritmético: 65% menos 45% da comissão bruta. Não projeta ganho, só mostra a diferença do percentual. */
export default function Calc({ t, locale }: { t: { h: string; sub: string; label: string; others: string; us: string; month: string; year: string; disc: string }; locale: string }) {
  const [gross, setGross] = useState(10000)
  const fmt = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 }).format(n)
  const others = gross * 0.45
  const us = gross * 0.65
  const diff = us - others
  const pct = (v: number) => `${Math.round((v / us) * 100)}%`
  return (
    <div className="eq-calc">
      <h3>{t.h}</h3>
      <p className="eq-mut">{t.sub}</p>
      <label className="eq-lbl" htmlFor="eq-gross">{t.label}</label>
      <div className="eq-big-num">{fmt(gross)}</div>
      <input id="eq-gross" type="range" min={2000} max={40000} step={500} value={gross} onChange={e => setGross(Number(e.target.value))} className="eq-range" aria-label={t.label} />
      <div className="eq-bars">
        <div className="eq-bar-row"><span>{t.others}</span><div className="eq-track"><div className="eq-fill eq-fill-o" style={{ width: pct(others) }} /></div><b>{fmt(others)}</b></div>
        <div className="eq-bar-row"><span>{t.us}</span><div className="eq-track"><div className="eq-fill eq-fill-u" style={{ width: '100%' }} /></div><b>{fmt(us)}</b></div>
      </div>
      <div className="eq-diff">
        <div><strong>+{fmt(diff)}</strong><span>{t.month}</span></div>
        <div><strong>+{fmt(diff * 12)}</strong><span>{t.year}</span></div>
      </div>
      <p className="eq-tiny">{t.disc}</p>
    </div>
  )
}
