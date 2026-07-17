'use client'

import { useState } from 'react'
import { MIcon } from './icons'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
]

export interface NewLead { id: string; name: string; phone: string; city: string; state: string; status: string; interest: string; type: string; created_at: string; assigned_to_member?: string | null }

/**
 * Sheet de cadastro manual de lead no app (paridade com o ManualLeadModal do dashboard).
 * O /api/leads/manual auto-atribui ao buyer logado, infere o estado pelo DDD quando
 * vazio e ja joga o lead no primeiro estagio do pipeline default.
 */
export function NewLeadSheet({ locale, onClose, onCreated }: {
  locale?: string
  onClose: () => void
  onCreated: (lead: NewLead) => void
}) {
  const L = (pt: string, en: string, es: string) => (locale === 'en' ? en : locale === 'es' ? es : pt)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [interest, setInterest] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Mesma regra do backend: nome + (telefone OU email)
  const valid = name.trim().length > 0 && (phone.trim().length > 0 || email.trim().length > 0)

  async function save() {
    if (busy || !valid) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/leads/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, email, city, state, interest, notes }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.lead) {
        setErr(j.error || L('Não consegui salvar.', "Couldn't save.", 'No pude guardar.'))
        setBusy(false)
        return
      }
      onCreated(j.lead)
      onClose()
    } catch {
      setErr(L('Erro de conexão.', 'Connection error.', 'Error de conexión.'))
      setBusy(false)
    }
  }

  const label: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: 'var(--m-faint)', margin: '0 0 5px', display: 'block' }
  const field: React.CSSProperties = { marginBottom: 12 }

  return (
    <div className="m-sheet-ov" onClick={onClose}>
      <div className="m-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '88vh', paddingBottom: 'calc(var(--m-nav-h) + env(safe-area-inset-bottom) + 20px)' }}>
        <div className="m-sheet-grab" />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px 14px' }}>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 800, flex: 1 }}>{L('Novo lead', 'New lead', 'Nuevo lead')}</p>
          <button onClick={onClose} className="m-tap" style={{ background: 'none', border: 'none', color: 'var(--m-faint)', display: 'flex', cursor: 'pointer', padding: 4 }}>
            <MIcon name="x" size={20} />
          </button>
        </div>

        <div style={{ padding: '0 20px' }}>
          <div style={field}>
            <label style={label}>{L('NOME', 'NAME', 'NOMBRE')} *</label>
            <input className="m-input" value={name} onChange={e => setName(e.target.value)} autoFocus
              placeholder={L('Nome do lead', 'Lead name', 'Nombre del lead')} />
          </div>

          <div style={field}>
            <label style={label}>{L('TELEFONE', 'PHONE', 'TELÉFONO')}</label>
            <input className="m-input" value={phone} onChange={e => setPhone(e.target.value)}
              type="tel" inputMode="tel" placeholder="(555) 123-4567" />
          </div>

          <div style={field}>
            <label style={label}>{L('E-MAIL', 'EMAIL', 'E-MAIL')}</label>
            <input className="m-input" value={email} onChange={e => setEmail(e.target.value)}
              type="email" inputMode="email" autoCapitalize="none" placeholder="lead@email.com" />
          </div>

          <p className="m-faint" style={{ fontSize: 11, margin: '-4px 0 12px' }}>
            {L('Informe telefone ou e-mail.', 'Provide phone or email.', 'Indica teléfono o e-mail.')}
          </p>

          <div style={{ display: 'flex', gap: 10, ...field }}>
            <div style={{ flex: 1 }}>
              <label style={label}>{L('CIDADE', 'CITY', 'CIUDAD')}</label>
              <input className="m-input" value={city} onChange={e => setCity(e.target.value)} placeholder="Orlando" />
            </div>
            <div style={{ width: 108 }}>
              <label style={label}>{L('ESTADO', 'STATE', 'ESTADO')}</label>
              <select className="m-input" value={state} onChange={e => setState(e.target.value)} style={{ appearance: 'none' }}>
                <option value="">{L('Auto', 'Auto', 'Auto')}</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div style={field}>
            <label style={label}>{L('INTERESSE', 'INTEREST', 'INTERÉS')}</label>
            <input className="m-input" value={interest} onChange={e => setInterest(e.target.value)}
              placeholder={L('Seguro de vida', 'Life insurance', 'Seguro de vida')} />
          </div>

          <div style={field}>
            <label style={label}>{L('NOTAS', 'NOTES', 'NOTAS')}</label>
            <textarea className="m-input" value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              style={{ height: 'auto', padding: '11px 14px', resize: 'none', lineHeight: 1.45 }}
              placeholder={L('Onde conheceu, contexto...', 'Where you met, context...', 'Dónde lo conociste...')} />
          </div>

          {err && (
            <p style={{ fontSize: 12.5, color: '#f87171', margin: '0 0 12px', textAlign: 'center' }}>{err}</p>
          )}

          <button onClick={save} disabled={!valid || busy} className="m-tap"
            style={{
              width: '100%', height: 48, borderRadius: 13, border: 'none', color: '#fff',
              fontSize: 14, fontWeight: 700, cursor: valid && !busy ? 'pointer' : 'default',
              background: valid ? 'var(--m-grad)' : 'rgba(255,255,255,0.09)',
              opacity: busy ? 0.6 : 1, marginBottom: 4,
            }}>
            {busy ? L('Salvando…', 'Saving…', 'Guardando…') : L('Salvar lead', 'Save lead', 'Guardar lead')}
          </button>
        </div>
      </div>
    </div>
  )
}
