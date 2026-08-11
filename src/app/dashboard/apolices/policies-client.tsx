'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BUCKETS, bucketOf, acaoSugerida, ordenar, money, diasAte, diasDesde,
  STATUS_LABEL, REQUISITOS_COMUNS, type Policy, type Bucket, type PolicyKpis,
} from '@/lib/insurance-policies'
import { useT } from '@/lib/i18n-client'

/**
 * Tela de Apólices (pós-venda) — traz o modelo do "Status do Book" pro Lead4Pro,
 * com a identidade da casa (cards brancos, borda #e8ecf4, acento índigo #6366f1).
 * O corretor vê o que fazer HOJE: buckets de ação calculados por data/pendência.
 */
export function PoliciesClient({ buyerId }: { buyerId: string }) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const loc = t._locale
  const buckets = BUCKETS(loc)
  const statusLabels = STATUS_LABEL(loc)
  const dias = (n: number) => L(`${n} dia(s)`, `${n} day(s)`, `${n} día(s)`)
  const [lista, setLista] = useState<Policy[]>([])
  const [kpis, setKpis] = useState<PolicyKpis | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [migracao, setMigracao] = useState(false)
  const [filtro, setFiltro] = useState<Bucket | 'todas'>('todas')
  const [busca, setBusca] = useState('')
  const [edit, setEdit] = useState<Partial<Policy> | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [conector, setConector] = useState<{
    conectado: boolean; seguradora?: string | null; ultimaSync?: string | null
    robo?: { running: boolean; awaiting_mfa: boolean; last_run: string | null; last_error: string | null } | null
  } | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [avisoSync, setAvisoSync] = useState<string | null>(null)
  const [mfaPedido, setMfaPedido] = useState(false)
  const [mfaCodigo, setMfaCodigo] = useState('')

  async function carregar() {
    try {
      const d = await fetch('/api/apolices', { cache: 'no-store' }).then(r => r.json())
      setLista(d.policies || []); setKpis(d.kpis || null); setMigracao(!!d.needsMigration)
    } catch {}
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [])
  useEffect(() => {
    fetch('/api/apolices/sync', { cache: 'no-store' }).then(r => r.json()).then(async c => {
      setConector(c)
      // o robô varreu DEPOIS da última importação → o book está atrás do portal:
      // importa sozinho, sem o corretor precisar lembrar de clicar.
      const varrido = c?.robo?.last_run ? new Date(c.robo.last_run).getTime() : 0
      const importado = c?.ultimaSync ? new Date(c.ultimaSync).getTime() : 0
      if (c?.conectado && varrido > importado && !c?.robo?.running) {
        try {
          const r = await fetch('/api/apolices/sync', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modo: 'importar' }),
          })
          if (r.ok) { await carregar(); fetch('/api/apolices/sync', { cache: 'no-store' }).then(x => x.json()).then(setConector).catch(() => {}) }
        } catch {}
      }
    }).catch(() => {})
  }, [])

  const postSync = (body: any) => fetch('/api/apolices/sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })

  /** Espera a varredura terminar (ou pedir MFA) e importa o resultado. */
  async function esperarEImportar() {
    const inicio = Date.now()
    let pronto = false
    while (Date.now() - inicio < 6 * 60_000) {
      await new Promise(res => setTimeout(res, 10_000))
      const s = await postSync({ modo: 'status' }).then(r => r.json()).catch(() => null)
      if (!s) continue
      if (s.awaiting_mfa) {
        // o código chegou no e-mail do agente — o campo pra digitar aparece no banner
        setMfaPedido(true)
        setAvisoSync(L('⚠️ O portal pediu o código de verificação que acabou de chegar no e-mail do agente. Digite aqui:',
                       '⚠️ The portal asked for the verification code that just arrived in the agent email. Type it here:',
                       '⚠️ El portal pidió el código de verificación que acaba de llegar al correo del agente. Escríbelo aquí:'))
        setSincronizando(false); return
      }
      if (s.last_error && !s.running) {
        setAvisoSync(L(`⚠️ A varredura falhou: ${s.last_error}. Importando a última leitura disponível…`,
                       `⚠️ The sweep failed: ${s.last_error}. Importing the latest available read…`,
                       `⚠️ El barrido falló: ${s.last_error}. Importando la última lectura disponible…`))
        break
      }
      if (!s.running) { pronto = true; break }
    }
    if (!pronto) {
      // não terminou no prazo → importa o que tem e avisa (melhor que nada)
      setAvisoSync(prev => prev?.startsWith('⚠️') ? prev : L('A varredura está demorando — importando a última leitura disponível.',
        'The sweep is taking long — importing the latest available read.',
        'El barrido está tardando — importando la última lectura disponible.'))
    }

    const r = await postSync({ modo: 'importar' })
    const d = await r.json()
    if (!r.ok) { setAvisoSync(d.error || L('Não consegui atualizar agora.', 'Could not refresh right now.', 'No pude actualizar ahora.')); setSincronizando(false); return }
    const partes = []
    if (d.novas) partes.push(L(`${d.novas} nova(s)`, `${d.novas} new`, `${d.novas} nueva(s)`))
    if (d.atualizadas) partes.push(L(`${d.atualizadas} atualizada(s)`, `${d.atualizadas} updated`, `${d.atualizadas} actualizada(s)`))
    setAvisoSync(partes.length
      ? L(`Portal lido: ${partes.join(' · ')}. ${d.semMudanca} sem mudança.`,
          `Portal read: ${partes.join(' · ')}. ${d.semMudanca} unchanged.`,
          `Portal leído: ${partes.join(' · ')}. ${d.semMudanca} sin cambios.`)
      : L(`Tudo em dia — nenhuma mudança no portal (${d.semMudanca} apólices conferidas).`,
          `All caught up — no changes on the portal (${d.semMudanca} policies checked).`,
          `Todo al día — sin cambios en el portal (${d.semMudanca} pólizas revisadas).`))
    await carregar()
    fetch('/api/apolices/sync', { cache: 'no-store' }).then(r => r.json()).then(setConector).catch(() => {})
    setSincronizando(false)
  }

  /**
   * Puxa o portal DE VERDADE: acorda o robô (Playwright no servidor, ~2-4 min),
   * acompanha a varredura e só então importa. Antes o botão lia um cache que podia
   * ter DIAS — parecia atualizado e não era.
   */
  async function sincronizar() {
    setSincronizando(true); setAvisoSync(null); setMfaPedido(false)
    try {
      const v = await postSync({ modo: 'varrer' })
      const vd = await v.json()
      if (!v.ok) { setAvisoSync(vd.error || L('Não consegui acordar o robô do portal.', 'Could not wake the portal robot.', 'No pude despertar el robot del portal.')); setSincronizando(false); return }

      setAvisoSync(L('Varrendo o portal da National Life… (~2 a 4 min — pode continuar usando o sistema)',
                     'Sweeping the National Life portal… (~2–4 min — you can keep using the system)',
                     'Barriendo el portal de National Life… (~2–4 min — puedes seguir usando el sistema)'))
      await esperarEImportar()
    } catch {
      setAvisoSync(L('Erro de conexão com o portal.', 'Connection error with the portal.', 'Error de conexión con el portal.'))
      setSincronizando(false)
    }
  }

  /** Entrega o código MFA digitado no banner e retoma a varredura do ponto onde parou. */
  async function enviarMfa() {
    const code = mfaCodigo.replace(/\D/g, '')
    if (code.length < 4) return
    setSincronizando(true)
    try {
      const r = await postSync({ modo: 'mfa', code })
      const d = await r.json()
      if (!r.ok) {
        setAvisoSync(d.error || L('O robô recusou o código — confira e tente de novo.', 'The robot rejected the code — check it and try again.', 'El robot rechazó el código — revísalo e inténtalo de nuevo.'))
        setSincronizando(false); return
      }
      setMfaPedido(false); setMfaCodigo('')
      setAvisoSync(L('Código entregue — continuando a varredura…', 'Code delivered — resuming the sweep…', 'Código entregado — reanudando el barrido…'))
      await esperarEImportar()
    } catch {
      setAvisoSync(L('Erro de conexão com o portal.', 'Connection error with the portal.', 'Error de conexión con el portal.'))
      setSincronizando(false)
    }
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
    if (!edit?.client_name?.trim()) { alert(L('Informe o nome do cliente.', 'Enter the client name.', 'Ingresa el nombre del cliente.')); return }
    setSalvando(true)
    try {
      const metodo = edit.id ? 'PATCH' : 'POST'
      const r = await fetch('/api/apolices', {
        method: metodo, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edit),
      })
      const d = await r.json()
      if (!r.ok) { alert(d.error || L('Não consegui salvar.', 'Could not save.', 'No pude guardar.')); setSalvando(false); return }
      setEdit(null); await carregar()
    } catch { alert(L('Erro de conexão.', 'Connection error.', 'Error de conexión.')) }
    setSalvando(false)
  }

  async function excluir(id: string) {
    if (!confirm(L('Excluir esta apólice do seu acompanhamento?', 'Remove this policy from your tracking?', '¿Eliminar esta póliza de tu seguimiento?'))) return
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
          <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>{L('Gestão de Apólices', 'Policy Management', 'Gestión de Pólizas')}</h1>
          <p className="text-[14px] mt-1" style={{ color: '#64748b' }}>
            {L('Pós-venda: o que precisa da sua ação hoje para não perder cliente nem comissão',
               'Post-sale: what needs your action today so you do not lose the client or the commission',
               'Posventa: lo que necesita tu acción hoy para no perder al cliente ni la comisión')}
          </p>
        </div>
        <div className="flex gap-2">
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder={L('Buscar cliente ou nº da apólice…', 'Search client or policy no.…', 'Buscar cliente o nº de póliza…')}
            className="px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4', width: 250 }} />
          {conector?.conectado && (
            <button onClick={sincronizar} disabled={sincronizando}
              className="px-4 py-2 rounded-xl text-[13px] font-bold"
              style={{ background: '#fff', border: '1px solid #e8ecf4', color: sincronizando ? '#94a3b8' : '#0f766e' }}
              title={L(`Ler o portal da ${conector.seguradora} agora`, `Read the ${conector.seguradora} portal now`, `Leer el portal de ${conector.seguradora} ahora`)}>
              {sincronizando
                ? L('⏳ Lendo o portal…', '⏳ Reading the portal…', '⏳ Leyendo el portal…')
                : L('🔄 Atualizar do portal', '🔄 Refresh from portal', '🔄 Actualizar del portal')}
            </button>
          )}
          <button onClick={() => setEdit({ status: 'submitted', premium_mode: 'monthly', requirements: [] })}
            className="px-4 py-2 rounded-xl text-[13px] font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
            {L('+ Nova apólice', '+ New policy', '+ Nueva póliza')}
          </button>
        </div>
      </div>

      {avisoSync && (
        <div className="rounded-xl p-3 mb-4 text-[13px] font-semibold flex items-center justify-between gap-3 flex-wrap"
          style={{ background: mfaPedido ? '#fffbeb' : '#f0fdfa', border: `1px solid ${mfaPedido ? '#fde68a' : '#99f6e4'}`, color: mfaPedido ? '#92400e' : '#0f766e' }}>
          <span>🔄 {avisoSync}</span>
          {mfaPedido && (
            <span className="flex items-center gap-2">
              <input value={mfaCodigo} onChange={e => setMfaCodigo(e.target.value.replace(/\D/g, '').slice(0, 8))}
                onKeyDown={e => { if (e.key === 'Enter') enviarMfa() }}
                placeholder={L('código do e-mail', 'code from email', 'código del correo')}
                inputMode="numeric" autoFocus
                className="px-3 py-1.5 rounded-lg text-[14px] font-bold tracking-widest"
                style={{ border: '1px solid #fbbf24', width: 140, background: '#fff', color: '#1a1a2e' }} />
              <button onClick={enviarMfa} disabled={sincronizando || mfaCodigo.replace(/\D/g, '').length < 4}
                className="px-4 py-1.5 rounded-lg text-[13px] font-bold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
                {L('Enviar código', 'Send code', 'Enviar código')}
              </button>
            </span>
          )}
          <button onClick={() => { setAvisoSync(null); setMfaPedido(false) }} style={{ color: mfaPedido ? '#fbbf24' : '#5eead4' }}>✕</button>
        </div>
      )}

      {conector?.conectado && conector.ultimaSync && !avisoSync && (() => {
        const fmt = (iso: string) => new Date(iso).toLocaleString(t._locale === 'en' ? 'en-US' : t._locale === 'es' ? 'es-US' : 'pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        const varrido = conector.robo?.last_run || null
        const horasAtras = varrido ? (Date.now() - new Date(varrido).getTime()) / 3_600_000 : null
        const velho = horasAtras != null && horasAtras > 24
        return (
          <p className="text-[12px] mb-4" style={{ color: velho ? '#dc2626' : '#94a3b8' }}>
            {L(`Conectado ao portal da ${conector.seguradora}`, `Connected to the ${conector.seguradora} portal`, `Conectado al portal de ${conector.seguradora}`)}
            {varrido && <> · {L('portal varrido em', 'portal swept on', 'portal barrido el')} {fmt(varrido)}</>}
            {' · '}{L('importado em', 'imported on', 'importado el')} {fmt(conector.ultimaSync)}
            {velho && <b> · {L(`⚠️ dados de ${Math.floor(horasAtras! / 24)} dia(s) atrás — clique em Atualizar do portal`,
                               `⚠️ data from ${Math.floor(horasAtras! / 24)} day(s) ago — click Refresh from portal`,
                               `⚠️ datos de hace ${Math.floor(horasAtras! / 24)} día(s) — haz clic en Actualizar del portal`)}</b>}
          </p>
        )
      })()}

      {migracao && (
        <div className="rounded-xl p-4 mb-5 text-[13px] font-semibold" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
          {L('⚠️ Recurso em ativação — rode a migration ', '⚠️ Feature being activated — run the ', '⚠️ Función en activación — ejecuta la migración ')}
          <b>036_policies.sql</b>
          {L(' no Supabase para começar a usar.', ' migration in Supabase to start using it.', ' en Supabase para empezar a usarla.')}
        </div>
      )}

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <K label={L('No book', 'In the book', 'En el book')} valor={kpis.total}
            sub={L(`${money(kpis.coberturaCents)} de cobertura ativa`, `${money(kpis.coberturaCents)} in active coverage`, `${money(kpis.coberturaCents)} de cobertura activa`)} />
          <K label={L('Ativas e em dia', 'Active, in good standing', 'Activas y al día')} valor={kpis.ativas} cor="#059669"
            sub={L(`${money(kpis.premioMensalCents)}/mês em prêmio`, `${money(kpis.premioMensalCents)}/mo in premium`, `${money(kpis.premioMensalCents)}/mes en prima`)} />
          <K label={L('Com pendência', 'With pending items', 'Con pendientes')} valor={kpis.pendentes} cor="#b45309"
            sub={L('documento ou assinatura', 'document or signature', 'documento o firma')} />
          <K label={L('Em risco', 'At risk', 'En riesgo')} valor={kpis.emRisco} cor={kpis.emRisco > 0 ? '#b91c1c' : '#94a3b8'}
            sub={L('caducando ou caducadas', 'lapsing or lapsed', 'por caducar o caducadas')} />
        </div>
      )}

      {/* Chips de bucket */}
      <div className="flex gap-2 flex-wrap mb-5">
        <button onClick={() => setFiltro('todas')}
          className="px-3.5 py-1.5 rounded-full text-[12px] font-bold"
          style={{ background: filtro === 'todas' ? '#6366f1' : '#f1f5f9', color: filtro === 'todas' ? '#fff' : '#64748b' }}>
          {L('Todas', 'All', 'Todas')} ({lista.length})
        </button>
        {buckets.map(b => {
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
        <p className="text-[13px]" style={{ color: '#94a3b8' }}>{L('Carregando…', 'Loading…', 'Cargando…')}</p>
      ) : lista.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={{ background: '#fff', border: '1px dashed #cbd5e1' }}>
          <p className="text-[15px] font-bold mb-1" style={{ color: '#1a1a2e' }}>{L('Nenhuma apólice cadastrada', 'No policies yet', 'Ninguna póliza registrada')}</p>
          <p className="text-[13px] mb-4" style={{ color: '#64748b' }}>
            {L('Registre as apólices vendidas para acompanhar assinaturas pendentes, pagamentos em risco e o que a seguradora ainda não processou.',
               'Log the policies you sold to track pending signatures, at-risk payments and what the carrier has not processed yet.',
               'Registra las pólizas vendidas para dar seguimiento a firmas pendientes, pagos en riesgo y lo que la aseguradora aún no procesó.')}
          </p>
          <button onClick={() => setEdit({ status: 'submitted', premium_mode: 'monthly', requirements: [] })}
            className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white" style={{ background: '#6366f1' }}>
            {L('+ Cadastrar a primeira', '+ Add the first one', '+ Registrar la primera')}
          </button>
        </div>
      ) : (
        buckets.map(b => {
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
                        <button onClick={() => marcarFeito(p)} title={p.done_at ? L('Reabrir', 'Reopen', 'Reabrir') : L('Marcar como feito', 'Mark as done', 'Marcar como hecho')}
                          className="mt-0.5 w-5 h-5 rounded flex items-center justify-center text-[12px] font-bold flex-shrink-0"
                          style={{ border: `2px solid ${p.done_at ? '#10b981' : '#cbd5e1'}`, background: p.done_at ? '#10b981' : '#fff', color: '#fff' }}>
                          {p.done_at ? '✓' : ''}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[15px] font-extrabold" style={{ color: '#1a1a2e' }}>{p.client_name}</p>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ background: '#eef2ff', color: '#4f46e5' }}>
                              {statusLabels[p.status]}
                            </span>
                          </div>
                          <p className="text-[12px] mt-0.5" style={{ color: '#94a3b8' }}>
                            {[p.policy_number, p.carrier, p.product,
                              p.premium_cents ? `${money(p.premium_cents)}/${p.premium_mode === 'annual' ? L('ano', 'yr', 'año') : L('mês', 'mo', 'mes')}` : null,
                              p.coverage_cents ? L(`${money(p.coverage_cents)} de cobertura`, `${money(p.coverage_cents)} coverage`, `${money(p.coverage_cents)} de cobertura`) : null,
                            ].filter(Boolean).join(' · ')}
                          </p>

                          <p className="text-[13px] font-bold mt-2" style={{ color: b.color }}>{acaoSugerida(p, loc)}</p>

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
                              {open
                                ? L('▾ Ocultar detalhes', '▾ Hide details', '▾ Ocultar detalles')
                                : L('▸ Detalhes para decidir', '▸ Details to decide', '▸ Detalles para decidir')}
                            </button>
                            <button onClick={() => setEdit(p)} className="px-3 py-1.5 rounded-lg text-[12px] font-bold" style={{ background: '#f8fafc', color: '#64748b' }}>
                              {L('✏️ Editar', '✏️ Edit', '✏️ Editar')}
                            </button>
                          </div>

                          {open && (
                            <div className="mt-3 pt-3 grid grid-cols-2 gap-x-6 gap-y-2" style={{ borderTop: '1px solid #f1f5f9' }}>
                              {[
                                [L('Dívida', 'Amount due', 'Deuda'), p.amount_due_cents ? money(p.amount_due_cents) : null],
                                [L('Prazo', 'Deadline', 'Plazo'), p.due_date ? `${p.due_date}${venceEm !== null ? ` (${dias(venceEm)})` : ''}` : null],
                                [L('Cobertura', 'Coverage', 'Cobertura'), p.coverage_cents ? money(p.coverage_cents) : null],
                                [L('Prêmio', 'Premium', 'Prima'), p.premium_cents ? `${money(p.premium_cents)}/${p.premium_mode === 'annual' ? L('ano', 'yr', 'año') : L('mês', 'mo', 'mes')}` : null],
                                [L('Enviada em', 'Submitted on', 'Enviada el'), p.submitted_at],
                                [L('Emitida em', 'Issued on', 'Emitida el'), p.issued_at],
                                [L('Vigente desde', 'Effective since', 'Vigente desde'), p.effective_date],
                                [L('Pago até', 'Paid through', 'Pagado hasta'), p.paid_through],
                                [L('Beneficiário', 'Beneficiary', 'Beneficiario'), p.beneficiary],
                                [L('Parada há', 'Stalled for', 'Detenida hace'), paradoHa !== null ? dias(paradoHa) : null],
                              ].filter(([, v]) => v).map(([k, v]) => (
                                <div key={String(k)}>
                                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>{k}</p>
                                  <p className="text-[13px] font-semibold" style={{ color: '#1a1a2e' }}>{v}</p>
                                </div>
                              ))}
                              {p.notes && (
                                <div className="col-span-2 mt-1">
                                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>{L('Histórico / leitura do caso', 'History / case notes', 'Historial / lectura del caso')}</p>
                                  <p className="text-[13px] whitespace-pre-wrap" style={{ color: '#334155' }}>{p.notes}</p>
                                </div>
                              )}
                              <div className="col-span-2">
                                <button onClick={() => excluir(p.id)} className="text-[11px] font-bold" style={{ color: '#dc2626' }}>{L('Excluir apólice', 'Delete policy', 'Eliminar póliza')}</button>
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
              {edit.id ? L('Editar apólice', 'Edit policy', 'Editar póliza') : L('Nova apólice', 'New policy', 'Nueva póliza')}
            </p>

            <div className="grid grid-cols-2 gap-3">
              {([
                ['client_name', L('Cliente *', 'Client *', 'Cliente *'), 'text'], ['policy_number', L('Nº da apólice', 'Policy no.', 'Nº de póliza'), 'text'],
                ['client_phone', L('Telefone', 'Phone', 'Teléfono'), 'text'], ['client_email', L('E-mail', 'Email', 'Correo'), 'email'],
                ['carrier', L('Seguradora', 'Carrier', 'Aseguradora'), 'text'], ['product', L('Produto', 'Product', 'Producto'), 'text'],
              ] as const).map(([campo, label, tipo]) => (
                <div key={campo}>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>{label}</label>
                  <input type={tipo} value={(edit as any)[campo] || ''} onChange={e => setEdit({ ...edit, [campo]: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4' }} />
                </div>
              ))}

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>{L('Prêmio ($)', 'Premium ($)', 'Prima ($)')}</label>
                <input type="number" step="0.01" value={edit.premium_cents ? edit.premium_cents / 100 : ''}
                  onChange={e => setEdit({ ...edit, premium_cents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null })}
                  className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4' }} />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>{L('Cobertura ($)', 'Coverage ($)', 'Cobertura ($)')}</label>
                <input type="number" value={edit.coverage_cents ? edit.coverage_cents / 100 : ''}
                  onChange={e => setEdit({ ...edit, coverage_cents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null })}
                  className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4' }} />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>{L('Situação', 'Status', 'Estado')}</label>
                <select value={edit.status || 'submitted'} onChange={e => setEdit({ ...edit, status: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4' }}>
                  {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>{L('Periodicidade', 'Frequency', 'Periodicidad')}</label>
                <select value={edit.premium_mode || 'monthly'} onChange={e => setEdit({ ...edit, premium_mode: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4' }}>
                  <option value="monthly">{L('Mensal', 'Monthly', 'Mensual')}</option><option value="annual">{L('Anual', 'Annual', 'Anual')}</option>
                </select>
              </div>

              {([
                ['submitted_at', L('Enviada em', 'Submitted on', 'Enviada el')], ['issued_at', L('Emitida em', 'Issued on', 'Emitida el')],
                ['effective_date', L('Vigente desde', 'Effective since', 'Vigente desde')], ['paid_through', L('Pago até', 'Paid through', 'Pagado hasta')],
              ] as const).map(([campo, label]) => (
                <div key={campo}>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>{label}</label>
                  <input type="date" value={(edit as any)[campo] || ''} onChange={e => setEdit({ ...edit, [campo]: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4' }} />
                </div>
              ))}

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>{L('Dívida ($)', 'Amount due ($)', 'Deuda ($)')}</label>
                <input type="number" step="0.01" value={edit.amount_due_cents ? edit.amount_due_cents / 100 : ''}
                  onChange={e => setEdit({ ...edit, amount_due_cents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null })}
                  className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4' }} />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>{L('Prazo do aviso', 'Notice deadline', 'Plazo del aviso')}</label>
                <input type="date" value={edit.due_date || ''} onChange={e => setEdit({ ...edit, due_date: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4' }} />
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#94a3b8' }}>{L('Pendências', 'Pending items', 'Pendientes')}</label>
              <div className="flex gap-1.5 flex-wrap">
                {REQUISITOS_COMUNS(loc).map(r => {
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
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>{L('Ação recomendada (opcional)', 'Recommended action (optional)', 'Acción recomendada (opcional)')}</label>
              <input value={edit.next_action || ''} onChange={e => setEdit({ ...edit, next_action: e.target.value })}
                placeholder={L('Deixe vazio para o sistema sugerir automaticamente', 'Leave empty and the system suggests one automatically', 'Déjalo vacío para que el sistema sugiera automáticamente')}
                className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4' }} />
            </div>
            <div className="mt-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>{L('Histórico / observações', 'History / notes', 'Historial / notas')}</label>
              <textarea value={edit.notes || ''} onChange={e => setEdit({ ...edit, notes: e.target.value })} rows={3}
                className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4' }} />
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setEdit(null)} disabled={salvando}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold" style={{ background: '#f1f5f9', color: '#475569' }}>
                {L('Cancelar', 'Cancel', 'Cancelar')}
              </button>
              <button onClick={salvar} disabled={salvando}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50" style={{ background: '#6366f1' }}>
                {salvando ? L('Salvando…', 'Saving…', 'Guardando…') : L('Salvar apólice', 'Save policy', 'Guardar póliza')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
