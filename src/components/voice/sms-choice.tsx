'use client'

import { useEffect, useState } from 'react'

type Tpl = { id: string; name: string; is_default: boolean }

async function save(body: Record<string, unknown>) {
  const r = await fetch('/api/voice/sms-choice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return r.ok
}

/** Seletor no painel da ligação: o que fazer com o SMS automático se esta ligação terminar sem contato. */
export function SmsChoice({ leadId, L }: { leadId: string; L: (pt: string, en: string, es: string) => string }) {
  const [tpls, setTpls] = useState<Tpl[]>([])
  const [auto, setAuto] = useState(true)
  const [val, setVal] = useState('default')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setVal('default'); setFailed(false)
    // Nova ligação começa SEMPRE no padrão: apaga qualquer "não enviar" de uma ligação anterior ao mesmo lead.
    save({ lead_id: leadId, mode: 'default' }).then(ok => { if (alive && !ok) setFailed(true) }).catch(() => { if (alive) setFailed(true) })
    fetch('/api/sms-templates', { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      .then(d => { if (alive && d) { setTpls(d.templates || []); setAuto(d.auto_enabled !== false) } }).catch(() => {})
    return () => { alive = false }
  }, [leadId])

  async function change(v: string) {
    const prev = val
    setVal(v)
    const ok = v === 'off' ? await save({ lead_id: leadId, mode: 'off' })
      : v.startsWith('t:') ? await save({ lead_id: leadId, mode: 'template', template_id: v.slice(2) })
      : await save({ lead_id: leadId, mode: 'default' })
    if (!ok) { setVal(prev); setFailed(true) } else setFailed(false)
  }

  const row = { display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12 } as const
  if (!auto) return <p style={{ ...row, color: 'rgba(255,255,255,0.55)' }}>{L('📱 SMS automático desligado nas suas configurações.', '📱 Automatic SMS is turned off in your settings.', '📱 SMS automático desactivado en tu configuración.')}</p>
  return (
    <div style={row}>
      <span style={{ color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>{L('📱 SMS se não atender', '📱 SMS if no answer', '📱 SMS si no contesta')}</span>
      <select value={val} onChange={e => change(e.target.value)} style={{ flex: 1, minWidth: 0, height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 12, padding: '0 6px' }}>
        <option value="default" style={{ color: '#000' }}>{L('Padrão', 'Default', 'Predeterminado')}</option>
        <option value="off" style={{ color: '#000' }}>{L('Não enviar', 'Do not send', 'No enviar')}</option>
        {tpls.map(t => <option key={t.id} value={`t:${t.id}`} style={{ color: '#000' }}>{t.name}</option>)}
      </select>
      {failed && <span title={L('Não salvou — vale o padrão', 'Not saved — default applies', 'No se guardó — vale el predeterminado')}>⚠️</span>}
    </div>
  )
}
