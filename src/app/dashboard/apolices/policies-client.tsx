'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BUCKETS, bucketOf, acaoSugerida, ordenar, money, diasAte, diasDesde,
  STATUS_LABEL, REQUISITOS_COMUNS, type Policy, type Bucket, type PolicyKpis,
} from '@/lib/insurance-policies'

/**
 * Tela de Apólices (pós-venda) — traz o modelo do "Status do Book" pro Lead4Pro,
 * com a identidade da casa (cards brancos, borda #e8ecf4, acento índigo #6366f1).
 * O corretor vê o que fazer HOJE: buckets de ação calculados por data/pendência.
 */
export function PoliciesClient({ buyerId }: { buyerId: string }) {
  const [lista, setLista] = useState<Policy[]>([])
  const [kpis, setKpis] = useState<PolicyKpis | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [migracao, setMigracao] = useState(false)
  const [filtro, setFiltro] = useState<Bucket | 'todas'>('todas')
  const [busca, setBusca] = useState('')
  const [edit, setEdit] = useState<Partial<Policy> | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [conector, setConector] = useState<{ conectado: boolean; seguradora?: string | null; ultimaSync?: string | null } | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [avisoSync, setAvisoSync] = useState<string | null>(null)

  async function carregar() {
    try {
      const d = await fetch('/api/apolices', { cache: 'no-store' }).then(r => r.json())
      setLista(d.policies || []); setKpis(d.kpis || null); setMigracao(!!d.needsMigration)
    } catch {}
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [])
  useEffect(() => {
    fetch('/api/apolices/sync', { cache: 'no-store' }).then(r => r.json()).then(setConector).catch(() => {})
  }, [])

  /** Puxa o portal da seguradora — atualiza status/pendências sem tocar no que você escreveu. */
  async function sincronizar() {
    setSincronizando(true); setAvisoSync(null)
    try {
      const r = await fetch('/api/apolices/sync', { method: 'POST' })
      const d = await r.json()
      if (!r.ok) { setAvisoSync(d.error || 'Não consegui atualizar agora.'); setSincronizando(false); return }
      const partes = []
      if (d.novas) partes.push(`${d.novas} nova(s)`)
      if (d.atualizadas) partes.push(`${d.atualizadas} atualizada(s)`)
      setAvisoSync(partes.length
        ? `Portal lido: ${partes.join(' · ')}. ${d.semMudanca} sem mudança.`
        : `Tudo em dia — nenhuma mudança no portal (${d.semMudanca} apólices conferidas).`)
      await carregar()
      fetch('/api/apolices/sync', { cache: 'no-store' }).then(r => r.json()).then(setConector).catch(() => {})
    } catch { setAvisoSync('Erro de conexão com o portal.') }
    setSincronizando(false)
  }

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return lista
      .filter(p => filtro === 'todas' || bucketOf(p) === filtro)
      .filter(p => !t || `${p.client_name} ${p.policy_number || ''} ${p.product || ''} ${p.carrier || ''}`.toLowerCase().includes(t))
      .sort(ordenar)
  }, [lista, filtro, busca])

  const porBucket = useMemo(() => {
    const m = new Map<Bucket, Policy[]>()
    for (const p of visiveis) {
      const b = bucketOf(p)
      m.set(b, [...(m.get(b) || []), p])
    }
    return m
  }, [visiveis])

  async function salvar() {
    if (!edit?.client_name?.trim()) { alert('Informe o nome do cliente.'); return }
    setSalvando(true)
    try {
      const metodo = edit.id ? 'PATCH' : 'POST'
      const r = await fetch('/api/apolices', {
        method: metodo, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edit),
      })
      const d = await r.json()
      if (!r.ok) { alert(d.error || 'Não consegui salvar.'); setSalvando(false); return }
      setEdit(null); await carregar()
    } catch { alert('Erro de conexão.') }
    setSalvando(false)
  }

  async function excluir(id: string) {
    if (!confirm('Excluir esta apólice do seu acompanhamento?')) return
    await fetch(`/api/apolices?id=${id}`, { method: 'DELETE' })
    carregar()
  }

  async function marcarFeito(p: Policy) {
    await fetch('/api/apolices', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, done_at: p.done_at ? null : new Date().toISOString() }),
    })
    carregar()
  }

  const K = ({ label, valor, cor, sub }: { label: string; valor: string | number; cor?: string; sub?: string }) => (
    <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
      <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>{label}</p>
      <p className="text-[32px] font-extrabold mt-1" style={{ color: cor || '#1a1a2e' }}>{valor}</p>
      {sub && <p className="text-[11px] mt-1" style={{ color: '#94a3b8' }}>{sub}</p>}
    </div>
  )

  return (
    <div className="max-w-[1040px]">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>Apólices</h1>
          <p className="text-[14px] mt-1" style={{ color: '#64748b' }}>
            Pós-venda: o que precisa da sua ação hoje para não perder cliente nem comissão
          </p>
        </div>
        <div className="flex gap-2">
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente ou nº da apólice…"
            className="px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4', width: 250 }} />
          {conector?.conectado && (
            <button onClick={sincronizar} disabled={sincronizando}
              className="px-4 py-2 rounded-xl text-[13px] font-bold"
              style={{ background: '#fff', border: '1px solid #e8ecf4', color: sincronizando ? '#94a3b8' : '#0f766e' }}
              title={`Ler o portal da ${conector.seguradora} agora`}>
              {sincronizando ? '⏳ Lendo o portal…' : '🔄 Atualizar do portal'}
            </button>
          )}
          <button onClick={() => setEdit({ status: 'submitted', premium_mode: 'monthly', requirements: [] })}
            className="px-4 py-2 rounded-xl text-[13px] font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
            + Nova apólice
          </button>
        </div>
      </div>

      {avisoSync && (
        <div className="rounded-xl p-3 mb-4 text-[13px] font-semibold flex items-center justify-between gap-3"
          style={{ background: '#f0fdfa', border: '1px solid #99f6e4', color: '#0f766e' }}>
          <span>🔄 {avisoSync}</span>
          <button onClick={() => setAvisoSync(null)} style={{ color: '#5eead4' }}>✕</button>
        </div>
      )}

      {conector?.conectado && conector.ultimaSync && !avisoSync && (
        <p className="text-[12px] mb-4" style={{ color: '#94a3b8' }}>
          Conectado ao portal da {conector.seguradora} · última leitura{' '}
          {new Date(conector.ultimaSync).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      {migracao && (
        <div className="rounded-xl p-4 mb-5 text-[13px] font-semibold" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
          ⚠️ Recurso em ativação — rode a migration <b>036_policies.sql</b> no Supabase para começar a usar.
        </div>
      )}

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <K label="No book" valor={kpis.total} sub={`${money(kpis.coberturaCents)} de cobertura ativa`} />
          <K label="Ativas e em dia" valor={kpis.ativas} cor="#059669" sub={`${money(kpis.premioMensalCents)}/mês em prêmio`} />
          <K label="Com pendência" valor={kpis.pendentes} cor="#b45309" sub="documento ou assinatura" />
          <K label="Em risco" valor={kpis.emRisco} cor={kpis.emRisco > 0 ? '#b91c1c' : '#94a3b8'} sub="caducando ou caducadas" />
        </div>
      )}

      {/* Chips de bucket */}
      <div className="flex gap-2 flex-wrap mb-5">
        <button onClick={() => setFiltro('todas')}
          className="px-3.5 py-1.5 rounded-full text-[12px] font-bold"
          style={{ background: filtro === 'todas' ? '#6366f1' : '#f1f5f9', color: filtro === 'todas' ? '#fff' : '#64748b' }}>
          Todas ({lista.length})
        </button>
        {BUCKETS.map(b => {
          const n = kpis?.porBucket?.[b.key] ?? 0
          if (n === 0 && b.key !== 'urgente') return null
          const on = filtro === b.key
          return (
            <button key={b.key} onClick={() => setFiltro(b.key)}
              className="px-3.5 py-1.5 rounded-full text-[12px] font-bold"
              style={{ background: on ? b.color : b.bg, color: on ? '#fff' : b.color, border: `1px solid ${on ? b.color : 'transparent'}` }}>
              {b.icon} {b.label} ({n})
            </button>
          )
        })}
      </div>

      {carregando ? (
        <p className="text-[13px]" style={{ color: '#94a3b8' }}>Carregando…</p>
      ) : lista.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={{ background: '#fff', border: '1px dashed #cbd5e1' }}>
          <p className="text-[15px] font-bold mb-1" style={{ color: '#1a1a2e' }}>Nenhuma apólice cadastrada</p>
          <p className="text-[13px] mb-4" style={{ color: '#64748b' }}>
            Registre as apólices vendidas para acompanhar assinaturas pendentes, pagamentos em risco e o que a seguradora ainda não processou.
          </p>
          <button onClick={() => setEdit({ status: 'submitted', premium_mode: 'monthly', requirements: [] })}
            className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white" style={{ background: '#6366f1' }}>
            + Cadastrar a primeira
          </button>
        </div>
      ) : (
        BUCKETS.map(b => {
          const itens = porBucket.get(b.key) || []
          if (itens.length === 0) return null
          return (
            <div key={b.key} className="mb-7">
              <div className="flex items-baseline gap-2 mb-1">
                <h2 className="text-[16px] font-extrabold" style={{ color: b.color }}>{b.icon} {b.label}</h2>
                <span className="text-[12px] font-bold" style={{ color: '#94a3b8' }}>{itens.length}</span>
              </div>
              <p className="text-[12.5px] mb-3" style={{ color: '#94a3b8' }}>{b.hint}</p>
              <div className="space-y-3">
                {itens.map(p => {
                  const venceEm = diasAte(p.due_date)
                  const paradoHa = diasDesde(p.issued_at || p.submitted_at)
                  const open = aberto === p.id
                  return (
                    <div key={p.id} className="rounded-2xl p-5" style={{
                      background: '#fff', border: '1px solid #e8ecf4', borderLeft: `4px solid ${b.color}`,
                      opacity: p.done_at ? 0.55 : 1,
                    }}>
                      <div className="flex items-start gap-3">
                        <button onClick={() => marcarFeito(p)} title={p.done_at ? 'Reabrir' : 'Marcar como feito'}
                          className="mt-0.5 w-5 h-5 rounded flex items-center justify-center text-[12px] font-bold flex-shrink-0"
                          style={{ border: `2px solid ${p.done_at ? '#10b981' : '#cbd5e1'}`, background: p.done_at ? '#10b981' : '#fff', color: '#fff' }}>
                          {p.done_at ? '✓' : ''}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[15px] font-extrabold" style={{ color: '#1a1a2e' }}>{p.client_name}</p>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ background: '#eef2ff', color: '#4f46e5' }}>
                              {STATUS_LABEL[p.status]}
                            </span>
                          </div>
                          <p className="text-[12px] mt-0.5" style={{ color: '#94a3b8' }}>
                            {[p.policy_number, p.carrier, p.product,
                              p.premium_cents ? `${money(p.premium_cents)}/${p.premium_mode === 'annual' ? 'ano' : 'mês'}` : null,
                              p.coverage_cents ? `${money(p.coverage_cents)} de cobertura` : null,
                            ].filter(Boolean).join(' · ')}
                          </p>

                          <p className="text-[13px] font-bold mt-2" style={{ color: b.color }}>{acaoSugerida(p)}</p>

                          {(p.requirements || []).length > 0 && (
                            <div className="flex gap-1.5 flex-wrap mt-2">
                              {(p.requirements || []).map(r => (
                                <span key={r} className="text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{ background: '#fffbeb', color: '#b45309' }}>
                                  ⏳ {r}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="flex gap-2 flex-wrap mt-3">
                            {p.client_phone && (
                              <a href={`tel:${p.client_phone.replace(/\D/g, '')}`}
                                className="px-3 py-1.5 rounded-lg text-[12px] font-bold" style={{ background: '#ecfdf5', color: '#047857' }}>
                                📞 {p.client_phone}
                              </a>
                            )}
                            {p.client_email && (
                              <a href={`mailto:${p.client_email}`}
                                className="px-3 py-1.5 rounded-lg text-[12px] font-bold" style={{ background: '#eef2ff', color: '#4f46e5' }}>
                                ✉️ {p.client_email}
                              </a>
                            )}
                            <button onClick={() => setAberto(open ? null : p.id)}
                              className="px-3 py-1.5 rounded-lg text-[12px] font-bold" style={{ background: '#f8fafc', color: '#64748b' }}>
                              {open ? '▾ Ocultar detalhes' : '▸ Detalhes para decidir'}
                            </button>
                            <button onClick={() => setEdit(p)} className="px-3 py-1.5 rounded-lg text-[12px] font-bold" style={{ background: '#f8fafc', color: '#64748b' }}>
                              ✏️ Editar
                            </button>
                          </div>

                          {open && (
                            <div className="mt-3 pt-3 grid grid-cols-2 gap-x-6 gap-y-2" style={{ borderTop: '1px solid #f1f5f9' }}>
                              {[
                                ['Dívida', p.amount_due_cents ? money(p.amount_due_cents) : null],
                                ['Prazo', p.due_date ? `${p.due_date}${venceEm !== null ? ` (${venceEm} dia(s))` : ''}` : null],
                                ['Cobertura', p.coverage_cents ? money(p.coverage_cents) : null],
                                ['Prêmio', p.premium_cents ? `${money(p.premium_cents)}/${p.premium_mode === 'annual' ? 'ano' : 'mês'}` : null],
                                ['Enviada em', p.submitted_at],
                                ['Emitida em', p.issued_at],
                                ['Vigente desde', p.effective_date],
                                ['Pago até', p.paid_through],
                                ['Beneficiário', p.beneficiary],
                                ['Parada há', paradoHa !== null ? `${paradoHa} dia(s)` : null],
                              ].filter(([, v]) => v).map(([k, v]) => (
                                <div key={String(k)}>
                                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>{k}</p>
                                  <p className="text-[13px] font-semibold" style={{ color: '#1a1a2e' }}>{v}</p>
                                </div>
                              ))}
                              {p.notes && (
                                <div className="col-span-2 mt-1">
                                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Histórico / leitura do caso</p>
                                  <p className="text-[13px] whitespace-pre-wrap" style={{ color: '#334155' }}>{p.notes}</p>
                                </div>
                              )}
                              <div className="col-span-2">
                                <button onClick={() => excluir(p.id)} className="text-[11px] font-bold" style={{ color: '#dc2626' }}>Excluir apólice</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
      )}

      {/* Modal cadastro/edição */}
      {edit && (
        <div onClick={() => !salvando && setEdit(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} className="rounded-2xl p-6"
            style={{ background: '#fff', width: 620, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>
            <p className="text-[18px] font-extrabold mb-4" style={{ color: '#1a1a2e' }}>
              {edit.id ? 'Editar apólice' : 'Nova apólice'}
            </p>

            <div className="grid grid-cols-2 gap-3">
              {([
                ['client_name', 'Cliente *', 'text'], ['policy_number', 'Nº da apólice', 'text'],
                ['client_phone', 'Telefone', 'text'], ['client_email', 'E-mail', 'email'],
                ['carrier', 'Seguradora', 'text'], ['product', 'Produto', 'text'],
              ] as const).map(([campo, label, tipo]) => (
                <div key={campo}>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>{label}</label>
                  <input type={tipo} value={(edit as any)[campo] || ''} onChange={e => setEdit({ ...edit, [campo]: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4' }} />
                </div>
              ))}

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Prêmio ($)</label>
                <input type="number" step="0.01" value={edit.premium_cents ? edit.premium_cents / 100 : ''}
                  onChange={e => setEdit({ ...edit, premium_cents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null })}
                  className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4' }} />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Cobertura ($)</label>
                <input type="number" value={edit.coverage_cents ? edit.coverage_cents / 100 : ''}
                  onChange={e => setEdit({ ...edit, coverage_cents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null })}
                  className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4' }} />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Situação</label>
                <select value={edit.status || 'submitted'} onChange={e => setEdit({ ...edit, status: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4' }}>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Periodicidade</label>
                <select value={edit.premium_mode || 'monthly'} onChange={e => setEdit({ ...edit, premium_mode: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4' }}>
                  <option value="monthly">Mensal</option><option value="annual">Anual</option>
                </select>
              </div>

              {([
                ['submitted_at', 'Enviada em'], ['issued_at', 'Emitida em'],
                ['effective_date', 'Vigente desde'], ['paid_through', 'Pago até'],
              ] as const).map(([campo, label]) => (
                <div key={campo}>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>{label}</label>
                  <input type="date" value={(edit as any)[campo] || ''} onChange={e => setEdit({ ...edit, [campo]: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4' }} />
                </div>
              ))}

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Dívida ($)</label>
                <input type="number" step="0.01" value={edit.amount_due_cents ? edit.amount_due_cents / 100 : ''}
                  onChange={e => setEdit({ ...edit, amount_due_cents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null })}
                  className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4' }} />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Prazo do aviso</label>
                <input type="date" value={edit.due_date || ''} onChange={e => setEdit({ ...edit, due_date: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4' }} />
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#94a3b8' }}>Pendências</label>
              <div className="flex gap-1.5 flex-wrap">
                {REQUISITOS_COMUNS.map(r => {
                  const on = (edit.requirements || []).includes(r)
                  return (
                    <button key={r} type="button"
                      onClick={() => setEdit({ ...edit, requirements: on ? (edit.requirements || []).filter(x => x !== r) : [...(edit.requirements || []), r] })}
                      className="px-2.5 py-1 rounded-lg text-[11.5px] font-bold"
                      style={{ background: on ? '#fffbeb' : '#f8fafc', color: on ? '#b45309' : '#94a3b8', border: `1px solid ${on ? '#fde68a' : '#e8ecf4'}` }}>
                      {on ? '⏳ ' : '+ '}{r}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Ação recomendada (opcional)</label>
              <input value={edit.next_action || ''} onChange={e => setEdit({ ...edit, next_action: e.target.value })}
                placeholder="Deixe vazio para o sistema sugerir automaticamente"
                className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4' }} />
            </div>
            <div className="mt-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Histórico / observações</label>
              <textarea value={edit.notes || ''} onChange={e => setEdit({ ...edit, notes: e.target.value })} rows={3}
                className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4' }} />
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setEdit(null)} disabled={salvando}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold" style={{ background: '#f1f5f9', color: '#475569' }}>
                Cancelar
              </button>
              <button onClick={salvar} disabled={salvando}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50" style={{ background: '#6366f1' }}>
                {salvando ? 'Salvando…' : 'Salvar apólice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
