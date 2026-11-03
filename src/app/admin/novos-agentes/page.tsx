'use client'

import { useMemo, useState } from 'react'

/** /admin/novos-agentes — lista de agentes com licença Life & Annuity nova (Florida DFS), por período. */

type Agent = { name: string; license: string; address: string; city: string; state: string; zip: string; county: string; email: string; phone: string; npn: string; language: 'en' | 'pt' | 'es'; status: string | null }
type Result = { from: string; to: string; total: number; saved: number; agents: Agent[]; fetchedAt: string }
const LANG: Record<string, string> = { en: 'Inglês', pt: 'Português', es: 'Espanhol' }
const STATUS: Record<string, string> = { new: 'Novo', contacted: 'Contatado', replied: 'Respondeu', interested: 'Interessado', joined: 'Entrou', declined: 'Recusou' }

const PAGE = 100
const iso = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400000))

export default function NovosAgentesPage() {
  const [from, setFrom] = useState(daysAgo(7))
  const [to, setTo] = useState(daysAgo(0))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [res, setRes] = useState<Result | null>(null)
  const [state, setState] = useState('')
  const [q, setQ] = useState('')
  const [lang, setLang] = useState('')
  const [st, setSt] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [page, setPage] = useState(0)

  async function search() {
    setLoading(true); setError(''); setMsg(''); setRes(null); setPage(0)
    try {
      const r = await fetch(`/api/admin/novos-agentes?from=${from}&to=${to}`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
      setRes(j)
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha na consulta.') }
    setLoading(false)
  }

  async function saveAll() {
    setSaving(true); setError(''); setMsg('')
    try {
      const r = await fetch('/api/admin/recruit/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
      setMsg(`${j.inserted} novos salvos na lista de recrutamento · ${j.alreadyKnown} já estavam. Nada foi enviado a ninguém.`)
      await search()
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao salvar.') }
    setSaving(false)
  }

  const states = useMemo(() => {
    const c = new Map<string, number>()
    for (const a of res?.agents || []) c.set(a.state || '—', (c.get(a.state || '—') || 0) + 1)
    return [...c].sort((a, b) => b[1] - a[1])
  }, [res])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (res?.agents || []).filter(a =>
      (!state || (a.state || '—') === state) &&
      (!lang || a.language === lang) &&
      (!st || (st === 'none' ? !a.status : a.status === st)) &&
      (!t || `${a.name} ${a.email} ${a.phone} ${a.city} ${a.npn}`.toLowerCase().includes(t)))
  }, [res, state, q])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE))
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE)
  const csvHref = `/api/admin/novos-agentes?from=${from}&to=${to}&format=csv`

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-[22px] font-extrabold text-gray-900">🆕 Novos agentes licenciados</h1>
      <p className="text-[13px] text-gray-500 mt-1 mb-5">
        Licenças de Life &amp; Annuity emitidas no período, direto do Florida DFS. Inclui agentes de outros estados que passaram a vender na Flórida.
      </p>

      <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-wrap items-end gap-3">
        <label className="text-[12px] font-semibold text-gray-600">Data início
          <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="mt-1 block border rounded-xl px-3 py-2 text-[14px] font-normal" />
        </label>
        <label className="text-[12px] font-semibold text-gray-600">Data fim
          <input type="date" value={to} min={from} max={daysAgo(0)} onChange={e => setTo(e.target.value)} className="mt-1 block border rounded-xl px-3 py-2 text-[14px] font-normal" />
        </label>
        <button onClick={search} disabled={loading || !from || !to}
          className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-[14px] font-bold disabled:opacity-50">
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
        {res && <button onClick={saveAll} disabled={saving} className="px-4 py-2.5 rounded-xl bg-gray-900 text-white text-[14px] font-semibold disabled:opacity-50">{saving ? 'Salvando…' : '🤝 Salvar na lista de recrutamento'}</button>}
        {res && <a href={csvHref} className="px-4 py-2.5 rounded-xl border border-gray-300 text-[14px] font-semibold text-gray-700">⬇️ Baixar CSV</a>}
        <span className="text-[11px] text-gray-400 w-full">Máximo de 62 dias por busca. Pode levar até 15 segundos.</span>
      </div>

      {msg && <div className="mt-4 rounded-xl bg-green-50 border border-green-200 text-green-800 text-[13px] px-4 py-3">{msg}</div>}
      {error && <div className="mt-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px] px-4 py-3">{error}</div>}

      {res && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="text-[14px] font-bold text-gray-900">{filtered.length.toLocaleString('en-US')} de {res.total.toLocaleString('en-US')} agentes</div>
            <select value={state} onChange={e => { setState(e.target.value); setPage(0) }} className="border rounded-xl px-3 py-2 text-[13px]">
              <option value="">Todos os estados</option>
              {states.map(([s, n]) => <option key={s} value={s}>{s} ({n})</option>)}
            </select>
            <select value={lang} onChange={e => { setLang(e.target.value); setPage(0) }} className="border rounded-xl px-3 py-2 text-[13px]">
              <option value="">Todos os idiomas</option>
              {Object.entries(LANG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={st} onChange={e => { setSt(e.target.value); setPage(0) }} className="border rounded-xl px-3 py-2 text-[13px]">
              <option value="">Todos os status</option>
              <option value="none">Não salvo ainda</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input value={q} onChange={e => { setQ(e.target.value); setPage(0) }} placeholder="Buscar nome, e-mail, cidade…" className="border rounded-xl px-3 py-2 text-[13px] flex-1 min-w-[200px]" />
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-left text-gray-500 text-[11px] uppercase">
                <tr><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Cidade / UF</th><th className="px-3 py-2">E-mail</th><th className="px-3 py-2">Telefone</th><th className="px-3 py-2">Licença</th><th className="px-3 py-2">NPN</th><th className="px-3 py-2">Idioma</th><th className="px-3 py-2">Status</th></tr>
              </thead>
              <tbody>
                {shown.map(a => (
                  <tr key={a.license + a.npn} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-semibold text-gray-900">{a.name}</td>
                    <td className="px-3 py-2">{a.city}{a.state ? `, ${a.state}` : ''}</td>
                    <td className="px-3 py-2">{a.email}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{a.phone}</td>
                    <td className="px-3 py-2">{a.license}</td>
                    <td className="px-3 py-2">{a.npn}</td>
                    <td className="px-3 py-2">{LANG[a.language]}</td>
                    <td className="px-3 py-2">{a.status ? STATUS[a.status] : <span className="text-gray-400">Não salvo</span>}</td>
                  </tr>
                ))}
                {!shown.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">Nenhum agente nesse filtro.</td></tr>}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-3 text-[13px]">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-lg border disabled:opacity-40">←</button>
              <span>{page + 1} / {pages}</span>
              <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg border disabled:opacity-40">→</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
