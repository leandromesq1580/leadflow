'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n-client'

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

export function LeadActions() {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [mode, setMode] = useState<'none' | 'manual' | 'import'>('none')
  return (
    <>
      <div className="flex gap-2">
        <button onClick={() => setMode('manual')}
          className="px-4 py-2 rounded-xl text-[12px] font-bold text-white transition-all hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 14px rgba(99,102,241,0.25)' }}>
          {L('+ Adicionar Lead', '+ Add Lead', '+ Agregar Lead')}
        </button>
        <button onClick={() => setMode('import')}
          className="px-4 py-2 rounded-xl text-[12px] font-bold transition-all hover:opacity-90"
          style={{ background: '#eef2ff', color: '#6366f1', border: '1px solid #c7d2fe' }}>
          {L('📂 Importar CSV', '📂 Import CSV', '📂 Importar CSV')}
        </button>
      </div>

      {mode === 'manual' && <ManualLeadModal onClose={() => setMode('none')} />}
      {mode === 'import' && <ImportCsvModal onClose={() => setMode('none')} />}
    </>
  )
}

function ManualLeadModal({ onClose }: { onClose: () => void }) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const router = useRouter()
  const [form, setForm] = useState({ name: '', phone: '', email: '', state: '', city: '', interest: L('Seguro de vida', 'Life insurance', 'Seguro de vida'), notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setError('')
    if (!form.name.trim() || (!form.phone.trim() && !form.email.trim())) {
      setError(L('Nome e (telefone ou email) são obrigatórios.', 'Name and (phone or email) are required.', 'El nombre y (teléfono o email) son obligatorios.'))
      return
    }
    setSaving(true)
    const r = await fetch('/api/leads/manual', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (r.ok) {
      onClose()
      router.refresh()
    } else {
      const d = await r.json()
      setError(d.error || L('Erro ao salvar', 'Error saving', 'Error al guardar'))
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm overflow-y-auto p-6" onClick={onClose}>
      <div className="mx-auto max-w-[520px] rounded-2xl p-6" style={{ background: '#fff' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[18px] font-extrabold" style={{ color: '#1a1a2e' }}>{L('Adicionar Lead', 'Add Lead', 'Agregar Lead')}</h2>
            <p className="text-[12px]" style={{ color: '#94a3b8' }}>{L('Lead será atribuído a você automaticamente', 'The lead will be automatically assigned to you', 'El lead se te asignará automáticamente')}</p>
          </div>
          <button onClick={onClose} className="text-[20px]" style={{ color: '#94a3b8' }}>×</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>{L('Nome *', 'Name *', 'Nombre *')}</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus placeholder={L('João Silva', 'John Smith', 'Juan Pérez')}
              className="w-full mt-1 px-3 py-2.5 rounded-lg text-[13px]" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>{L('Telefone', 'Phone', 'Teléfono')}</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1 407 555-0101"
                className="w-full mt-1 px-3 py-2.5 rounded-lg text-[13px]" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Email</label>
              <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder={L('joao@email.com', 'john@email.com', 'juan@email.com')} type="email"
                className="w-full mt-1 px-3 py-2.5 rounded-lg text-[13px]" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>{L('Estado', 'State', 'Estado')}</label>
              <select value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}
                className="w-full mt-1 px-3 py-2.5 rounded-lg text-[13px]" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
                <option value="">—</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>{L('Cidade', 'City', 'Ciudad')}</label>
              <input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Orlando"
                className="w-full mt-1 px-3 py-2.5 rounded-lg text-[13px]" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>{L('Interesse', 'Interest', 'Interés')}</label>
            <input value={form.interest} onChange={e => setForm({ ...form, interest: e.target.value })}
              className="w-full mt-1 px-3 py-2.5 rounded-lg text-[13px]" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>{L('Notas', 'Notes', 'Notas')}</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder={L('Como chegou, observações...', 'How they came in, notes...', 'Cómo llegó, observaciones...')}
              className="w-full mt-1 px-3 py-2.5 rounded-lg text-[13px] resize-none" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
          </div>
        </div>

        {error && <p className="text-[12px] mt-3 px-3 py-2 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>⚠️ {error}</p>}

        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-semibold" style={{ color: '#64748b' }}>{L('Cancelar', 'Cancel', 'Cancelar')}</button>
          <button onClick={save} disabled={saving || !form.name.trim()}
            className="px-6 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            {saving ? L('Salvando...', 'Saving...', 'Guardando...') : L('Adicionar', 'Add', 'Agregar')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ImportCsvModal({ onClose }: { onClose: () => void }) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<any[]>([])
  const [rawText, setRawText] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number; invalid: any[] } | null>(null)
  const [error, setError] = useState('')

  function parseCsv(text: string): any[] {
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length === 0) return []
    const header = lines[0].split(/[,;\t]/).map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''))
    const rows: any[] = []
    // Map header variants
    const colMap: Record<string, string> = {
      'name': 'name', 'nome': 'name', 'full_name': 'name', 'fullname': 'name',
      'phone': 'phone', 'telefone': 'phone', 'whatsapp': 'phone', 'celular': 'phone', 'fone': 'phone',
      'email': 'email', 'e-mail': 'email',
      'state': 'state', 'estado': 'state', 'uf': 'state',
      'city': 'city', 'cidade': 'city',
      'interest': 'interest', 'interesse': 'interest',
      'notes': 'notes', 'notas': 'notes', 'observacao': 'notes', 'obs': 'notes',
    }
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].match(/("([^"]|"")*"|[^,;\t]*)(?:[,;\t]|$)/g)?.map(v => v.replace(/[,;\t]$/, '').trim().replace(/^"|"$/g, '').replace(/""/g, '"')) || []
      const row: any = {}
      header.forEach((h, idx) => {
        const mapped = colMap[h]
        if (mapped) row[mapped] = (values[idx] || '').trim()
      })
      if (row.name || row.phone || row.email) rows.push(row)
    }
    return rows
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError(L('Arquivo muito grande (max 5MB)', 'File too large (max 5MB)', 'Archivo demasiado grande (máx. 5MB)')); return }
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      setRawText(text)
      const rows = parseCsv(text)
      setParsed(rows)
      setError('')
    }
    reader.readAsText(file)
  }

  async function submit() {
    if (parsed.length === 0) return
    setImporting(true)
    setError('')
    const r = await fetch('/api/leads/import-csv', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leads: parsed }),
    })
    setImporting(false)
    const d = await r.json()
    if (!r.ok) { setError(d.error || L('Erro ao importar', 'Error importing', 'Error al importar')); return }
    setResult(d)
    setTimeout(() => router.refresh(), 1000)
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm overflow-y-auto p-6" onClick={onClose}>
      <div className="mx-auto max-w-[680px] rounded-2xl p-6" style={{ background: '#fff' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[18px] font-extrabold" style={{ color: '#1a1a2e' }}>{L('Importar CSV', 'Import CSV', 'Importar CSV')}</h2>
            <p className="text-[12px]" style={{ color: '#94a3b8' }}>{L('Todos os leads serão atribuídos a você', 'All leads will be assigned to you', 'Todos los leads se te asignarán')}</p>
          </div>
          <button onClick={onClose} className="text-[20px]" style={{ color: '#94a3b8' }}>×</button>
        </div>

        {!result && (
          <>
            <div className="rounded-lg p-3 mb-4" style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}>
              <p className="text-[12px] font-bold mb-1" style={{ color: '#0c4a6e' }}>{L('Formato do CSV', 'CSV format', 'Formato del CSV')}</p>
              <p className="text-[11px]" style={{ color: '#0369a1' }}>
                {L('Colunas reconhecidas:', 'Recognized columns:', 'Columnas reconocidas:')} <code>name</code>, <code>phone</code>, <code>email</code>, <code>state</code>, <code>city</code>, <code>interest</code>, <code>notes</code>
                <br/>{L('Aceita também:', 'Also accepts:', 'También acepta:')} nome, telefone, whatsapp, estado, cidade, interesse, obs
                <br/>{L('Separadores aceitos: vírgula, ponto-e-vírgula ou tab', 'Accepted separators: comma, semicolon, or tab', 'Separadores aceptados: coma, punto y coma o tabulador')}
              </p>
              <a href="/modelo-importacao-leads.csv" download
                className="inline-flex items-center gap-1.5 mt-2.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all hover:brightness-95"
                style={{ background: '#0369a1', color: '#fff' }}>
                {L('📥 Baixar modelo de planilha (CSV)', '📥 Download spreadsheet template (CSV)', '📥 Descargar plantilla de hoja de cálculo (CSV)')}
              </a>
            </div>

            <div className="mb-4">
              <button onClick={() => fileRef.current?.click()}
                className="w-full py-8 rounded-xl text-[13px] font-bold transition-all hover:border-indigo-400"
                style={{ background: '#f8f9fc', color: '#6366f1', border: '2px dashed #c7d2fe' }}>
                {L('📂 Clique para selecionar arquivo CSV', '📂 Click to select a CSV file', '📂 Haz clic para seleccionar el archivo CSV')}
              </button>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
            </div>

            {parsed.length > 0 && (
              <div className="mb-4">
                <p className="text-[12px] font-bold mb-2" style={{ color: '#1a1a2e' }}>
                  ✅ {parsed.length} {L('leads detectados — preview (primeiros 5):', 'leads detected — preview (first 5):', 'leads detectados — vista previa (primeros 5):')}
                </p>
                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #e8ecf4' }}>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr style={{ background: '#f8f9fc' }}>
                        <th className="px-2 py-2 text-left font-bold">{L('Nome', 'Name', 'Nombre')}</th>
                        <th className="px-2 py-2 text-left font-bold">{L('Telefone', 'Phone', 'Teléfono')}</th>
                        <th className="px-2 py-2 text-left font-bold">Email</th>
                        <th className="px-2 py-2 text-left font-bold">{L('Estado', 'State', 'Estado')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.slice(0, 5).map((row, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td className="px-2 py-1.5" style={{ color: '#1a1a2e' }}>{row.name}</td>
                          <td className="px-2 py-1.5" style={{ color: '#64748b' }}>{row.phone}</td>
                          <td className="px-2 py-1.5" style={{ color: '#64748b' }}>{row.email}</td>
                          <td className="px-2 py-1.5" style={{ color: '#64748b' }}>{row.state}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {error && <p className="text-[12px] mb-3 px-3 py-2 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>⚠️ {error}</p>}

            <div className="flex justify-end gap-3">
              <button onClick={onClose} className="px-4 py-2 text-[13px] font-semibold" style={{ color: '#64748b' }}>{L('Cancelar', 'Cancel', 'Cancelar')}</button>
              <button onClick={submit} disabled={importing || parsed.length === 0}
                className="px-6 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                {importing ? L('Importando...', 'Importing...', 'Importando...') : L(`Importar ${parsed.length} leads`, `Import ${parsed.length} leads`, `Importar ${parsed.length} leads`)}
              </button>
            </div>
          </>
        )}

        {result && (
          <div>
            <div className="rounded-xl p-5 mb-4 text-center" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
              <p className="text-[32px] mb-2">✅</p>
              <p className="text-[16px] font-extrabold" style={{ color: '#065f46' }}>
                {result.imported} {L('leads importados!', 'leads imported!', 'leads importados!')}
              </p>
              {result.skipped > 0 && (
                <p className="text-[12px] mt-1" style={{ color: '#047857' }}>
                  {result.skipped} {L('linhas ignoradas (dados inválidos)', 'rows skipped (invalid data)', 'filas ignoradas (datos inválidos)')}
                </p>
              )}
            </div>
            {result.invalid && result.invalid.length > 0 && (
              <div className="rounded-lg p-3 mb-4 text-[11px]" style={{ background: '#fef3c7', color: '#92400e' }}>
                <b>{L('Linhas ignoradas:', 'Skipped rows:', 'Filas ignoradas:')}</b>
                {result.invalid.map((v: any, i: number) => <div key={i}>{L('Linha', 'Row', 'Fila')} {v.row}: {v.reason}</div>)}
              </div>
            )}
            <button onClick={onClose}
              className="w-full py-3 rounded-xl text-[13px] font-bold text-white"
              style={{ background: '#6366f1' }}>
              {L('Fechar', 'Close', 'Cerrar')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
