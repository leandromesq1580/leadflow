'use client'

import { useState, useEffect, useRef } from 'react'
import { useT } from '@/lib/i18n-client'

type Lfn = (pt: string, en: string, es: string) => string

const DOC_TYPES = (L: Lfn) => ['Social', 'ITIN', L('Passaporte', 'Passport', 'Pasaporte')]
const HEALTH = (L: Lfn) => [
  'Diabetes',
  L('Colesterol', 'Cholesterol', 'Colesterol'),
  L('Coração', 'Heart', 'Corazón'),
  L('Ansiedade/Depressão', 'Anxiety/Depression', 'Ansiedad/Depresión'),
  L('Câncer', 'Cancer', 'Cáncer'),
  L('Nenhuma das opções', 'None of the above', 'Ninguna de las anteriores'),
  L('Outro', 'Other', 'Otro'),
]

type FieldType = 'text' | 'email' | 'tel' | 'date' | 'area' | 'radio' | 'checks'
interface Field { k: string; label: string; type?: FieldType; options?: string[]; req?: boolean }

// Formulário genérico de aplicação/cadastro de cliente (seguro de vida) — agnóstico de seguradora.
const FIELDS = (L: Lfn): Field[] => [
  { k: 'email', label: L('01 · E-mail', '01 · Email', '01 · Correo electrónico'), type: 'email', req: true },
  { k: 'nome_completo', label: L('02 · Nome completo', '02 · Full name', '02 · Nombre completo'), req: true },
  { k: 'data_nascimento', label: L('03 · Data de nascimento', '03 · Date of birth', '03 · Fecha de nacimiento'), type: 'date', req: true },
  { k: 'endereco', label: L('04 · Endereço', '04 · Address', '04 · Dirección'), req: true },
  { k: 'telefone', label: L('05 · Número de telefone', '05 · Phone number', '05 · Número de teléfono'), type: 'tel', req: true },
  { k: 'tipo_documento', label: L('06 · Tipo de documento', '06 · Document type', '06 · Tipo de documento'), type: 'radio', options: DOC_TYPES(L), req: true },
  { k: 'documento_id', label: L('07 · ID do documento selecionado acima', '07 · ID number of the document selected above', '07 · ID del documento seleccionado arriba'), req: true },
  { k: 'beneficiarios', label: L('08 · Beneficiários (nome completo | data nascimento | % da apólice)', '08 · Beneficiaries (full name | date of birth | % of policy)', '08 · Beneficiarios (nombre completo | fecha de nacimiento | % de la póliza)'), type: 'area', req: true },
  { k: 'peso_altura', label: L('09 · Peso e altura', '09 · Weight and height', '09 · Peso y estatura'), req: true },
  { k: 'nome_banco', label: L('10 · Nome do banco', '10 · Bank name', '10 · Nombre del banco'), req: true },
  { k: 'routing_number', label: L('11 · Número de roteamento bancário', '11 · Routing number', '11 · Número de ruta bancaria'), req: true },
  { k: 'account_number', label: L('12 · Número da conta', '12 · Account number', '12 · Número de cuenta'), req: true },
  { k: 'problemas_saude', label: L('13 · Já teve algum desses problemas?', '13 · Have you ever had any of these conditions?', '13 · ¿Ha tenido alguno de estos problemas?'), type: 'checks', options: HEALTH(L), req: true },
  { k: 'profissao_salario', label: L('14 · Profissão e média de salário anual', '14 · Occupation and average annual income', '14 · Profesión y salario anual promedio'), req: true },
  { k: 'pais_info', label: L('15 · Pais (são vivos? que idade têm — ou que idade faleceram?)', '15 · Parents (are they living? how old are they — or at what age did they pass away?)', '15 · Padres (¿viven? ¿qué edad tienen — o a qué edad fallecieron?)'), req: true },
  { k: 'melhor_dia_pagamento', label: L('16 · Caso aprovado, melhor dia do mês p/ pagamento', '16 · If approved, best day of the month for payment', '16 · Si es aprobado, mejor día del mes para el pago'), req: false },
  { k: 'medico', label: L('17 · Médico (nome, endereço, telefone e última vez que foi)', '17 · Doctor (name, address, phone and last visit)', '17 · Médico (nombre, dirección, teléfono y última visita)'), type: 'area' },
  { k: 'motivo_consulta', label: L('18 · Motivo da consulta', '18 · Reason for the visit', '18 · Motivo de la consulta'), type: 'area' },
  { k: 'remedio', label: L('19 · Toma remédio? Qual e pra quê?', '19 · Do you take any medication? Which one and what for?', '19 · ¿Toma algún medicamento? ¿Cuál y para qué?'), type: 'area' },
  { k: 'empresa', label: L('20 · Empresa onde trabalha', '20 · Company where you work', '20 · Empresa donde trabaja') },
  { k: 'tempo_trabalho', label: L('21 · Há quanto tempo trabalha lá', '21 · How long have you worked there', '21 · Cuánto tiempo lleva trabajando allí') },
  { k: 'contatos_emergencia', label: L('22 · 3 contatos de emergência (nome + telefone — que NÃO morem na mesma casa)', '22 · 3 emergency contacts (name + phone — who do NOT live in the same household)', '22 · 3 contactos de emergencia (nombre + teléfono — que NO vivan en la misma casa)'), type: 'area' },
]

// Instância estrutural (usa só k/type) pras funções de módulo — os labels daqui nunca aparecem na tela.
const FIELDS_BASE = FIELDS((pt) => pt)

interface DocRef { path: string; name: string }
function blank(): Record<string, any> {
  const o: Record<string, any> = { problemas_saude: [], driver_license: null, passport: null }
  for (const f of FIELDS_BASE) if (!(f.k in o)) o[f.k] = ''
  return o
}

/** Tem alguma coisa preenchida? (usado pra decidir se vale guardar/descartar) */
function temConteudo(o: Record<string, any>): boolean {
  return FIELDS_BASE.some(x => {
    const v = o[x.k]
    return x.type === 'checks' ? (Array.isArray(v) && v.length > 0) : !!String(v || '').trim()
  }) || !!o.driver_license || !!o.passport
}

/**
 * RASCUNHO NO APARELHO (bug relatado em 03/08/2026).
 *
 * O corretor começava a aplicação, saía pra buscar um dado e voltava com tudo em
 * branco. Eram três buracos: (1) trocar de aba dentro do lead DESMONTA esta tela —
 * o modal renderiza a aba por condição, não esconde; (2) voltar de outra aba do
 * navegador dispara de uma vez os polls que estavam congelados, e a árvore inteira
 * reconcilia; (3) fechar o modal (ou o deploy trocar a versão da página) leva tudo.
 * Em todos, o useState morria em silêncio e as 22 respostas iam junto.
 *
 * Agora o que está sendo digitado é gravado NO APARELHO a cada pausa e devolvido ao
 * voltar. Só some quando a aplicação é salva ou quando o próprio corretor descarta.
 * Um rascunho por lead; expira em 30 dias pra não virar lixo eterno.
 */
const RASCUNHO_VALIDADE = 30 * 24 * 60 * 60 * 1000
const chaveRascunho = (leadId: string) => `l4p_form_draft:${leadId}`

export function LeadFormsTab({ leadId, buyerId }: { leadId: string; buyerId: string }) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const dateLocale = t._locale === 'en' ? 'en-US' : t._locale === 'es' ? 'es-US' : 'pt-BR'
  const fields = FIELDS(L)
  const [forms, setForms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [show, setShow] = useState(false)
  const [f, setF] = useState<Record<string, any>>(blank())
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [rascunhoEm, setRascunhoEm] = useState<number | null>(null)
  /** Segura o gravador até o rascunho ser restaurado (senão o estado em branco do
   *  primeiro render apagaria o que estava guardado). Também protege a troca de lead. */
  const pularGravacao = useRef(true)
  const timerRascunho = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerServidor = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { load() }, [leadId])

  // Devolve o rascunho ao montar. Leitura só aqui dentro (nunca no initializer do
  // useState) — no initializer o servidor renderiza diferente do navegador e quebra.
  useEffect(() => {
    pularGravacao.current = true
    let tsLocal = 0
    try {
      const cru = localStorage.getItem(chaveRascunho(leadId))
      if (cru) {
        const d = JSON.parse(cru)
        if (d?.f && Date.now() - (d.ts || 0) < RASCUNHO_VALIDADE) {
          setF({ ...blank(), ...d.f })
          if (d.show) setShow(true)
          setRascunhoEm(d.ts || null)
          tsLocal = d.ts || 0
        } else {
          localStorage.removeItem(chaveRascunho(leadId))   // velho demais: não ressuscita
        }
      }
    } catch { /* storage bloqueado (Safari privado) — segue sem rascunho */ }
    const t = setTimeout(() => { pularGravacao.current = false }, 0)

    // Rascunho do SERVIDOR (14/08): começou no computador, continua no celular —
    // e o "Ver como" enxerga. O mais NOVO vence (local vs servidor por timestamp).
    let vivo = true
    fetch(`/api/leads/${leadId}/form-draft`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!vivo) return
        const srv = d?.draft?.data as { ts?: number; show?: boolean; f?: Record<string, any> } | undefined
        if (srv?.f && (srv.ts || 0) > tsLocal && Date.now() - (srv.ts || 0) < RASCUNHO_VALIDADE) {
          pularGravacao.current = true
          setF({ ...blank(), ...srv.f })
          if (srv.show) setShow(true)
          setRascunhoEm(srv.ts || null)
          setTimeout(() => { pularGravacao.current = false }, 0)
        }
      })
      .catch(() => {})
    return () => { vivo = false; clearTimeout(t) }
  }, [leadId])

  // Guarda a cada pausa de meio segundo. Nada digitado, nada guardado — e apagar tudo
  // apaga o rascunho junto (senão o texto que ele acabou de tirar voltaria depois).
  useEffect(() => {
    if (pularGravacao.current) return
    if (timerRascunho.current) clearTimeout(timerRascunho.current)
    if (!temConteudo(f)) {
      try { localStorage.removeItem(chaveRascunho(leadId)) } catch {}
      if (rascunhoEm) {
        setRascunhoEm(null)
        // apagou tudo de propósito → o espelho do servidor morre junto
        fetch(`/api/leads/${leadId}/form-draft`, { method: 'DELETE' }).catch(() => {})
      }
      return
    }
    timerRascunho.current = setTimeout(() => {
      const ts = Date.now()
      try {
        localStorage.setItem(chaveRascunho(leadId), JSON.stringify({ v: 1, ts, show, f }))
        setRascunhoEm(ts)
      } catch { /* sem storage: o formulário continua funcionando, só não sobrevive */ }
      // espelho no servidor, com pausa maior (não vale um PUT por tecla)
      if (timerServidor.current) clearTimeout(timerServidor.current)
      timerServidor.current = setTimeout(() => {
        fetch(`/api/leads/${leadId}/form-draft`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ buyer_id: buyerId, data: { v: 1, ts, show, f } }),
        }).catch(() => {})
      }, 1500)
    }, 500)
    return () => { if (timerRascunho.current) clearTimeout(timerRascunho.current) }
  }, [f, show, leadId, rascunhoEm])

  function descartarRascunho() {
    if (timerRascunho.current) clearTimeout(timerRascunho.current)
    if (timerServidor.current) clearTimeout(timerServidor.current)
    try { localStorage.removeItem(chaveRascunho(leadId)) } catch {}
    fetch(`/api/leads/${leadId}/form-draft`, { method: 'DELETE' }).catch(() => {})
    setRascunhoEm(null)
  }

  async function load() {
    setLoading(true)
    try {
      const r = await fetch(`/api/leads/${leadId}/forms`)
      const d = await r.json()
      setForms(d.forms || [])
      setNeedsMigration(!!d.needsMigration)
    } catch { /* noop */ }
    setLoading(false)
  }

  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }))
  const toggleHealth = (opt: string) => setF(p => {
    const cur: string[] = p.problemas_saude || []
    return { ...p, problemas_saude: cur.includes(opt) ? cur.filter(x => x !== opt) : [...cur, opt] }
  })

  async function uploadDoc(slot: 'driver_license' | 'passport', file: File | undefined) {
    if (!file) return
    const MAX = 30 * 1024 * 1024
    if (file.size > MAX) { alert(L(`Arquivo muito grande (máx ${MAX / 1024 / 1024}MB).`, `File too large (max ${MAX / 1024 / 1024}MB).`, `Archivo demasiado grande (máx. ${MAX / 1024 / 1024}MB).`)); return }
    setUploading(slot)
    try {
      const u = await fetch(`/api/leads/${leadId}/attachments/upload-url`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: file.name, file_size: file.size, buyer_id: buyerId }),
      })
      const ud = await u.json()
      if (!u.ok || !ud.signedUrl) throw new Error(ud.error || 'upload url')
      const up = await fetch(ud.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file })
      if (!up.ok) throw new Error(`PUT ${up.status}`)
      await fetch(`/api/leads/${leadId}/attachments/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyer_id: buyerId, file_name: file.name, file_path: ud.path, file_size: file.size, file_type: file.type }),
      })
      set(slot, { path: ud.path, name: file.name } as DocRef)
    } catch (err: any) {
      alert(L(`Não consegui anexar o documento: ${err?.message || 'erro'}`, `Couldn't attach the document: ${err?.message || 'error'}`, `No pude adjuntar el documento: ${err?.message || 'error'}`))
    }
    setUploading(null)
  }

  async function download(path: string) {
    const r = await fetch(`/api/leads/${leadId}/attachments/download?path=${encodeURIComponent(path)}`)
    const d = await r.json()
    if (d.url) window.open(d.url, '_blank')
    else alert(L('Não consegui gerar o link do documento.', "Couldn't generate the document link.", 'No pude generar el enlace del documento.'))
  }

  async function submit() {
    if (!temConteudo(f)) { alert(L('Preencha ao menos um campo antes de salvar.', 'Fill in at least one field before saving.', 'Complete al menos un campo antes de guardar.')); return }
    setSaving(true)
    try {
      const r = await fetch(`/api/leads/${leadId}/forms`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyer_id: buyerId, data: f }),
      })
      const d = await r.json()
      if (!r.ok) { alert(d.error || L('Erro ao salvar', 'Error saving', 'Error al guardar')); setSaving(false); return }
      descartarRascunho()          // salvo no servidor: o rascunho local não serve mais
      setF(blank()); setShow(false); await load()
    } catch (err: any) {
      alert(L(`Erro ao salvar: ${err?.message || 'conexão'}`, `Error saving: ${err?.message || 'connection'}`, `Error al guardar: ${err?.message || 'conexión'}`))
    }
    setSaving(false)
  }

  const lblStyle = { fontSize: 11, fontWeight: 700, color: 'var(--fg-secondary)', display: 'block', marginBottom: 5 } as const
  const inStyle = { width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, color: 'var(--fg)', background: 'var(--bg-card)', outline: 'none' } as const

  function renderField(field: Field) {
    const v = f[field.k]
    if (field.type === 'radio') {
      return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {field.options!.map(opt => (
            <button key={opt} type="button" onClick={() => set(field.k, opt)}
              style={{ padding: '7px 14px', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${v === opt ? 'var(--accent)' : 'var(--border)'}`, background: v === opt ? 'var(--accent-light)' : 'var(--bg-card)', color: v === opt ? 'var(--accent)' : '#64748b' }}>
              {opt}
            </button>
          ))}
        </div>
      )
    }
    if (field.type === 'checks') {
      const arr: string[] = v || []
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {field.options!.map(opt => {
            const on = arr.includes(opt)
            return (
              <button key={opt} type="button" onClick={() => toggleHealth(opt)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-light)' : 'var(--bg-card)', color: on ? '#6d28d9' : '#64748b' }}>
                <span style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${on ? 'var(--accent)' : '#cbd5e1'}`, background: on ? 'var(--accent)' : 'var(--bg-card)', color: 'var(--bg-card)', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{on ? '✓' : ''}</span>
                {opt}
              </button>
            )
          })}
        </div>
      )
    }
    if (field.type === 'area') {
      return <textarea value={v || ''} onChange={e => set(field.k, e.target.value)} rows={3} style={{ ...inStyle, resize: 'vertical' }} />
    }
    return <input type={field.type || 'text'} value={v || ''} onChange={e => set(field.k, e.target.value)} style={inStyle} />
  }

  function docInput(slot: 'driver_license' | 'passport', label: string) {
    const cur: DocRef | null = f[slot]
    return (
      <div>
        <label style={lblStyle}>{label}</label>
        {cur ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 10, border: '1px solid rgba(139,92,246,0.35)', background: '#f0f4ff' }}>
            <span style={{ fontSize: 13, color: '#6d28d9', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {cur.name}</span>
            <button type="button" onClick={() => set(slot, null)} style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>{L('remover', 'remove', 'quitar')}</button>
          </div>
        ) : (
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 10, border: '1px dashed rgba(139,92,246,0.35)', background: '#f0f4ff', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            <input type="file" style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={uploading === slot}
              onChange={e => uploadDoc(slot, e.target.files?.[0])} />
            {uploading === slot ? L('Enviando...', 'Uploading...', 'Subiendo...') : L('📎 Anexar documento (PDF ou imagem)', '📎 Attach document (PDF or image)', '📎 Adjuntar documento (PDF o imagen)')}
          </label>
        )}
      </div>
    )
  }

  // Só a tela toda espera. Com o formulário aberto, recarregar o histórico não pode
  // desmontar o que está sendo digitado.
  if (loading && !show) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--fg-muted)', fontSize: 13 }}>{L('Carregando…', 'Loading…', 'Cargando…')}</div>

  return (
    <div>
      {needsMigration && (
        <div style={{ padding: '10px 13px', borderRadius: 10, background: 'var(--warn-soft)', border: '1px solid #fde68a', color: '#92400e', fontSize: 12, marginBottom: 14 }}>
          ⚠️ {L('A tabela', 'Table', 'La tabla')} <b>lead_forms</b> {L('ainda não foi criada no banco. Histórico e salvamento só funcionam depois de rodar a migration', "hasn't been created in the database yet. History and saving only work after running migration", 'aún no se creó en la base de datos. El historial y el guardado solo funcionan después de ejecutar la migración')} <code>021_lead_forms.sql</code>.
        </div>
      )}

      {!show && (
        <button onClick={() => { if (!temConteudo(f)) setF(blank()); setShow(true) }}
          className="w-full py-4 rounded-xl text-[13px] font-bold mb-5"
          style={{ background: '#f0f4ff', color: 'var(--accent)', border: '1px dashed rgba(139,92,246,0.35)' }}>
          {L('📝 Nova aplicação', '📝 New application', '📝 Nueva aplicación')}
        </button>
      )}

      {show && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 18, background: '#fafbff' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', margin: '0 0 14px' }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--fg)', margin: 0 }}>{L('Nova aplicação · cadastro do cliente', 'New application · client intake', 'Nueva aplicación · registro del cliente')}</p>
            {rascunhoEm && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#059669' }}>
                ✓ {L('Rascunho guardado', 'Draft saved', 'Borrador guardado')} {new Date(rascunhoEm).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })} — {L('pode sair e voltar', 'you can leave and come back', 'puede salir y volver')}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {fields.map(field => (
              <div key={field.k}>
                <label style={lblStyle}>{field.label}</label>
                {renderField(field)}
              </div>
            ))}
            <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
            {docInput('driver_license', L("Driver's License ou ID", "Driver's License or ID", "Driver's License o ID"))}
            {docInput('passport', L('Foto do Passaporte (se não for cidadão)', 'Passport photo (if not a citizen)', 'Foto del pasaporte (si no es ciudadano)'))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button onClick={submit} disabled={saving}
              className="flex-1 py-3 rounded-xl text-[13px] font-bold text-white disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,var(--accent),#8b5cf6)' }}>
              {saving ? L('Salvando…', 'Saving…', 'Guardando…') : L('Salvar aplicação', 'Save application', 'Guardar aplicación')}
            </button>
            <button onClick={() => {
              if (temConteudo(f) && !confirm(L('Descartar o que você preencheu? O rascunho será apagado.', 'Discard what you filled in? The draft will be deleted.', '¿Descartar lo que llenó? El borrador se eliminará.'))) return
              descartarRascunho(); setF(blank()); setShow(false)
            }} disabled={saving}
              className="px-5 py-3 rounded-xl text-[13px] font-bold" style={{ background: 'var(--bg-soft)', color: 'var(--fg-secondary)' }}>
              {L('Cancelar', 'Cancel', 'Cancelar')}
            </button>
          </div>
        </div>
      )}

      {/* Histórico */}
      <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: '#c0c8d4', margin: '4px 0 10px' }}>{L('Histórico de aplicações', 'Application history', 'Historial de aplicaciones')} ({forms.length})</p>
      {forms.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 28 }}>
          <span style={{ fontSize: 30, display: 'block', marginBottom: 6 }}>🗂️</span>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-muted)', margin: 0 }}>{L('Nenhuma aplicação ainda', 'No applications yet', 'Aún no hay aplicaciones')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {forms.map(rec => {
            const data = rec.data || {}
            const open = expanded === rec.id
            return (
              <div key={rec.id} style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
                <button onClick={() => setExpanded(open ? null : rec.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 18 }}>📄</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.nome_completo || L('Aplicação', 'Application', 'Aplicación')}</p>
                    <p style={{ fontSize: 11, color: 'var(--fg-muted)', margin: '1px 0 0' }}>{new Date(rec.created_at).toLocaleString(dateLocale)}</p>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{open ? '▲' : '▼'}</span>
                </button>
                {open && (
                  <div style={{ padding: '4px 14px 14px', borderTop: '1px solid var(--bg-soft)' }}>
                    {fields.map(field => {
                      const val = field.type === 'checks' ? (data[field.k] || []).join(', ') : data[field.k]
                      if (!val) return null
                      return (
                        <div key={field.k} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid #f8fafc' }}>
                          <span style={{ fontSize: 11, color: 'var(--fg-muted)', width: 150, flexShrink: 0 }}>{field.label.replace(/^\d+\s·\s/, '')}</span>
                          <span style={{ fontSize: 12, color: 'var(--fg)', fontWeight: 500, whiteSpace: 'pre-wrap' }}>{val}</span>
                        </div>
                      )
                    })}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      {data.driver_license?.path && (
                        <button onClick={() => download(data.driver_license.path)} style={{ fontSize: 11, fontWeight: 700, padding: '7px 12px', borderRadius: 9, background: 'var(--accent-light)', color: 'var(--accent)', border: 'none', cursor: 'pointer' }}>⬇ {L('Carteira de motorista / documento', "Driver's license / ID", 'Licencia de conducir / identificación')}</button>
                      )}
                      {data.passport?.path && (
                        <button onClick={() => download(data.passport.path)} style={{ fontSize: 11, fontWeight: 700, padding: '7px 12px', borderRadius: 9, background: 'var(--accent-light)', color: 'var(--accent)', border: 'none', cursor: 'pointer' }}>⬇ {L('Passaporte', 'Passport', 'Pasaporte')}</button>
                      )}
                      <button onClick={async () => { if (!confirm(L('Remover esta aplicação do histórico?', 'Remove this application from history?', '¿Quitar esta aplicación del historial?'))) return; await fetch(`/api/leads/${leadId}/forms`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ form_id: rec.id }) }); load() }}
                        style={{ fontSize: 11, fontWeight: 700, padding: '7px 12px', borderRadius: 9, background: 'var(--err-soft)', color: '#ef4444', border: 'none', cursor: 'pointer', marginLeft: 'auto' }}>{L('Excluir', 'Delete', 'Eliminar')}</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
