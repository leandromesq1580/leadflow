'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'

/** /admin/recrutamento — agentes recém-licenciados (Florida DFS): acompanhamento + campanha de e-mail em 3 idiomas. */

type Agent = { id: string; email: string; name: string; phone: string; city: string; state: string; license: string; npn: string; language: 'en' | 'pt' | 'es'; status: string; notes: string; suppressed_at: string | null; suppression_reason: string | null }
type Stats = Record<string, number>
type Camp = { id: string; name: string; state: string; scheduled_at: string | null; daily_limit: number; filters: Filters; created_at: string; stats: Stats }
type Filters = { languages?: string[]; states?: string[]; statuses?: string[] }
type Draft = { name: string; subject_en: string; body_en: string; subject_pt: string; body_pt: string; subject_es: string; body_es: string; filters: Filters; daily_limit: number }
type Audience = { selected: number; eligible: number; en: number; pt: number; es: number; suppressed: number; already_client: number }

const STATUS: Record<string, string> = { new: 'Novo', contacted: 'Contatado', replied: 'Respondeu', interested: 'Interessado', joined: 'Entrou', declined: 'Recusou' }
const LANG: Record<string, string> = { en: 'Inglês', pt: 'Português', es: 'Espanhol' }
const CSTATE: Record<string, string> = { draft: 'Rascunho', scheduled: 'Agendada', running: 'Enviando', paused: 'Pausada', cancelled: 'Cancelada', completed: 'Concluída' }
const iso = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400000))

async function api(url: string, method = 'GET', body?: unknown) {
  const r = await fetch(url, { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
  return j
}

export default function RecrutamentoPage() {
  const [tab, setTab] = useState<'agents' | 'campaigns'>('agents')
  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-[22px] font-extrabold text-gray-900">🤝 Recrutamento de agentes</h1>
      <p className="text-[13px] text-gray-500 mt-1 mb-4">Agentes recém-licenciados (Life &amp; Annuity), direto do Florida DFS. Importe, acompanhe cada um e envie campanha de e-mail em inglês, português e espanhol.</p>
      <div className="flex gap-2 mb-5">
        {(['agents', 'campaigns'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-xl text-[14px] font-bold ${tab === t ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-700'}`}>
            {t === 'agents' ? 'Agentes' : 'Campanhas de e-mail'}
          </button>
        ))}
        <a href="/admin/novos-agentes" className="ml-auto self-center text-[12px] text-blue-600 underline">Ver lista bruta do DFS</a>
      </div>
      {tab === 'agents' ? <AgentsTab /> : <CampaignsTab />}
    </div>
  )
}

function AgentsTab() {
  const [from, setFrom] = useState(daysAgo(7)); const [to, setTo] = useState(daysAgo(0))
  const [syncing, setSyncing] = useState(false); const [msg, setMsg] = useState(''); const [err, setErr] = useState('')
  const [status, setStatus] = useState(''); const [lang, setLang] = useState(''); const [st, setSt] = useState(''); const [q, setQ] = useState(''); const [page, setPage] = useState(0)
  const [data, setData] = useState<{ agents: Agent[]; total: number; pageSize: number; counts: Stats; states: Stats } | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ page: String(page) }); if (status) p.set('status', status); if (lang) p.set('language', lang); if (st) p.set('state', st); if (q.trim()) p.set('q', q.trim())
      setData(await api('/api/admin/recruit/agents?' + p)); setErr('')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Falha.') }
  }, [page, status, lang, st, q])
  useEffect(() => { const t = setTimeout(load, q ? 350 : 0); return () => clearTimeout(t) }, [load, q])

  async function sync() {
    setSyncing(true); setMsg(''); setErr('')
    try {
      const r = await api('/api/admin/recruit/sync', 'POST', { from, to })
      setMsg(`${r.found} agentes no DFS · ${r.inserted} novos salvos · ${r.alreadyKnown} já estavam na lista.`); setPage(0); load()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Falha.') }
    setSyncing(false)
  }
  async function patch(a: Agent, p: Partial<Pick<Agent, 'status' | 'notes' | 'language'>>) {
    try { const r = await api('/api/admin/recruit/agents', 'PATCH', { id: a.id, ...p }); setData(d => d && { ...d, agents: d.agents.map(x => x.id === a.id ? r.agent : x) }); if (p.status) load() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Falha.') }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-wrap items-end gap-3">
        <label className="text-[12px] font-semibold text-gray-600">Licenças emitidas de
          <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="mt-1 block border rounded-xl px-3 py-2 text-[14px] font-normal" /></label>
        <label className="text-[12px] font-semibold text-gray-600">até
          <input type="date" value={to} min={from} max={daysAgo(0)} onChange={e => setTo(e.target.value)} className="mt-1 block border rounded-xl px-3 py-2 text-[14px] font-normal" /></label>
        <button onClick={sync} disabled={syncing} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-[14px] font-bold disabled:opacity-50">{syncing ? 'Importando…' : 'Importar do DFS'}</button>
        <span className="text-[11px] text-gray-400 w-full">Importar só guarda a lista — não envia nada a ninguém. Até 62 dias por vez.</span>
      </div>
      {msg && <div className="mt-3 rounded-xl bg-green-50 border border-green-200 text-green-800 text-[13px] px-4 py-2">{msg}</div>}
      {err && <div className="mt-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px] px-4 py-2">{err}</div>}

      {data && (
        <>
          <div className="flex flex-wrap gap-2 mt-4">
            {Object.entries(STATUS).map(([k, label]) => (
              <button key={k} onClick={() => { setStatus(status === k ? '' : k); setPage(0) }} className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border ${status === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}>
                {label} <span className="opacity-70">{data.counts[k] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 my-3">
            <select value={lang} onChange={e => { setLang(e.target.value); setPage(0) }} className="border rounded-xl px-3 py-2 text-[13px]"><option value="">Todos os idiomas</option>{Object.entries(LANG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select value={st} onChange={e => { setSt(e.target.value); setPage(0) }} className="border rounded-xl px-3 py-2 text-[13px]"><option value="">Todos os estados</option>{Object.entries(data.states).sort((a, b) => b[1] - a[1]).map(([k, n]) => <option key={k} value={k}>{k} ({n})</option>)}</select>
            <input value={q} onChange={e => { setQ(e.target.value); setPage(0) }} placeholder="Buscar nome, e-mail, cidade, NPN…" className="border rounded-xl px-3 py-2 text-[13px] flex-1 min-w-[200px]" />
            <span className="text-[13px] font-bold text-gray-900">{data.total.toLocaleString('en-US')} agentes</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-left text-gray-500 text-[11px] uppercase"><tr><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Cidade / UF</th><th className="px-3 py-2">Contato</th><th className="px-3 py-2">Idioma</th><th className="px-3 py-2">Status</th></tr></thead>
              <tbody>
                {data.agents.map(a => (
                  <Fragment key={a.id}>
                    <tr className="border-t border-gray-100 cursor-pointer hover:bg-gray-50" onClick={() => setOpen(open === a.id ? null : a.id)}>
                      <td className="px-3 py-2 font-semibold text-gray-900">{a.name}{a.suppressed_at && <span className="ml-2 text-[10px] bg-red-100 text-red-700 rounded px-1.5 py-0.5">não receber e-mail</span>}</td>
                      <td className="px-3 py-2">{a.city}{a.state ? `, ${a.state}` : ''}</td>
                      <td className="px-3 py-2"><div>{a.email}</div><div className="text-gray-500">{a.phone}</div></td>
                      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                        <select value={a.language} onChange={e => patch(a, { language: e.target.value as Agent['language'] })} className="border rounded-lg px-2 py-1 text-[12px]">{Object.entries(LANG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                        <select value={a.status} onChange={e => patch(a, { status: e.target.value })} className="border rounded-lg px-2 py-1 text-[12px]">{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                    </tr>
                    {open === a.id && (
                      <tr className="bg-gray-50"><td colSpan={5} className="px-3 py-3">
                        <div className="text-[12px] text-gray-500 mb-1">Licença {a.license} · NPN {a.npn}{a.suppression_reason ? ` · motivo: ${a.suppression_reason}` : ''}</div>
                        <NoteBox key={a.id} value={a.notes} onSave={v => patch(a, { notes: v })} />
                      </td></tr>
                    )}
                  </Fragment>
                ))}
                {!data.agents.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">Nenhum agente aqui. Use “Importar do DFS”.</td></tr>}
              </tbody>
            </table>
          </div>
          {pages > 1 && <div className="flex items-center justify-center gap-3 mt-3 text-[13px]">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-lg border disabled:opacity-40">←</button><span>{page + 1} / {pages}</span>
            <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg border disabled:opacity-40">→</button></div>}
        </>
      )}
    </div>
  )
}

function NoteBox({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  return <div className="flex gap-2"><textarea value={v} onChange={e => setV(e.target.value)} maxLength={2000} rows={2} placeholder="Notas (quem ligou, o que combinou…)" className="flex-1 border rounded-xl px-3 py-2 text-[13px]" />
    <button disabled={v === value} onClick={() => onSave(v)} className="px-4 rounded-xl bg-gray-900 text-white text-[13px] font-semibold disabled:opacity-40">Salvar</button></div>
}

function CampaignsTab() {
  const [list, setList] = useState<Camp[]>([]); const [tpl, setTpl] = useState<Draft | null>(null)
  const [cfg, setCfg] = useState<{ ready: boolean; issues: string[] } | null>(null)
  const [edit, setEdit] = useState<{ id: string | null; d: Draft } | null>(null)
  const [err, setErr] = useState(''); const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    try { const r = await api('/api/admin/recruit/campaigns'); setList(r.campaigns); setTpl({ name: '', ...r.template, filters: { statuses: ['new'] }, daily_limit: 200 }); setCfg(r.config); setErr('') }
    catch (e) { setErr(e instanceof Error ? e.message : 'Falha.') }
  }, [])
  useEffect(() => { load() }, [load])

  async function control(id: string, control: string) {
    if (control === 'cancel' && !confirm('Cancelar a campanha? O que ainda não foi enviado não será mais enviado.')) return
    try { await api('/api/admin/recruit/campaigns', 'POST', { action: 'control', id, control }); load() } catch (e) { setErr(e instanceof Error ? e.message : 'Falha.') }
  }
  async function open(id: string) {
    try { const r = await api('/api/admin/recruit/campaigns?id=' + id); const c = r.campaign; setEdit({ id, d: { name: c.name, subject_en: c.subject_en, body_en: c.body_en, subject_pt: c.subject_pt, body_pt: c.body_pt, subject_es: c.subject_es, body_es: c.body_es, filters: c.filters || {}, daily_limit: c.daily_limit } }) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Falha.') }
  }

  if (edit) return <Editor initial={edit} cfg={cfg} onDone={(m) => { setEdit(null); if (m) setMsg(m); load() }} />
  return (
    <div>
      {cfg && !cfg.ready && <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[13px] px-4 py-2">Envio ainda não está liberado: {cfg.issues.join(' ')}</div>}
      {msg && <div className="mb-3 rounded-xl bg-green-50 border border-green-200 text-green-800 text-[13px] px-4 py-2">{msg}</div>}
      {err && <div className="mb-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px] px-4 py-2">{err}</div>}
      <button onClick={() => tpl && setEdit({ id: null, d: tpl })} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-[14px] font-bold">+ Nova campanha</button>
      <div className="mt-4 space-y-3">
        {list.map(c => (
          <div key={c.id} className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="font-bold text-gray-900">{c.name}</div>
              <span className="text-[11px] bg-gray-100 rounded-full px-2 py-0.5">{CSTATE[c.state] || c.state}</span>
              {c.scheduled_at && <span className="text-[11px] text-gray-500">início {new Date(c.scheduled_at).toLocaleString('pt-BR')}</span>}
              <div className="ml-auto flex gap-2">
                {c.state === 'draft' && <button onClick={() => open(c.id)} className="px-3 py-1.5 rounded-lg border text-[12px] font-semibold">Abrir</button>}
                {['scheduled', 'running'].includes(c.state) && <button onClick={() => control(c.id, 'pause')} className="px-3 py-1.5 rounded-lg border text-[12px] font-semibold">Pausar</button>}
                {c.state === 'paused' && <button onClick={() => control(c.id, 'resume')} className="px-3 py-1.5 rounded-lg border text-[12px] font-semibold">Retomar</button>}
                {['draft', 'scheduled', 'running', 'paused'].includes(c.state) && <button onClick={() => control(c.id, 'cancel')} className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 text-[12px] font-semibold">Cancelar</button>}
              </div>
            </div>
            {c.stats.total > 0 && <div className="mt-2 text-[12px] text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
              <span>Total {c.stats.total}</span><span>Faltam {c.stats.pending}</span><span>Enviados {c.stats.accepted}</span><span>Entregues {c.stats.delivered}</span>
              <span>Abertos {c.stats.opened}</span><span>Cliques {c.stats.clicked}</span>
              {c.stats.bounced > 0 && <span className="text-red-600">Devolvidos {c.stats.bounced}</span>}{c.stats.complained > 0 && <span className="text-red-600">Denúncias {c.stats.complained}</span>}
              {c.stats.refused > 0 && <span className="text-red-600">Recusados {c.stats.refused}</span>}{c.stats.unknown > 0 && <span className="text-amber-600">Incertos {c.stats.unknown}</span>}
            </div>}
          </div>
        ))}
        {!list.length && <div className="text-center text-gray-400 py-10 text-[13px]">Nenhuma campanha ainda.</div>}
      </div>
    </div>
  )
}

function Editor({ initial, cfg, onDone }: { initial: { id: string | null; d: Draft }; cfg: { ready: boolean; issues: string[] } | null; onDone: (msg?: string) => void }) {
  const [id, setId] = useState(initial.id); const [d, setD] = useState<Draft>(initial.d)
  const [lang, setLang] = useState<'en' | 'pt' | 'es'>('pt')
  const [aud, setAud] = useState<Audience | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [msg, setMsg] = useState('')
  const [when, setWhen] = useState('')
  const f = d.filters
  const placeholder = [d.subject_en, d.body_en, d.subject_pt, d.body_pt, d.subject_es, d.body_es].some(x => x.includes('[['))
  const set = (p: Partial<Draft>) => { setD(x => ({ ...x, ...p })); setAud(null) }
  const toggle = (key: 'languages' | 'statuses', v: string) => { const cur = f[key] || []; set({ filters: { ...f, [key]: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] } }) }

  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); setMsg(''); try { await fn() } catch (e) { setErr(e instanceof Error ? e.message : 'Falha.') } setBusy(false) }
  const save = async () => { if (id) await api('/api/admin/recruit/campaigns', 'POST', { action: 'update', id, campaign: d }); else { const r = await api('/api/admin/recruit/campaigns', 'POST', { action: 'create', campaign: d }); setId(r.campaign.id); return r.campaign.id as string } return id! }
  const audience = () => run(async () => { setAud((await api('/api/admin/recruit/campaigns', 'POST', { action: 'audience', filters: d.filters })).audience) })
  const test = () => run(async () => { const cid = await save(); const r = await api('/api/admin/recruit/campaigns', 'POST', { action: 'test', id: cid, language: lang }); setMsg(`Teste em ${LANG[lang]} enviado para ${r.sentTo}.`) })
  const schedule = () => run(async () => {
    if (!aud) throw new Error('Clique em “Ver quantos vão receber” antes.')
    const text = `Enviar para ${aud.eligible} agentes (${aud.en} inglês, ${aud.pt} português, ${aud.es} espanhol), até ${d.daily_limit} por dia${when ? ', começando em ' + new Date(when).toLocaleString('pt-BR') : ', começando agora'}?`
    if (!confirm(text)) return
    const cid = await save()
    await api('/api/admin/recruit/campaigns', 'POST', { action: 'schedule', id: cid, expected: aud.eligible, at: when ? new Date(when).toISOString() : undefined, confirm: true })
    onDone('Campanha agendada. O envio segue sozinho, no ritmo escolhido.')
  })

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center mb-4"><div className="font-extrabold text-gray-900 text-[17px]">{id ? 'Editar campanha' : 'Nova campanha'}</div><button onClick={() => onDone()} className="ml-auto text-[13px] text-gray-500 underline">Voltar</button></div>
      <label className="text-[12px] font-semibold text-gray-600">Nome (só para você)
        <input value={d.name} onChange={e => set({ name: e.target.value })} maxLength={100} className="mt-1 block w-full border rounded-xl px-3 py-2 text-[14px] font-normal" /></label>

      <div className="mt-4 flex gap-2">
        {(['pt', 'en', 'es'] as const).map(l => <button key={l} onClick={() => setLang(l)} className={`px-4 py-1.5 rounded-full text-[13px] font-semibold border ${lang === l ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'}`}>{LANG[l]}</button>)}
      </div>
      <label className="block mt-3 text-[12px] font-semibold text-gray-600">Assunto — {LANG[lang]}
        <input value={d[`subject_${lang}` as 'subject_en']} onChange={e => set({ [`subject_${lang}`]: e.target.value } as Partial<Draft>)} maxLength={160} className="mt-1 block w-full border rounded-xl px-3 py-2 text-[14px] font-normal" /></label>
      <label className="block mt-3 text-[12px] font-semibold text-gray-600">Texto — {LANG[lang]} <span className="font-normal text-gray-400">(use {'{{nome}}'} para o primeiro nome)</span>
        <textarea value={d[`body_${lang}` as 'body_en']} onChange={e => set({ [`body_${lang}`]: e.target.value } as Partial<Draft>)} rows={12} maxLength={20000} className="mt-1 block w-full border rounded-xl px-3 py-2 text-[14px] font-normal font-mono" /></label>
      {placeholder && <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[12px] px-3 py-2">Ainda há trechos <b>[[PREENCHER…]]</b> nos textos. Troque pelos dados reais (comissão, leads, assinatura) nos 3 idiomas — com eles a campanha não pode ser agendada.</div>}
      <div className="text-[11px] text-gray-400 mt-1">O rodapé com endereço e o link para cancelar recebimento entra sozinho, no idioma de cada agente.</div>

      <div className="mt-5 grid md:grid-cols-3 gap-4">
        <div><div className="text-[12px] font-semibold text-gray-600 mb-1">Status dos agentes</div>
          {Object.entries(STATUS).map(([k, v]) => <label key={k} className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={(f.statuses || ['new']).includes(k)} onChange={() => toggle('statuses', k)} />{v}</label>)}</div>
        <div><div className="text-[12px] font-semibold text-gray-600 mb-1">Idioma do agente <span className="font-normal">(vazio = todos)</span></div>
          {Object.entries(LANG).map(([k, v]) => <label key={k} className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={(f.languages || []).includes(k)} onChange={() => toggle('languages', k)} />{v}</label>)}</div>
        <div><label className="text-[12px] font-semibold text-gray-600">Estados (UF, separados por vírgula; vazio = todos)
          <input value={(f.states || []).join(', ')} onChange={e => set({ filters: { ...f, states: e.target.value.toUpperCase().split(/[^A-Z]+/).filter(s => s.length === 2) } })} placeholder="FL, TX" className="mt-1 block w-full border rounded-xl px-3 py-2 text-[13px] font-normal" /></label>
          <label className="block mt-3 text-[12px] font-semibold text-gray-600">Máximo por dia
            <input type="number" min={1} max={1000} value={d.daily_limit} onChange={e => set({ daily_limit: Number(e.target.value) })} className="mt-1 block w-28 border rounded-xl px-3 py-2 text-[13px] font-normal" /></label></div>
      </div>

      {err && <div className="mt-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px] px-4 py-2">{err}</div>}
      {msg && <div className="mt-4 rounded-xl bg-green-50 border border-green-200 text-green-800 text-[13px] px-4 py-2">{msg}</div>}
      {aud && <div className="mt-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-[13px] px-4 py-3">
        <b>{aud.eligible.toLocaleString('en-US')} vão receber</b> — {aud.en} em inglês, {aud.pt} em português, {aud.es} em espanhol.
        {(aud.suppressed > 0 || aud.already_client > 0) && <span> Ficam de fora: {aud.suppressed} que cancelaram ou devolveram e-mail, {aud.already_client} que já são clientes.</span>}</div>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button disabled={busy || !d.name.trim()} onClick={() => run(async () => { await save(); setMsg('Rascunho salvo.') })} className="px-4 py-2.5 rounded-xl border text-[14px] font-semibold disabled:opacity-50">Salvar rascunho</button>
        <button disabled={busy} onClick={audience} className="px-4 py-2.5 rounded-xl border text-[14px] font-semibold disabled:opacity-50">Ver quantos vão receber</button>
        <button disabled={busy || !d.name.trim() || !cfg?.ready} onClick={test} className="px-4 py-2.5 rounded-xl border text-[14px] font-semibold disabled:opacity-50">Enviar teste para mim ({LANG[lang]})</button>
        <span className="flex-1" />
        <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} className="border rounded-xl px-3 py-2 text-[13px]" title="Vazio = começa agora" />
        <button disabled={busy || !aud || aud.eligible < 1 || placeholder || !cfg?.ready || !d.name.trim()} onClick={schedule} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-[14px] font-bold disabled:opacity-40">Agendar envio</button>
      </div>
      {!cfg?.ready && <div className="mt-2 text-[12px] text-amber-700">Envio bloqueado: {cfg?.issues.join(' ')}</div>}
    </div>
  )
}
