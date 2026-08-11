'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n-client'
import { MIcon } from '@/components/mobile/icons'
import { WaConnectCard } from '@/components/mobile/wa-connect-card'
import { Toggle } from '@/components/mobile/toggle'

const US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC']
const DAY_KEYS = ['weekday', 'saturday', 'sunday', 'holiday'] as const
const PERIOD_KEYS = ['morning', 'afternoon', 'evening'] as const

export default function MobileConfig() {
  const t = useT()
  const loc = t._locale
  const L = (pt: string, en: string, es: string) => (loc === 'en' ? en : loc === 'es' ? es : pt)
  const router = useRouter()

  const [buyerId, setBuyerId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [calLink, setCalLink] = useState('')
  const [notifEmail, setNotifEmail] = useState(true)
  const [notifSms, setNotifSms] = useState(false)
  const [states, setStates] = useState<string[]>([])
  const [avail, setAvail] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')
  const [delOpen, setDelOpen] = useState(false)
  const [delText, setDelText] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function deleteAccount() {
    if (deleting || delText.trim().toUpperCase() !== 'EXCLUIR') return
    setDeleting(true)
    try {
      const r = await fetch('/api/account/delete', { method: 'POST' })
      if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || L('Não consegui excluir agora.', "Couldn't delete now.", 'No pude eliminar.')); setDeleting(false); return }
      try { const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').split('.')[0]; document.cookie = `sb-${ref}-auth-token=; path=/; max-age=0; SameSite=Lax` } catch {}
      window.location.href = '/m-login'
    } catch { alert(L('Erro de conexão.', 'Connection error.', 'Error.')); setDeleting(false) }
  }

  useEffect(() => {
    fetch('/api/m/settings', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => {
      if (d?.buyer) {
        setBuyerId(d.buyer.id)
        setName(d.buyer.name || ''); setPhone(d.buyer.phone || ''); setWhatsapp(d.buyer.whatsapp || ''); setCalLink(d.buyer.cal_link || '')
        setNotifEmail(d.buyer.notification_email !== false); setNotifSms(!!d.buyer.notification_sms)
        setStates(d.activeStates || []); setAvail(d.activeAvailability || [])
      }
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  const toggleState = (c: string) => setStates(p => p.includes(c) ? p.filter(s => s !== c) : [...p, c])
  const toggleAvail = (k: string) => setAvail(p => p.includes(k) ? p.filter(a => a !== k) : [...p, k])
  const dayLabel = (d: string) => ({ weekday: L('Dias de semana', 'Weekdays', 'Días de semana'), saturday: L('Sábado', 'Saturday', 'Sábado'), sunday: L('Domingo', 'Sunday', 'Domingo'), holiday: L('Feriados', 'Holidays', 'Feriados') } as Record<string, string>)[d]
  const periodLabel = (p: string) => ({ morning: L('Manhã', 'Morning', 'Mañana'), afternoon: L('Tarde', 'Afternoon', 'Tarde'), evening: L('Noite', 'Evening', 'Noche') } as Record<string, string>)[p]

  async function save() {
    if (saving || !buyerId) return
    setSaving(true); setErr(''); setSaved(false)
    try {
      const r = await fetch('/api/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer_id: buyerId, name, phone, whatsapp, cal_link: calLink,
          notification_email: notifEmail, notification_sms: notifSms,
          states,
          availability: avail.map(a => { const [day_type, period] = a.split('_'); return { day_type, period } }),
        }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || L('Erro', 'Error', 'Error')) }
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e: any) { setErr(e?.message || L('Falha ao salvar.', 'Save failed.', 'Error al guardar.')) }
    setSaving(false)
  }

  const labelCls = { color: 'var(--m-muted)', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 } as React.CSSProperties
  const section = { fontSize: 14, fontWeight: 700, margin: '0 0 12px' } as React.CSSProperties

  return (
    <div>
      <div className="m-pad" style={{ paddingTop: 6, display: 'flex', alignItems: 'center', gap: 12, height: 44 }}>
        <button onClick={() => router.push('/m/mais')} className="m-tap" style={{ background: 'none', border: 'none', color: 'var(--m-text)', display: 'flex', cursor: 'pointer', padding: 0 }}><MIcon name="arrowLeft" size={24} /></button>
        <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{L('Configurações', 'Settings', 'Configuración')}</p>
      </div>

      {!loaded && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><div className="m-spin" /></div>}

      {loaded && (
        <div className="m-pad" style={{ paddingTop: 8 }}>
          <WaConnectCard locale={loc} />

          {/* Perfil */}
          <div className="m-card" style={{ padding: 18, marginBottom: 16 }}>
            <p style={section}>{L('Perfil', 'Profile', 'Perfil')}</p>
            <div style={{ marginBottom: 12 }}><label style={labelCls}>{L('Nome', 'Name', 'Nombre')}</label><input className="m-input" value={name} onChange={e => setName(e.target.value)} /></div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}><label style={labelCls}>{L('Telefone', 'Phone', 'Teléfono')}</label><input className="m-input" value={phone} onChange={e => setPhone(e.target.value)} /></div>
              <div style={{ flex: 1 }}><label style={labelCls}>WhatsApp</label><input className="m-input" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} /></div>
            </div>
            <div><label style={labelCls}>Cal.com</label><input className="m-input" value={calLink} onChange={e => setCalLink(e.target.value)} placeholder={L('https://cal.com/seu-nome', 'https://cal.com/your-name', 'https://cal.com/tu-nombre')} /></div>
          </div>

          {/* Estados */}
          <div className="m-card" style={{ padding: 18, marginBottom: 16 }}>
            <p style={section}>{L('Estados licenciados', 'Licensed states', 'Estados con licencia')}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {US_STATES.map(c => (
                <span key={c} className={`m-chip m-tap${states.includes(c) ? ' on' : ''}`} onClick={() => toggleState(c)} style={{ padding: '6px 11px' }}>{c}</span>
              ))}
            </div>
          </div>

          {/* Disponibilidade */}
          <div className="m-card" style={{ padding: 18, marginBottom: 16 }}>
            <p style={section}>{L('Disponibilidade', 'Availability', 'Disponibilidad')}</p>
            {DAY_KEYS.map(d => (
              <div key={d} style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>{dayLabel(d)}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {PERIOD_KEYS.map(p => {
                    const key = `${d}_${p}`
                    return <span key={key} className={`m-chip m-tap${avail.includes(key) ? ' on' : ''}`} onClick={() => toggleAvail(key)}>{periodLabel(p)}</span>
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Notificações */}
          <div className="m-card" style={{ padding: 18, marginBottom: 16 }}>
            <p style={section}>{L('Notificações', 'Notifications', 'Notificaciones')}</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
              <span style={{ fontSize: 14 }}>{L('E-mail', 'Email', 'Correo')}</span><Toggle on={notifEmail} onClick={() => setNotifEmail(v => !v)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
              <span style={{ fontSize: 14 }}>SMS</span><Toggle on={notifSms} onClick={() => setNotifSms(v => !v)} />
            </div>
          </div>

          {err && <p style={{ color: '#fca5a5', fontSize: 13, margin: '0 0 12px', textAlign: 'center' }}>{err}</p>}

          <button onClick={save} disabled={saving} className="m-tap" style={{ width: '100%', height: 50, borderRadius: 14, background: saved ? 'rgba(16,185,129,0.9)' : 'var(--m-grad)', border: 'none', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? L('Salvando…', 'Saving…', 'Guardando…') : saved ? L('✓ Salvo', '✓ Saved', '✓ Guardado') : L('Salvar', 'Save', 'Guardar')}
          </button>

          {/* Zona de perigo — exclusão de conta (App Store 5.1.1(v)) */}
          <div style={{ marginTop: 26, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <button onClick={() => { setDelText(''); setDelOpen(true) }} className="m-tap" style={{ width: '100%', height: 46, borderRadius: 13, background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {L('Excluir minha conta', 'Delete my account', 'Eliminar mi cuenta')}
            </button>
          </div>
        </div>
      )}

      {delOpen && (
        <div className="m-sheet-ov" onClick={() => setDelOpen(false)}>
          <div className="m-sheet" onClick={e => e.stopPropagation()} style={{ padding: '8px 20px calc(env(safe-area-inset-bottom) + 18px)' }}>
            <div className="m-sheet-grab" style={{ marginLeft: 'auto', marginRight: 'auto' }} />
            <p style={{ margin: '2px 0 8px', fontSize: 16, fontWeight: 700, color: '#f87171' }}>{L('Excluir conta', 'Delete account', 'Eliminar cuenta')}</p>
            <p className="m-muted" style={{ fontSize: 13, lineHeight: 1.55, margin: '0 0 16px' }}>
              {L('Isso é permanente: seu acesso é removido e seus dados pessoais são apagados. Para confirmar, digite EXCLUIR abaixo.', 'This is permanent: your access is removed and your personal data is erased. Type EXCLUIR to confirm.', 'Es permanente. Escribe EXCLUIR para confirmar.')}
            </p>
            <input className="m-input" value={delText} onChange={e => setDelText(e.target.value)} placeholder="EXCLUIR" autoCapitalize="characters" style={{ marginBottom: 14 }} />
            <button onClick={deleteAccount} disabled={deleting || delText.trim().toUpperCase() !== 'EXCLUIR'} className="m-tap" style={{ width: '100%', height: 48, borderRadius: 14, background: '#ef4444', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: deleting || delText.trim().toUpperCase() !== 'EXCLUIR' ? 0.45 : 1 }}>
              {deleting ? L('Excluindo…', 'Deleting…', 'Eliminando…') : L('Excluir permanentemente', 'Delete permanently', 'Eliminar')}
            </button>
            <button onClick={() => setDelOpen(false)} className="m-tap" style={{ width: '100%', height: 44, marginTop: 8, borderRadius: 12, background: 'transparent', border: 'none', color: 'var(--m-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{L('Cancelar', 'Cancel', 'Cancelar')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
