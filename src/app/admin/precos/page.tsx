'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

/**
 * /admin/precos — gestão do preço de venda de leads (fonte única: settings.lead_pricing).
 * O que se salva aqui vale na hora em: tela de compra (web e app), /api/checkout (cobrança),
 * preview de cupom, landing (/api/pricing), calculadora, checklist e receita estimada do Meta Ads.
 */

type Pkg = { quantity: number; unitPriceCents: number }
type Input = { lead: { packages: Pkg[] }; cold_lead: { packages: Pkg[] } }
type Kind = 'lead' | 'cold_lead'
type HistoryEntry = { summary: string; replaced_at: string; replaced_by_email: string | null; updated_at: string | null; source: 'db' | 'default' }
type Loaded = {
  catalog: Input & { source: 'db' | 'default'; updatedAt: string | null; updatedBy: string | null }
  factoryDefault: Input
  history: HistoryEntry[]
  limits: { minUnitCents: number; maxUnitCents: number; maxQuantity: number; maxPackages: number }
  /** linha salva no banco não passou na validação (ex.: editada à mão em SQL) — a tela mostra o padrão de fábrica */
  storedError?: string | null
}
const baseIndex = (list: Pkg[]) => (list.length ? list.reduce((b, p, i) => (p.quantity < list[b].quantity ? i : b), 0) : -1)

const money = (cents: number) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(cents / 100) ? 0 : 2, maximumFractionDigits: 2 })
const strip = (i: Input): Input => ({
  lead: { packages: i.lead.packages.map(p => ({ quantity: p.quantity, unitPriceCents: p.unitPriceCents })) },
  cold_lead: { packages: i.cold_lead.packages.map(p => ({ quantity: p.quantity, unitPriceCents: p.unitPriceCents })) },
})
const KIND: Record<Kind, { title: string; unit: string; hint: string; color: string }> = {
  lead: { title: '📋 Leads exclusivos', unit: 'Leads', hint: 'Lead quente, exclusivo, entregue na hora.', color: '#6366f1' },
  cold_lead: { title: '❄️ Leads frios', unit: 'Leads frios', hint: 'Entrega manual pela equipe. Deixe sem pacotes para parar de vender.', color: '#64748b' },
}

/** Campo em dólares que aceita digitar decimais e devolve centavos inteiros. */
function MoneyInput({ cents, onChange, onFocus, min, max, big }: { cents: number; onChange: (c: number) => void; onFocus?: () => void; min: number; max: number; big?: boolean }) {
  const [text, setText] = useState(String(cents / 100))
  const [focus, setFocus] = useState(false)
  useEffect(() => { if (!focus) setText(String(cents / 100)) }, [cents, focus])
  const bad = cents < min || cents > max
  return (
    <div className="relative">
      <span className={`absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-400 ${big ? 'text-[20px]' : 'text-[13px]'}`}>$</span>
      <input type="number" inputMode="decimal" step="0.01" min={min / 100} max={max / 100} value={text}
        onFocus={() => { setFocus(true); onFocus?.() }}
        onBlur={() => { setFocus(false); setText(String(cents / 100)) }}
        onChange={e => { setText(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n)) onChange(Math.round(n * 100)) }}
        className={`w-full border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${big ? 'pl-8 pr-3 py-3 text-[26px] font-extrabold' : 'pl-7 pr-2 py-2 text-[14px] font-semibold'} ${bad ? 'border-red-400 bg-red-50' : 'border-gray-200'}`} />
    </div>
  )
}

/** Quantidade inteira; deixa o campo vazio enquanto digita (sem virar "0" na cara do usuário). */
function QuantityInput({ value, onChange, max }: { value: number; onChange: (n: number) => void; max: number }) {
  const [text, setText] = useState(String(value))
  const [focus, setFocus] = useState(false)
  useEffect(() => { if (!focus) setText(String(value)) }, [value, focus])
  const bad = !Number.isInteger(value) || value < 1 || value > max
  return (
    <input type="number" inputMode="numeric" min={1} max={max} step={1} value={text}
      onFocus={() => setFocus(true)}
      onBlur={() => { setFocus(false); setText(String(value)) }}
      onChange={e => { setText(e.target.value); const n = parseInt(e.target.value, 10); onChange(Number.isInteger(n) ? n : 0) }}
      className={`w-full px-3 py-2 border rounded-xl text-[14px] font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 ${bad ? 'border-red-400 bg-red-50' : 'border-gray-200'}`} />
  )
}

export default function AdminPrecosPage() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [input, setInput] = useState<Input | null>(null)
  const [saved, setSaved] = useState<Input | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  // "Preço do lead": ao focar, guarda a diferença de cada pacote pra base — mudar a base
  // reaplica as mesmas diferenças (e não acumula arredondamento/clamp a cada tecla)
  const baseAnchor = useRef<Partial<Record<Kind, { offsets: number[] }>>>({})

  useEffect(() => {
    fetch('/api/admin/pricing', { cache: 'no-store' }).then(async r => {
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Falha ao carregar.')
      setLoaded(d); setInput(strip(d.catalog))
      // linha salva inválida: nada está "salvo" — força o botão de salvar e explica
      setSaved(d.storedError ? null : strip(d.catalog))
      if (d.storedError) setMsg({ kind: 'err', text: `A tabela salva no banco é inválida (${d.storedError}). Compras estão BLOQUEADAS até você salvar uma tabela válida aqui — abaixo está o padrão de fábrica pra ajustar e salvar.` })
    }).catch(e => setMsg({ kind: 'err', text: e.message }))
  }, [])

  const dirty = useMemo(() => !!input && (saved === null || JSON.stringify(input) !== JSON.stringify(saved)), [input, saved])
  const limits = loaded?.limits || { minUnitCents: 100, maxUnitCents: 100000, maxQuantity: 10000, maxPackages: 6 }

  function update(kind: Kind, packages: Pkg[]) { setInput(prev => prev ? { ...prev, [kind]: { packages } } : prev) }
  function setPkg(kind: Kind, i: number, patch: Partial<Pkg>) {
    if (!input) return
    update(kind, input[kind].packages.map((p, k) => (k === i ? { ...p, ...patch } : p)))
  }
  function anchorBase(kind: Kind) {
    if (!input) return
    const list = input[kind].packages
    const bi = baseIndex(list)
    if (bi < 0) return
    baseAnchor.current[kind] = { offsets: list.map(p => p.unitPriceCents - list[bi].unitPriceCents) }
  }
  /** Preço base = do menor pacote. Mudou a base → todos os pacotes andam junto (mantêm o desconto). */
  function setBase(kind: Kind, cents: number) {
    if (!input) return
    const list = input[kind].packages
    const bi = baseIndex(list)
    if (bi < 0) return
    let anchor = baseAnchor.current[kind]
    if (!anchor || anchor.offsets.length !== list.length) {
      anchor = { offsets: list.map(p => p.unitPriceCents - list[bi].unitPriceCents) }
      baseAnchor.current[kind] = anchor
    }
    update(kind, list.map((p, i) => ({ ...p, unitPriceCents: i === bi ? cents : Math.max(limits.minUnitCents, cents + anchor!.offsets[i]) })))
  }
  function addPkg(kind: Kind) {
    if (!input) return
    const list = input[kind].packages
    const last = list[list.length - 1]
    update(kind, [...list, { quantity: last ? last.quantity * 2 : 10, unitPriceCents: last ? last.unitPriceCents : 2800 }])
  }
  function removePkg(kind: Kind, i: number) { if (input) update(kind, input[kind].packages.filter((_, k) => k !== i)) }

  const problems = useMemo(() => {
    if (!input) return []
    const out: string[] = []
    for (const kind of ['lead', 'cold_lead'] as Kind[]) {
      const list = input[kind].packages
      const seen = new Set<number>()
      if (kind === 'lead' && !list.length) out.push('Leads exclusivos precisam de pelo menos 1 pacote.')
      if (list.length > limits.maxPackages) out.push(`${KIND[kind].unit}: no máximo ${limits.maxPackages} pacotes.`)
      list.forEach((p, i) => {
        if (!Number.isInteger(p.quantity) || p.quantity < 1 || p.quantity > limits.maxQuantity) out.push(`${KIND[kind].unit}, pacote ${i + 1}: quantidade inválida.`)
        if (!Number.isInteger(p.unitPriceCents) || p.unitPriceCents < limits.minUnitCents || p.unitPriceCents > limits.maxUnitCents) out.push(`${KIND[kind].unit}, pacote ${i + 1}: preço por lead entre $1 e $1.000.`)
        if (seen.has(p.quantity)) out.push(`${KIND[kind].unit}: quantidade ${p.quantity} repetida.`)
        seen.add(p.quantity)
      })
    }
    return out
  }, [input, limits])

  async function save() {
    if (!input || problems.length) return
    setSaving(true); setMsg(null)
    try {
      const r = await fetch('/api/admin/pricing', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Falha ao salvar.')
      setInput(strip(d.catalog)); setSaved(strip(d.catalog)); baseAnchor.current = {}
      setLoaded(prev => prev ? { ...prev, catalog: d.catalog, history: d.history, storedError: null } : prev)
      setMsg({ kind: 'ok', text: 'Preços salvos — já valem na tela de compra (web e app), no checkout, na landing e na calculadora.' })
    } catch (e) { setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Falha ao salvar.' }) }
    setSaving(false)
  }

  if (!input) {
    return <div className="max-w-4xl"><h1 className="text-2xl font-extrabold text-gray-900 mb-2">Preços de leads</h1>
      {msg ? <p className="text-sm text-red-600">{msg.text}</p> : <p className="text-sm text-gray-500">Carregando…</p>}</div>
  }

  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/New_York', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-4 mb-1 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Preços de leads</h1>
          <p className="text-sm text-gray-500">Defina o valor do lead e os pacotes. Vale na hora para todo mundo que compra.</p>
        </div>
        <div className="text-right text-[12px] text-gray-500">
          {loaded?.storedError
            ? <span className="text-red-600 font-bold">Tabela salva inválida — mostrando o padrão de fábrica</span>
            : loaded?.catalog.source === 'db'
              ? <>Em vigor desde <b>{fmtDate(loaded.catalog.updatedAt)}</b> (horário de Miami)</>
              : <>Usando o <b>padrão de fábrica</b> — nunca salvo pelo admin</>}
        </div>
      </div>

      {msg && (
        <div className={`px-5 py-3 rounded-xl my-4 text-sm font-medium border ${msg.kind === 'ok' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
          {msg.kind === 'ok' ? '✅ ' : '⚠️ '}{msg.text}
        </div>
      )}

      {(['lead', 'cold_lead'] as Kind[]).map(kind => {
        const list = input[kind].packages
        const baseIdx = baseIndex(list)
        const base = baseIdx >= 0 ? list[baseIdx].unitPriceCents : 0
        return (
          <div key={kind} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-bold text-gray-900">{KIND[kind].title}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{KIND[kind].hint}</p>
              </div>
              {list.length > 0 && (
                <div className="w-44">
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">Preço do lead</label>
                  <MoneyInput big cents={base} min={limits.minUnitCents} max={limits.maxUnitCents} onFocus={() => anchorBase(kind)} onChange={c => setBase(kind, c)} />
                  <p className="text-[11px] text-gray-400 mt-1">Mudou aqui → os pacotes acompanham.</p>
                </div>
              )}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-gray-400 text-left">
                    <th className="py-2 pr-3 font-bold">Quantidade</th>
                    <th className="py-2 pr-3 font-bold">Preço por lead</th>
                    <th className="py-2 pr-3 font-bold">Total do pacote</th>
                    <th className="py-2 pr-3 font-bold">vs. preço do lead</th>
                    <th className="py-2 font-bold" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((p, i) => {
                    const diff = p.unitPriceCents - base
                    const pct = base ? Math.round((diff / base) * 100) : 0
                    return (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-2 pr-3 w-32">
                          <QuantityInput value={p.quantity} max={limits.maxQuantity} onChange={q => setPkg(kind, i, { quantity: q })} />
                        </td>
                        <td className="py-2 pr-3 w-36"><MoneyInput cents={p.unitPriceCents} min={limits.minUnitCents} max={limits.maxUnitCents} onChange={c => setPkg(kind, i, { unitPriceCents: c })} /></td>
                        <td className="py-2 pr-3 font-extrabold text-gray-900 text-[16px]">{money(p.quantity * p.unitPriceCents)}</td>
                        <td className="py-2 pr-3 text-[12px] font-semibold" style={{ color: diff < 0 ? '#059669' : diff > 0 ? '#dc2626' : '#94a3b8' }}>
                          {i === baseIdx ? 'base' : diff === 0 ? 'igual' : `${diff < 0 ? '−' : '+'}${money(Math.abs(diff))}/lead (${pct > 0 ? '+' : ''}${pct}%)`}
                        </td>
                        <td className="py-2 text-right">
                          <button type="button" onClick={() => removePkg(kind, i)} className="text-[12px] font-bold text-gray-400 hover:text-red-600 px-2 py-1" title="Remover pacote">✕</button>
                        </td>
                      </tr>
                    )
                  })}
                  {!list.length && <tr><td colSpan={5} className="py-4 text-[13px] text-gray-400">Nenhum pacote — este produto não aparece na tela de compra.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 mt-3 flex-wrap">
              <button type="button" onClick={() => addPkg(kind)} disabled={list.length >= limits.maxPackages}
                className="px-4 py-2 rounded-xl text-[13px] font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40">+ Adicionar pacote</button>
              {loaded && (
                <button type="button" onClick={() => update(kind, loaded.factoryDefault[kind].packages.map(p => ({ ...p })))}
                  className="px-4 py-2 rounded-xl text-[13px] font-bold text-gray-500 hover:bg-gray-100">Restaurar padrão de fábrica</button>
              )}
            </div>

            {list.length > 0 && (
              <div className="mt-5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Como o cliente vai ver</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[...list].sort((a, b) => a.quantity - b.quantity).map((p, i) => (
                    <div key={i} className="rounded-2xl p-4" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
                      <p className="text-[12px] font-medium text-gray-500">{p.quantity} {KIND[kind].unit}</p>
                      <p className="text-[26px] font-extrabold text-gray-900 mt-0.5">{money(p.quantity * p.unitPriceCents)}</p>
                      <p className="text-[11px] text-gray-400">{money(p.unitPriceCents)}/lead</p>
                      <div className="mt-3 h-8 rounded-lg text-white text-[12px] font-bold flex items-center justify-center opacity-70" style={{ background: KIND[kind].color }}>Comprar</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {problems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-5 py-3 mb-4 text-[13px]">
          {problems.map((p, i) => <p key={i}>• {p}</p>)}
        </div>
      )}

      <div className="sticky bottom-4 bg-white/95 backdrop-blur rounded-2xl shadow-lg border border-gray-100 p-4 flex items-center justify-between gap-4 flex-wrap mb-6">
        <p className="text-[12px] text-gray-500">
          {dirty ? 'Alterações não salvas.' : 'Tudo salvo.'} Quem é da <Link href="/admin/buyers" className="font-bold text-indigo-600">equipe de vendas</Link> paga o preço próprio dele, não o daqui.
        </p>
        <button type="button" onClick={save} disabled={saving || !dirty || problems.length > 0}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Salvando…' : 'Salvar e colocar em vigor'}
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="font-bold text-gray-900 mb-3">🕓 Histórico de alterações</h2>
        {!loaded?.history.length ? <p className="text-[13px] text-gray-400">Nenhuma alteração ainda.</p> : (
          <div className="space-y-2">
            {loaded.history.map((h, i) => (
              <div key={i} className="text-[13px] border-t border-gray-100 pt-2 first:border-0 first:pt-0">
                <p className="text-gray-900 font-semibold">{h.summary}</p>
                <p className="text-[12px] text-gray-400">
                  {h.source === 'default' ? 'padrão de fábrica' : `valeu de ${fmtDate(h.updated_at)}`} até {fmtDate(h.replaced_at)}{h.replaced_by_email ? ` · trocado por ${h.replaced_by_email}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-[13px] text-gray-600 space-y-2">
        <h2 className="font-bold text-gray-900">O que muda quando você salva</h2>
        <p>• <b>Na hora:</b> tela de compra (web e app), cobrança no checkout, preview de cupom, checklist de boas-vindas e receita estimada em Meta Ads.</p>
        <p>• <b>Em até 1 minuto:</b> landing (lead4producers.com — "a partir de $X" e a calculadora da página), calculadora do painel e tela de boas-vindas.</p>
        <p>• <b>Não muda:</b> quem já comprou (histórico mantém o preço pago), preço da equipe de vendas (por comprador, em Compradores) e os planos do CRM.</p>
        <p>• <b>Indicação:</b> a recompensa fixa por pacote ($15/$30/$55) só casa com os totais originais; pacote com valor novo paga 5% do pedido.</p>
      </div>
    </div>
  )
}
