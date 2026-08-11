'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n-client'
import { MIcon } from '@/components/mobile/icons'
import { Toggle } from '@/components/mobile/toggle'

interface Prefs {
  reminder_intervals: number[]; push_enabled: boolean; banner_enabled: boolean
  sound_enabled: boolean; sound_volume: number; sound_file: 'alarm' | 'chime' | 'bell'
  whatsapp_enabled: boolean; whatsapp_intervals: number[]; email_enabled: boolean; email_intervals: number[]
}
const INTERVALS = [5, 10, 15, 30, 45, 60, 90, 120, 240]

export default function MobileAvisos() {
  const t = useT()
  const loc = t._locale
  const L = (pt: string, en: string, es: string) => (loc === 'en' ? en : loc === 'es' ? es : pt)
  const router = useRouter()

  const [buyerId, setBuyerId] = useState<string | null>(null)
  const [p, setP] = useState<Prefs | null>(null)
  const [err, setErr] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/m/team-context', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => {
      if (!d?.buyer_id) { setErr(true); return }
      setBuyerId(d.buyer_id)
      return fetch(`/api/notification-preferences?buyer_id=${d.buyer_id}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : Promise.reject())).then(setP)
    }).catch(() => setErr(true))
  }, [])

  const set = (patch: Partial<Prefs>) => setP(prev => prev ? { ...prev, ...patch } : prev)
  const toggleInterval = (field: 'reminder_intervals' | 'whatsapp_intervals' | 'email_intervals', n: number) => {
    if (!p) return
    const cur = p[field]
    set({ [field]: cur.includes(n) ? cur.filter(x => x !== n) : [...cur, n].sort((a, b) => a - b) } as any)
  }
  const il = (n: number) => (n < 60 ? `${n}min` : `${n / 60}h`)

  async function save() {
    if (!p || !buyerId || saving) return
    if (p.reminder_intervals.length === 0) { setMsg(L('Escolha ao menos 1 intervalo de lembrete.', 'Pick at least 1 reminder interval.', 'Elige al menos 1 intervalo.')); return }
    setSaving(true); setMsg(''); setSaved(false)
    try {
      const r = await fetch('/api/notification-preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ buyer_id: buyerId, ...p }) })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || L('Erro', 'Error', 'Error')) }
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e: any) { setMsg(e?.message || L('Falha ao salvar.', 'Save failed.', 'Error.')) }
    setSaving(false)
  }

  const section = { fontSize: 14, fontWeight: 700, margin: '0 0 12px' } as React.CSSProperties
  const rowBtw = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0' } as React.CSSProperties

  return (
    <div>
      <div className="m-pad" style={{ paddingTop: 6, display: 'flex', alignItems: 'center', gap: 12, height: 44 }}>
        <button onClick={() => router.push('/m/mais')} className="m-tap" style={{ background: 'none', border: 'none', color: 'var(--m-text)', display: 'flex', cursor: 'pointer', padding: 0 }}><MIcon name="arrowLeft" size={24} /></button>
        <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{L('Avisos', 'Reminders', 'Avisos')}</p>
      </div>

      {!p && !err && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 70 }}><div className="m-spin" /></div>}
      {err && <p className="m-muted" style={{ textAlign: 'center', paddingTop: 40 }}>{L('Não consegui carregar agora.', "Couldn't load right now.", 'No pude cargar ahora.')}</p>}

      {p && (
        <div className="m-pad" style={{ paddingTop: 8 }}>
          {/* Banner + push */}
          <div className="m-card" style={{ padding: 18, marginBottom: 16 }}>
            <p style={section}>{L('Lembretes de reunião', 'Meeting reminders', 'Recordatorios')}</p>
            <div style={rowBtw}><span style={{ fontSize: 14 }}>{L('Banner na tela', 'On-screen banner', 'Banner')}</span><Toggle on={p.banner_enabled} onClick={() => set({ banner_enabled: !p.banner_enabled })} /></div>
            <div style={rowBtw}><span style={{ fontSize: 14 }}>Push</span><Toggle on={p.push_enabled} onClick={() => set({ push_enabled: !p.push_enabled })} /></div>
            <p className="m-muted" style={{ fontSize: 12, fontWeight: 600, margin: '12px 0 8px' }}>{L('Avisar antes', 'Notify before', 'Avisar antes')}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {INTERVALS.map(n => <span key={n} className={`m-chip m-tap${p.reminder_intervals.includes(n) ? ' on' : ''}`} onClick={() => toggleInterval('reminder_intervals', n)}>{il(n)}</span>)}
            </div>
          </div>

          {/* Som */}
          <div className="m-card" style={{ padding: 18, marginBottom: 16 }}>
            <div style={rowBtw}><p style={{ ...section, margin: 0 }}>{L('Alerta sonoro', 'Sound alert', 'Alerta sonora')}</p><Toggle on={p.sound_enabled} onClick={() => set({ sound_enabled: !p.sound_enabled })} /></div>
            {p.sound_enabled && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  {(['chime', 'alarm', 'bell'] as const).map(s => <span key={s} className={`m-chip m-tap${p.sound_file === s ? ' on' : ''}`} onClick={() => set({ sound_file: s })}>{s}</span>)}
                </div>
                <p className="m-muted" style={{ fontSize: 12, fontWeight: 600, margin: '0 0 6px' }}>{L('Volume', 'Volume', 'Volumen')}: {p.sound_volume}%</p>
                <input type="range" min={0} max={100} value={p.sound_volume} onChange={e => set({ sound_volume: Number(e.target.value) })} style={{ width: '100%', accentColor: '#8b5cf6' }} />
              </div>
            )}
          </div>

          {/* WhatsApp */}
          <div className="m-card" style={{ padding: 18, marginBottom: 16 }}>
            <div style={rowBtw}><p style={{ ...section, margin: 0 }}>WhatsApp</p><Toggle on={p.whatsapp_enabled} onClick={() => set({ whatsapp_enabled: !p.whatsapp_enabled })} /></div>
            {p.whatsapp_enabled && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>{INTERVALS.map(n => <span key={n} className={`m-chip m-tap${p.whatsapp_intervals.includes(n) ? ' on' : ''}`} onClick={() => toggleInterval('whatsapp_intervals', n)}>{il(n)}</span>)}</div>}
          </div>

          {/* Email */}
          <div className="m-card" style={{ padding: 18, marginBottom: 16 }}>
            <div style={rowBtw}><p style={{ ...section, margin: 0 }}>Email</p><Toggle on={p.email_enabled} onClick={() => set({ email_enabled: !p.email_enabled })} /></div>
            {p.email_enabled && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>{INTERVALS.map(n => <span key={n} className={`m-chip m-tap${p.email_intervals.includes(n) ? ' on' : ''}`} onClick={() => toggleInterval('email_intervals', n)}>{il(n)}</span>)}</div>}
          </div>

          {msg && <p style={{ color: '#fca5a5', fontSize: 13, margin: '0 0 12px', textAlign: 'center' }}>{msg}</p>}
          <button onClick={save} disabled={saving} className="m-tap" style={{ width: '100%', height: 50, borderRadius: 14, background: saved ? 'rgba(16,185,129,0.9)' : 'var(--m-grad)', border: 'none', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? L('Salvando…', 'Saving…', 'Guardando…') : saved ? L('✓ Salvo', '✓ Saved', '✓ Guardado') : L('Salvar preferências', 'Save preferences', 'Guardar')}
          </button>
        </div>
      )}
    </div>
  )
}
