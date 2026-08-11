'use client'

import { useEffect, useMemo, useState } from 'react'
import { useT } from '@/lib/i18n-client'

/**
 * CALCULADORA DE RENTABILIDADE — custo de compra de leads vs receita de apólices.
 *
 * A matemática segue o padrão do mercado de vida (comp National Life e afins):
 * comissão = AP × %, paga em adiantamento (75%) + diferido (25%). O GANHO LÍQUIDO
 * da projeção usa SÓ o adiantamento — é o caixa que entra de fato no mês; o
 * diferido aparece à parte como "a receber". Chargebacks inflam os leads
 * necessários por fechamento (lead pago que não vira receita).
 *
 * Diferencial da casa: o corretor pode pré-carregar a PRÓPRIA taxa de fechamento
 * e o AP médio real (via /api/analytics, 90 dias) em vez de chutar no slider.
 */

const money = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`

interface Reais {
  recebidos: number
  fechados: number
  taxa: number
  apMedio: number
}

export default function CalculadoraPage() {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt

  // parâmetros de leads
  const [taxa, setTaxa] = useState(10)        // % de fechamento
  const [custo, setCusto] = useState(28)      // $ por lead (âncora da casa)
  const [cb, setCb] = useState(5)             // % chargebacks
  // receita por cliente
  const [ap, setAp] = useState(2000)          // prêmio anual médio
  const [com, setCom] = useState(80)          // % comissão
  const [adv, setAdv] = useState(75)          // % adiantamento
  // projeção
  const [leadsMes, setLeadsMes] = useState(50)

  const [reais, setReais] = useState<Reais | null>(null)

  useEffect(() => {
    // mesmo idiom das outras telas: cookie supabase → auth id → buyer → analytics
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const ref = supabaseUrl.replace('https://', '').split('.')[0]
      const cookie = document.cookie.split('; ').find(c => c.startsWith(`sb-${ref}-auth-token=`))
      if (!cookie) return
      const token = JSON.parse(atob(decodeURIComponent(cookie.substring(cookie.indexOf('=') + 1))))
      const payload = JSON.parse(atob(token.access_token.split('.')[1]))
      fetch(`/api/settings?auth_user_id=${payload.sub}`)
        .then(r => (r.ok ? r.json() : null))
        .then(buyer => buyer?.id ? fetch(`/api/analytics?buyer_id=${buyer.id}&days=90`).then(r => (r.ok ? r.json() : null)) : null)
        .then(d => {
          if (!d?.kpis) return
          const k = d.kpis
          if (k.total_received > 0) {
            setReais({
              recebidos: k.total_received,
              fechados: k.total_converted,
              taxa: k.conversion_rate,
              apMedio: k.total_converted > 0 && k.total_revenue > 0 ? k.total_revenue / k.total_converted : 0,
            })
          }
        })
        .catch(() => {})
    } catch { /* sem cookie/parse → calculadora funciona igual, só sem os números reais */ }
  }, [])

  const calc = useMemo(() => {
    const comissaoTotal = ap * (com / 100)
    const adiantamento = comissaoTotal * (adv / 100)
    const diferido = comissaoTotal - adiantamento
    const leadsPara1 = Math.max(1, Math.ceil(100 / Math.max(1, taxa)))
    const gasto = leadsPara1 * custo
    const comCb = Math.ceil(leadsPara1 * (1 + cb / 100))
    const gastoReal = comCb * custo
    const ganhoAdel = adiantamento - gastoReal
    const ganhoTotal = comissaoTotal - gastoReal
    // projeção mensal — clientes com 1 casa decimal, líquido = SÓ adiantamento − investimento
    const clientes = leadsMes * (taxa / 100) * (1 - cb / 100)
    const investimento = leadsMes * custo
    const adiantamentos = clientes * adiantamento
    const diferidos = clientes * diferido
    const liquido = adiantamentos - investimento
    const roi = investimento > 0 ? (liquido / investimento) * 100 : 0
    return { comissaoTotal, adiantamento, diferido, leadsPara1, gasto, comCb, gastoReal, ganhoAdel, ganhoTotal, clientes, investimento, adiantamentos, diferidos, liquido, roi }
  }, [taxa, custo, cb, ap, com, adv, leadsMes])

  const usarReais = () => {
    if (!reais) return
    setTaxa(Math.min(50, Math.max(1, Math.round(reais.taxa))))
    if (reais.apMedio > 0) setAp(Math.min(10000, Math.max(500, Math.round(reais.apMedio / 100) * 100)))
  }

  const card = { background: '#fff', border: '1px solid #e8ecf4', borderRadius: 16 } as const
  const secTitle = { fontSize: 12, fontWeight: 800, color: '#64748b', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 } as const
  const sliderRow = (label: string, value: string, input: React.ReactNode, valueColor = '#1a1a2e', hint?: string) => (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>{label}{hint && <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}> · {hint}</span>}</span>
        <span style={{ fontSize: 20, fontWeight: 800, color: valueColor }}>{value}</span>
      </div>
      {input}
    </div>
  )
  const range = (value: number, set: (n: number) => void, min: number, max: number, step = 1) => (
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => set(Number(e.target.value))}
      style={{ width: '100%', accentColor: '#6366f1', marginTop: 6 }} />
  )
  const mini = (label: string, value: string, tone: 'plain' | 'green' = 'plain') => (
    <div style={{ flex: 1, minWidth: 90, textAlign: 'center', padding: '10px 8px', borderRadius: 12, background: tone === 'green' ? '#f0fdf4' : '#f8fafc', border: `1px solid ${tone === 'green' ? '#bbf7d0' : '#eef2f7'}` }}>
      <p style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>{label}</p>
      <p style={{ fontSize: 17, fontWeight: 800, color: tone === 'green' ? '#059669' : '#1a1a2e', marginTop: 2 }}>{value}</p>
    </div>
  )

  return (
    <div className="max-w-[1060px]">
      <div className="mb-5">
        <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>🧮 {L('Calculadora de Rentabilidade', 'Profitability Calculator', 'Calculadora de Rentabilidad')}</h1>
        <p className="text-[14px] mt-1" style={{ color: '#64748b' }}>
          {L('Ajuste os parâmetros e veja seu potencial de ganho — custo de leads vs receita',
             'Adjust the parameters and see your earning potential — lead cost vs revenue',
             'Ajusta los parámetros y visualiza tu potencial de ganancias — costo de leads vs ingresos')}
        </p>
      </div>

      {reais && (
        <div className="mb-4 flex items-center gap-3 flex-wrap rounded-2xl px-4 py-3" style={{ background: '#eef2ff', border: '1px solid #c7d2fe' }}>
          <span style={{ fontSize: 13, color: '#3730a3', fontWeight: 600 }}>
            📊 {L('Seus números reais (90 dias):', 'Your real numbers (90 days):', 'Tus números reales (90 días):')}{' '}
            {reais.recebidos} leads · {reais.fechados} {L('fechados', 'closed', 'cerrados')} · {L('taxa', 'rate', 'tasa')} {reais.taxa}%
            {reais.apMedio > 0 && <> · AP {money(reais.apMedio)}</>}
          </span>
          <button onClick={usarReais} className="px-3 py-1.5 rounded-lg text-[12px] font-bold text-white" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
            {L('Usar meus números', 'Use my numbers', 'Usar mis números')}
          </button>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div style={card} className="p-5">
          <p style={secTitle}>◎ {L('PARÂMETROS DE LEADS', 'LEAD PARAMETERS', 'PARÁMETROS DE LEADS')}</p>
          {sliderRow(L('Taxa de fechamento', 'Close rate', 'Tasa de cierre'), `${taxa}%`, range(taxa, setTaxa, 1, 50))}
          {sliderRow(L('Custo por lead', 'Cost per lead', 'Costo por lead'), money(custo), range(custo, setCusto, 3, 60), '#1a1a2e', L('pacotes: $23–$28', 'packages: $23–$28', 'paquetes: $23–$28'))}
          {sliderRow('Chargebacks', `${cb}%`, range(cb, setCb, 0, 30), '#dc2626')}
        </div>

        <div style={card} className="p-5">
          <p style={secTitle}>▤ {L('RECEITA POR CLIENTE', 'REVENUE PER CLIENT', 'INGRESOS POR CLIENTE')}</p>
          {sliderRow(L('AP médio (prêmio anual)', 'Average AP (annual premium)', 'AP promedio (prima anual)'), money(ap), range(ap, setAp, 500, 10000, 100))}
          {sliderRow(L('Comissão', 'Commission', 'Comisión'), `${com}%`, range(com, setCom, 10, 120, 5))}
          {sliderRow(L('Adiantamento', 'Advance', 'Adelanto'), `${adv}%`, range(adv, setAdv, 50, 100, 5))}
          <div className="flex gap-2 mt-4 flex-wrap">
            {mini(L('Comissão total', 'Total commission', 'Comisión total'), money(calc.comissaoTotal))}
            {mini(`${L('Adiantamento', 'Advance', 'Adelanto')} ${adv}%`, money(calc.adiantamento), 'green')}
            {mini(`${L('Diferido', 'Deferred', 'Diferido')} ${100 - adv}%`, money(calc.diferido))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
        <div style={card} className="p-4 text-center">
          <p style={secTitle}>◎ {L('LEADS PARA 1 FECHAMENTO', 'LEADS FOR 1 CLOSE', 'LEADS PARA 1 CIERRE')}</p>
          <p style={{ fontSize: 30, fontWeight: 800, color: '#1a1a2e', marginTop: 6 }}>{calc.leadsPara1}</p>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>{L('Gasto', 'Spend', 'Gasto')}: {money(calc.gasto)}</p>
        </div>
        <div className="p-4 text-center" style={{ ...card, background: '#fffbeb', borderColor: '#fde68a' }}>
          <p style={secTitle}>⚠ LEADS + CHARGEBACKS</p>
          <p style={{ fontSize: 30, fontWeight: 800, color: '#1a1a2e', marginTop: 6 }}>{calc.comCb}</p>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>{L('Real', 'Actual', 'Real')}: {money(calc.gastoReal)}</p>
        </div>
        <div className="p-4 text-center" style={{ ...card, background: '#f0fdfa', borderColor: '#99f6e4' }}>
          <p style={secTitle}>↗ {L('GANHO (ADIANTAMENTO)', 'PROFIT (ADVANCE)', 'GANANCIA (ADELANTO)')}</p>
          <p style={{ fontSize: 30, fontWeight: 800, color: calc.ganhoAdel >= 0 ? '#059669' : '#dc2626', marginTop: 6 }}>{money(calc.ganhoAdel)}</p>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>{L('depois do gasto', 'after spend', 'después del gasto')}</p>
        </div>
        <div className="p-4 text-center" style={{ ...card, background: '#1a1a2e', borderColor: '#1a1a2e' }}>
          <p style={{ ...secTitle, color: '#a5b4fc' }}>⚡ {L('GANHO TOTAL', 'TOTAL PROFIT', 'GANANCIA TOTAL')}</p>
          <p style={{ fontSize: 30, fontWeight: 800, color: '#fff', marginTop: 6 }}>{money(calc.ganhoTotal)}</p>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>{L('incluindo diferido', 'including deferred', 'incluyendo diferido')}</p>
        </div>
      </div>

      <div style={card} className="mt-4 overflow-hidden">
        <div className="flex items-center justify-between gap-4 flex-wrap px-5 py-3" style={{ background: '#f8fafc', borderBottom: '1px solid #eef2f7' }}>
          <p style={secTitle}>🗓 {L('PROJEÇÃO MENSAL', 'MONTHLY PROJECTION', 'PROYECCIÓN MENSUAL')}</p>
          <div className="flex items-center gap-3" style={{ minWidth: 240, flex: '0 1 340px' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>{L('Leads/mês:', 'Leads/mo:', 'Leads/mes:')}</span>
            {range(leadsMes, setLeadsMes, 10, 500, 10)}
            <span style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e' }}>{leadsMes}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-5">
          <div className="text-center">
            <p style={secTitle}>↘ {L('INVESTIMENTO', 'INVESTMENT', 'INVERSIÓN')}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#dc2626', marginTop: 4 }}>{money(calc.investimento)}</p>
          </div>
          <div className="text-center">
            <p style={secTitle}>👥 {L('CLIENTES', 'CLIENTS', 'CLIENTES')}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', marginTop: 4 }}>{calc.clientes.toFixed(1)}</p>
          </div>
          <div className="text-center">
            <p style={secTitle}>↗ {L('ADIANTAMENTOS', 'ADVANCES', 'ADELANTOS')}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#059669', marginTop: 4 }}>{money(calc.adiantamentos)}</p>
          </div>
          <div className="text-center">
            <p style={secTitle}>🕓 {L('DIFERIDOS', 'DEFERRED', 'DIFERIDOS')}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#059669', marginTop: 4 }}>{money(calc.diferidos)}</p>
          </div>
          <div className="rounded-xl p-3 text-center col-span-2 lg:col-span-1" style={{ background: '#1a1a2e' }}>
            <p style={{ ...secTitle, color: '#a5b4fc', justifyContent: 'center' }}>{L('GANHO LÍQUIDO', 'NET PROFIT', 'GANANCIA NETA')}</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginTop: 2 }}>{money(calc.liquido)}</p>
            <p style={{ fontSize: 11, color: '#94a3b8' }}>ROI: {Math.round(calc.roi)}%</p>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl overflow-hidden" style={{ border: '1px solid #bbf7d0' }}>
        <div className="px-5 py-3" style={{ background: '#f0fdf4', borderBottom: '1px solid #dcfce7' }}>
          <p style={{ ...secTitle, color: '#15803d' }}>🗓 {L('PROJEÇÃO ANUAL', 'YEARLY PROJECTION', 'PROYECCIÓN ANUAL')}</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-5" style={{ background: '#fff' }}>
          <div className="text-center">
            <p style={secTitle}>↘ {L('INVESTIMENTO', 'INVESTMENT', 'INVERSIÓN')}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#dc2626', marginTop: 4 }}>{money(calc.investimento * 12)}</p>
          </div>
          <div className="text-center">
            <p style={secTitle}>👥 {L('CLIENTES', 'CLIENTS', 'CLIENTES')}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', marginTop: 4 }}>{Math.round(calc.clientes * 12)}</p>
          </div>
          <div className="text-center">
            <p style={secTitle}>↗ {L('ADIANTAMENTOS', 'ADVANCES', 'ADELANTOS')}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#059669', marginTop: 4 }}>{money(calc.adiantamentos * 12)}</p>
          </div>
          <div className="text-center">
            <p style={secTitle}>🕓 {L('DIFERIDOS', 'DEFERRED', 'DIFERIDOS')}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#059669', marginTop: 4 }}>{money(calc.diferidos * 12)}</p>
          </div>
          <div className="rounded-xl p-3 text-center col-span-2 lg:col-span-1" style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
            <p style={{ ...secTitle, color: '#d1fae5', justifyContent: 'center' }}>{L('GANHO ANUAL', 'YEARLY PROFIT', 'GANANCIA ANUAL')}</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginTop: 2 }}>{money((calc.liquido + calc.diferidos) * 12)}</p>
            <p style={{ fontSize: 11, color: '#d1fae5' }}>{L('com diferidos', 'incl. deferred', 'con diferidos')}</p>
          </div>
        </div>
      </div>

      <p className="mt-4 text-[12px]" style={{ color: '#94a3b8' }}>
        {L('Simulação com base nos parâmetros escolhidos — não é promessa de resultado.',
           'Simulation based on the chosen parameters — not a promise of results.',
           'Simulación basada en los parámetros elegidos — no es una promesa de resultados.')}
      </p>
    </div>
  )
}
