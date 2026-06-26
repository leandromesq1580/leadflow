'use client'

import { useState, useEffect } from 'react'

const DOC_TYPES = ['Social', 'ITIN', 'Passaporte']
const HEALTH = ['Diabetes', 'Colesterol', 'Coração', 'Ansiedade/Depressão', 'Câncer', 'Nenhuma das opções', 'Outro']

type FieldType = 'text' | 'email' | 'tel' | 'date' | 'area' | 'radio' | 'checks'
interface Field { k: string; label: string; type?: FieldType; options?: string[]; req?: boolean }

// Formulário genérico de aplicação/cadastro de cliente (seguro de vida) — agnóstico de seguradora.
const FIELDS: Field[] = [
  { k: 'email', label: '01 · Email', type: 'email', req: true },
  { k: 'nome_completo', label: '02 · Nome completo', req: true },
  { k: 'data_nascimento', label: '03 · Data de nascimento', type: 'date', req: true },
  { k: 'endereco', label: '04 · Endereço', req: true },
  { k: 'telefone', label: '05 · Número de telefone', type: 'tel', req: true },
  { k: 'tipo_documento', label: '06 · Tipo de documento', type: 'radio', options: DOC_TYPES, req: true },
  { k: 'documento_id', label: '07 · ID do documento selecionado acima', req: true },
  { k: 'beneficiarios', label: '08 · Beneficiários (nome completo | data nascimento | % da apólice)', type: 'area', req: true },
  { k: 'peso_altura', label: '09 · Peso e altura', req: true },
  { k: 'nome_banco', label: '10 · Nome do banco', req: true },
  { k: 'routing_number', label: '11 · Routing number', req: true },
  { k: 'account_number', label: '12 · Account number', req: true },
  { k: 'problemas_saude', label: '13 · Já teve algum desses problemas?', type: 'checks', options: HEALTH, req: true },
  { k: 'profissao_salario', label: '14 · Profissão e média de salário anual', req: true },
  { k: 'pais_info', label: '15 · Pais (são vivos? que idade têm — ou que idade faleceram?)', req: true },
  { k: 'melhor_dia_pagamento', label: '16 · Caso aprovado, melhor dia do mês p/ pagamento', req: false },
]

interface DocRef { path: string; name: string }
function blank(): Record<string, any> {
  const o: Record<string, any> = { problemas_saude: [], driver_license: null, passport: null }
  for (const f of FIELDS) if (!(f.k in o)) o[f.k] = ''
  return o
}

export function LeadFormsTab({ leadId, buyerId }: { leadId: string; buyerId: string }) {
  const [forms, setForms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [show, setShow] = useState(false)
  const [f, setF] = useState<Record<string, any>>(blank())
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { load() }, [leadId])

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
    if (file.size > MAX) { alert(`Arquivo muito grande (máx ${MAX / 1024 / 1024}MB).`); return }
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
      alert(`Não consegui anexar o documento: ${err?.message || 'erro'}`)
    }
    setUploading(null)
  }

  async function download(path: string) {
    const r = await fetch(`/api/leads/${leadId}/attachments/download?path=${encodeURIComponent(path)}`)
    const d = await r.json()
    if (d.url) window.open(d.url, '_blank')
    else alert('Não consegui gerar o link do documento.')
  }

  async function submit() {
    const missing = FIELDS.filter(x => x.req).filter(x => {
      const v = f[x.k]
      return x.type === 'checks' ? !(Array.isArray(v) && v.length) : !String(v || '').trim()
    })
    if (missing.length) { alert(`Preencha os campos obrigatórios:\n• ${missing.map(m => m.label).join('\n• ')}`); return }
    if (!f.driver_license) { alert('Anexe a Driver\'s License ou ID (obrigatório).'); return }
    setSaving(true)
    try {
      const r = await fetch(`/api/leads/${leadId}/forms`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyer_id: buyerId, data: f }),
      })
      const d = await r.json()
      if (!r.ok) { alert(d.error || 'Erro ao salvar'); setSaving(false); return }
      setF(blank()); setShow(false); await load()
    } catch (err: any) {
      alert(`Erro ao salvar: ${err?.message || 'conexão'}`)
    }
    setSaving(false)
  }

  const lblStyle = { fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5 } as const
  const inStyle = { width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid #e8ecf4', fontSize: 13, color: '#1a1a2e', background: '#fff', outline: 'none' } as const

  function renderField(field: Field) {
    const v = f[field.k]
    if (field.type === 'radio') {
      return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {field.options!.map(opt => (
            <button key={opt} type="button" onClick={() => set(field.k, opt)}
              style={{ padding: '7px 14px', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${v === opt ? '#6366f1' : '#e8ecf4'}`, background: v === opt ? '#eef2ff' : '#fff', color: v === opt ? '#6366f1' : '#64748b' }}>
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
                  border: `1px solid ${on ? '#6366f1' : '#e8ecf4'}`, background: on ? '#eef2ff' : '#fff', color: on ? '#4f46e5' : '#64748b' }}>
                <span style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${on ? '#6366f1' : '#cbd5e1'}`, background: on ? '#6366f1' : '#fff', color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{on ? '✓' : ''}</span>
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

  function docInput(slot: 'driver_license' | 'passport', label: string, req: boolean) {
    const cur: DocRef | null = f[slot]
    return (
      <div>
        <label style={lblStyle}>{label}{req && <span style={{ color: '#ef4444' }}> *</span>}</label>
        {cur ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 10, border: '1px solid #c7d2fe', background: '#f0f4ff' }}>
            <span style={{ fontSize: 13, color: '#4f46e5', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {cur.name}</span>
            <button type="button" onClick={() => set(slot, null)} style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>remover</button>
          </div>
        ) : (
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 10, border: '1px dashed #c7d2fe', background: '#f0f4ff', color: '#6366f1', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            <input type="file" style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={uploading === slot}
              onChange={e => uploadDoc(slot, e.target.files?.[0])} />
            {uploading === slot ? 'Enviando...' : '📎 Anexar documento (PDF ou imagem)'}
          </label>
        )}
      </div>
    )
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Carregando…</div>

  return (
    <div>
      {needsMigration && (
        <div style={{ padding: '10px 13px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 12, marginBottom: 14 }}>
          ⚠️ A tabela <b>lead_forms</b> ainda não foi criada no banco. Histórico e salvamento só funcionam depois de rodar a migration <code>021_lead_forms.sql</code>.
        </div>
      )}

      {!show && (
        <button onClick={() => { setF(blank()); setShow(true) }}
          className="w-full py-4 rounded-xl text-[13px] font-bold mb-5"
          style={{ background: '#f0f4ff', color: '#6366f1', border: '1px dashed #c7d2fe' }}>
          📝 Nova aplicação
        </button>
      )}

      {show && (
        <div style={{ border: '1px solid #e8ecf4', borderRadius: 14, padding: 16, marginBottom: 18, background: '#fafbff' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#1a1a2e', margin: '0 0 14px' }}>Nova aplicação · cadastro do cliente</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {FIELDS.map(field => (
              <div key={field.k}>
                <label style={lblStyle}>{field.label}{field.req && <span style={{ color: '#ef4444' }}> *</span>}</label>
                {renderField(field)}
              </div>
            ))}
            <div style={{ height: 1, background: '#e8ecf4', margin: '2px 0' }} />
            {docInput('driver_license', "Driver's License ou ID", true)}
            {docInput('passport', 'Foto do Passaporte (se não for cidadão)', false)}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button onClick={submit} disabled={saving}
              className="flex-1 py-3 rounded-xl text-[13px] font-bold text-white disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
              {saving ? 'Salvando…' : 'Salvar aplicação'}
            </button>
            <button onClick={() => setShow(false)} disabled={saving}
              className="px-5 py-3 rounded-xl text-[13px] font-bold" style={{ background: '#f1f5f9', color: '#64748b' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Histórico */}
      <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: '#c0c8d4', margin: '4px 0 10px' }}>Histórico de aplicações ({forms.length})</p>
      {forms.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 28 }}>
          <span style={{ fontSize: 30, display: 'block', marginBottom: 6 }}>🗂️</span>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', margin: 0 }}>Nenhuma aplicação ainda</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {forms.map(rec => {
            const data = rec.data || {}
            const open = expanded === rec.id
            return (
              <div key={rec.id} style={{ border: '1px solid #e8ecf4', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
                <button onClick={() => setExpanded(open ? null : rec.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 18 }}>📄</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.nome_completo || 'Aplicação'}</p>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '1px 0 0' }}>{new Date(rec.created_at).toLocaleString('pt-BR')}</p>
                  </div>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{open ? '▲' : '▼'}</span>
                </button>
                {open && (
                  <div style={{ padding: '4px 14px 14px', borderTop: '1px solid #f1f5f9' }}>
                    {FIELDS.map(field => {
                      const val = field.type === 'checks' ? (data[field.k] || []).join(', ') : data[field.k]
                      if (!val) return null
                      return (
                        <div key={field.k} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid #f8fafc' }}>
                          <span style={{ fontSize: 11, color: '#94a3b8', width: 150, flexShrink: 0 }}>{field.label.replace(/^\d+\s·\s/, '')}</span>
                          <span style={{ fontSize: 12, color: '#1a1a2e', fontWeight: 500, whiteSpace: 'pre-wrap' }}>{val}</span>
                        </div>
                      )
                    })}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      {data.driver_license?.path && (
                        <button onClick={() => download(data.driver_license.path)} style={{ fontSize: 11, fontWeight: 700, padding: '7px 12px', borderRadius: 9, background: '#eef2ff', color: '#6366f1', border: 'none', cursor: 'pointer' }}>⬇ Driver's License / ID</button>
                      )}
                      {data.passport?.path && (
                        <button onClick={() => download(data.passport.path)} style={{ fontSize: 11, fontWeight: 700, padding: '7px 12px', borderRadius: 9, background: '#eef2ff', color: '#6366f1', border: 'none', cursor: 'pointer' }}>⬇ Passaporte</button>
                      )}
                      <button onClick={async () => { if (!confirm('Remover esta aplicação do histórico?')) return; await fetch(`/api/leads/${leadId}/forms`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ form_id: rec.id }) }); load() }}
                        style={{ fontSize: 11, fontWeight: 700, padding: '7px 12px', borderRadius: 9, background: '#fef2f2', color: '#ef4444', border: 'none', cursor: 'pointer', marginLeft: 'auto' }}>Excluir</button>
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
