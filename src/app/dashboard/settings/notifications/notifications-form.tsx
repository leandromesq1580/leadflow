'use client'

import { useEffect, useMemo, useState } from 'react'
import { playReminderSound } from '@/components/dashboard/meeting-banner'
import { useT } from '@/lib/i18n-client'

interface Buyer {
  id: string
  name: string
  whatsapp: string | null
  phone: string | null
  email: string | null
}

interface Prefs {
  reminder_intervals: number[]
  push_enabled: boolean
  banner_enabled: boolean
  sound_enabled: boolean
  sound_volume: number
  sound_file: 'alarm' | 'chime' | 'bell'
  whatsapp_enabled: boolean
  whatsapp_intervals: number[]
  email_enabled: boolean
  email_intervals: number[]
}

const INTERVAL_OPTIONS = [5, 10, 15, 30, 45, 60, 90, 120, 240]
const soundOptions = (L: (pt: string, en: string, es: string) => string): { id: Prefs['sound_file']; label: string; description: string }[] => [
  { id: 'chime', label: L('Carrilhão', 'Chime', 'Melodía'), description: L('Três tons ascendentes e agradáveis', 'Three rising tones, pleasant', 'Tres tonos ascendentes y agradables') },
  { id: 'alarm', label: L('Alarme', 'Alarm', 'Alarma'), description: L('Bipe agudo e mais urgente', 'Sharp beep, more urgent', 'Pitido agudo y más urgente') },
  { id: 'bell', label: L('Sino', 'Bell', 'Campana'), description: L('Sino com som prolongado', 'Bell, long decay', 'Campana con sonido prolongado') },
]

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

interface Props {
  buyer: Buyer
  initialPrefs: Prefs
}

export function NotificationsForm({ buyer, initialPrefs }: Props) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [prefs, setPrefs] = useState<Prefs>(initialPrefs)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pushPerm, setPushPerm] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('unsupported')
  const [pushSubscribed, setPushSubscribed] = useState(false)
  const [enabling, setEnabling] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    setPushPerm(Notification.permission as any)
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription()).then(sub => setPushSubscribed(!!sub)).catch(() => {})
  }, [])

  const phoneForWhatsApp = buyer.whatsapp || buyer.phone || ''

  function toggleInterval(field: 'reminder_intervals' | 'whatsapp_intervals' | 'email_intervals', minutes: number) {
    setPrefs(prev => {
      const current = new Set(prev[field])
      if (current.has(minutes)) current.delete(minutes)
      else current.add(minutes)
      const next = Array.from(current).sort((a, b) => b - a)
      return { ...prev, [field]: next.length > 0 ? next : prev[field] }
    })
  }

  async function enablePush() {
    setEnabling(true)
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert(L('Seu navegador não suporta push notifications.', 'Your browser does not support push notifications.', 'Tu navegador no soporta notificaciones push.'))
        return
      }
      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapid) {
        alert(L('Push não configurado no servidor (VAPID ausente).', 'Push is not configured on the server (missing VAPID).', 'Push no está configurado en el servidor (falta VAPID).'))
        return
      }
      const permission = await Notification.requestPermission()
      setPushPerm(permission as any)
      if (permission !== 'granted') return

      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
        })
      }
      const subJson = sub.toJSON()
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer_id: buyer.id,
          endpoint: subJson.endpoint,
          p256dh: subJson.keys?.p256dh,
          auth: subJson.keys?.auth,
          user_agent: navigator.userAgent,
        }),
      })
      setPushSubscribed(true)
    } catch (e: any) {
      alert(L('Falha ao ativar push: ', 'Failed to enable push: ', 'Error al activar push: ') + (e?.message || L('erro', 'error', 'error')))
    } finally {
      setEnabling(false)
    }
  }

  async function save() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const r = await fetch('/api/notification-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyer_id: buyer.id, ...prefs }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || `${L('Erro', 'Error', 'Error')} ${r.status}`)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: any) {
      setError(e?.message || L('Falha ao salvar', 'Failed to save', 'Error al guardar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="px-5 py-3 rounded-xl text-[13px] font-semibold" style={{ background: 'var(--err-soft)', color: '#dc2626', border: '1px solid #fecaca' }}>
          ⚠️ {error}
        </div>
      )}
      {saved && (
        <div className="px-5 py-3 rounded-xl text-[13px] font-semibold" style={{ background: '#ecfdf5', color: '#10b981', border: '1px solid #a7f3d0' }}>
          ✅ {L('Preferências salvas', 'Preferences saved', 'Preferencias guardadas')}
        </div>
      )}

      {/* Browser permission */}
      <Section
        title={L('Notificações do navegador', 'Browser notifications', 'Notificaciones del navegador')}
        subtitle={L('Recebe push mesmo com a aba fechada (precisa permitir uma vez)', 'Get push even with the tab closed (you only need to allow it once)', 'Recibe push aunque la pestaña esté cerrada (solo necesitas permitirlo una vez)')}
      >
        <div className="flex items-center justify-between">
          <div>
            <PermissionBadge state={pushPerm} subscribed={pushSubscribed} />
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--fg-muted)' }}>
              {pushPerm === 'granted' && pushSubscribed && L('Tudo certo. Notificações chegarão neste dispositivo.', 'All set. Notifications will arrive on this device.', 'Todo listo. Las notificaciones llegarán a este dispositivo.')}
              {pushPerm === 'granted' && !pushSubscribed && L('Permissão concedida mas não inscrito. Clique em "Ativar".', 'Permission granted but not subscribed. Click "Enable".', 'Permiso concedido pero sin suscripción. Haz clic en "Activar".')}
              {pushPerm === 'default' && L('Clique em "Ativar" e aceite no popup do navegador.', 'Click "Enable" and accept in the browser popup.', 'Haz clic en "Activar" y acepta en el popup del navegador.')}
              {pushPerm === 'denied' && L('Bloqueado. Vá nas configurações do site no navegador pra liberar.', 'Blocked. Go to the site settings in your browser to allow it.', 'Bloqueado. Ve a la configuración del sitio en el navegador para permitirlo.')}
              {pushPerm === 'unsupported' && L('Este navegador não suporta push notifications.', 'This browser does not support push notifications.', 'Este navegador no soporta notificaciones push.')}
            </p>
          </div>
          {pushPerm !== 'denied' && pushPerm !== 'unsupported' && !pushSubscribed && (
            <button
              onClick={enablePush}
              disabled={enabling}
              className="px-4 py-2 rounded-xl text-[12px] font-bold text-white whitespace-nowrap disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, var(--accent), #8b5cf6)' }}
            >
              {enabling ? L('Ativando...', 'Enabling...', 'Activando...') : L('Ativar notificações', 'Enable notifications', 'Activar notificaciones')}
            </button>
          )}
        </div>
      </Section>

      {/* Banner + push intervals */}
      <Section
        title={L('Banner ao vivo + Push', 'Live banner + Push', 'Banner en vivo + Push')}
        subtitle={L('Faixa colorida no topo do dashboard com countdown ao vivo. Toca som quando entra em cada faixa de tempo.', 'Colored bar at the top of the dashboard with a live countdown. Plays a sound when each time window starts.', 'Franja de color en la parte superior del dashboard con cuenta regresiva en vivo. Suena al entrar en cada franja de tiempo.')}
      >
        <div className="space-y-4">
          <Toggle
            label={L('Banner no app', 'In-app banner', 'Banner en la app')}
            description={L('Mostra a próxima reunião com countdown ao vivo no topo do dashboard', 'Shows your next meeting with a live countdown at the top of the dashboard', 'Muestra la próxima reunión con cuenta regresiva en vivo en la parte superior del dashboard')}
            checked={prefs.banner_enabled}
            onChange={v => setPrefs(p => ({ ...p, banner_enabled: v }))}
          />
          <Toggle
            label={L('Push do navegador', 'Browser push', 'Push del navegador')}
            description={L('Notificação nativa do sistema (mesmo com aba fechada)', 'Native system notification (even with the tab closed)', 'Notificación nativa del sistema (aunque la pestaña esté cerrada)')}
            checked={prefs.push_enabled}
            onChange={v => setPrefs(p => ({ ...p, push_enabled: v }))}
          />
          <div>
            <p className="text-[12px] font-bold mb-2" style={{ color: 'var(--fg)' }}>
              {L('Avisar quanto tempo antes?', 'How long before should we alert you?', '¿Con cuánta anticipación avisarte?')} <span className="font-normal" style={{ color: 'var(--fg-muted)' }}>{L('(escolha 1 ou mais)', '(choose 1 or more)', '(elige 1 o más)')}</span>
            </p>
            <IntervalChips
              selected={prefs.reminder_intervals}
              onToggle={m => toggleInterval('reminder_intervals', m)}
            />
          </div>
        </div>
      </Section>

      {/* Sound */}
      <Section
        title={L('Alerta sonoro', 'Sound alert', 'Alerta sonora')}
        subtitle={L('Toca um som quando o evento entra em cada faixa de tempo configurada acima', 'Plays a sound when the event enters each time window set above', 'Suena cuando el evento entra en cada franja de tiempo configurada arriba')}
      >
        <div className="space-y-4">
          <Toggle
            label={L('Tocar som', 'Play sound', 'Reproducir sonido')}
            description={L('Sons gerados localmente — não consome banda', 'Sounds generated locally — uses no bandwidth', 'Sonidos generados localmente — no consume datos')}
            checked={prefs.sound_enabled}
            onChange={v => setPrefs(p => ({ ...p, sound_enabled: v }))}
          />

          {prefs.sound_enabled && (
            <>
              <div>
                <p className="text-[12px] font-bold mb-2" style={{ color: 'var(--fg)' }}>{L('Tipo de som', 'Sound type', 'Tipo de sonido')}</p>
                <div className="grid sm:grid-cols-3 gap-2">
                  {soundOptions(L).map(opt => {
                    const active = prefs.sound_file === opt.id
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setPrefs(p => ({ ...p, sound_file: opt.id }))}
                        className="text-left rounded-xl p-3 transition-all"
                        style={{
                          background: active ? 'var(--accent-light)' : 'var(--bg)',
                          border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                          color: 'var(--fg)',
                        }}
                      >
                        <p className="text-[13px] font-extrabold flex items-center gap-1.5">
                          {active && <span style={{ color: 'var(--accent)' }}>●</span>}
                          {opt.label}
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--fg-secondary)' }}>{opt.description}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[12px] font-bold" style={{ color: 'var(--fg)' }}>{L('Volume', 'Volume', 'Volumen')}</p>
                  <span className="text-[11px] tabular-nums" style={{ color: 'var(--fg-secondary)' }}>{prefs.sound_volume}%</span>
                </div>
                <input
                  type="range" min={0} max={100} step={1}
                  value={prefs.sound_volume}
                  onChange={e => setPrefs(p => ({ ...p, sound_volume: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>

              <button
                type="button"
                onClick={() => playReminderSound(prefs.sound_file, prefs.sound_volume)}
                className="px-4 py-2 rounded-xl text-[12px] font-bold"
                style={{ background: 'var(--bg-soft)', color: 'var(--fg)', border: '1px solid var(--border)' }}
              >
                ▶ {L('Testar som', 'Test sound', 'Probar sonido')}
              </button>
            </>
          )}
        </div>
      </Section>

      {/* WhatsApp */}
      <Section
        title="WhatsApp"
        subtitle={
          phoneForWhatsApp
            ? L(`Manda mensagem pro seu WhatsApp (${phoneForWhatsApp}). Útil quando o app está fechado.`, `Sends a message to your WhatsApp (${phoneForWhatsApp}). Useful when the app is closed.`, `Envía un mensaje a tu WhatsApp (${phoneForWhatsApp}). Útil cuando la app está cerrada.`)
            : L('Cadastre seu WhatsApp em Perfil pra ativar este canal.', 'Add your WhatsApp in Profile to enable this channel.', 'Registra tu WhatsApp en Perfil para activar este canal.')
        }
      >
        <div className="space-y-4">
          <Toggle
            label={L('WhatsApp lembrete', 'WhatsApp reminder', 'Recordatorio por WhatsApp')}
            description={L('Envia mensagem via wa-bridge', 'Sends a message via wa-bridge', 'Envía un mensaje vía wa-bridge')}
            checked={prefs.whatsapp_enabled}
            disabled={!phoneForWhatsApp}
            onChange={v => setPrefs(p => ({ ...p, whatsapp_enabled: v }))}
          />
          {prefs.whatsapp_enabled && (
            <div>
              <p className="text-[12px] font-bold mb-2" style={{ color: 'var(--fg)' }}>{L('Avisar quanto tempo antes?', 'How long before should we alert you?', '¿Con cuánta anticipación avisarte?')}</p>
              <IntervalChips
                selected={prefs.whatsapp_intervals}
                onToggle={m => toggleInterval('whatsapp_intervals', m)}
              />
            </div>
          )}
        </div>
      </Section>

      {/* Email */}
      <Section
        title="Email"
        subtitle={buyer.email ? L(`Envia email pra ${buyer.email}.`, `Sends an email to ${buyer.email}.`, `Envía un email a ${buyer.email}.`) : L('Cadastre seu email em Perfil pra ativar este canal.', 'Add your email in Profile to enable this channel.', 'Registra tu email en Perfil para activar este canal.')}
      >
        <div className="space-y-4">
          <Toggle
            label={L('Email lembrete', 'Email reminder', 'Recordatorio por email')}
            description={L('Bom pra eventos importantes onde você quer um registro', 'Great for important events where you want a record', 'Ideal para eventos importantes donde quieres un registro')}
            checked={prefs.email_enabled}
            disabled={!buyer.email}
            onChange={v => setPrefs(p => ({ ...p, email_enabled: v }))}
          />
          {prefs.email_enabled && (
            <div>
              <p className="text-[12px] font-bold mb-2" style={{ color: 'var(--fg)' }}>{L('Avisar quanto tempo antes?', 'How long before should we alert you?', '¿Con cuánta anticipación avisarte?')}</p>
              <IntervalChips
                selected={prefs.email_intervals}
                onToggle={m => toggleInterval('email_intervals', m)}
              />
            </div>
          )}
        </div>
      </Section>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-3 rounded-xl text-[14px] font-bold text-white disabled:opacity-50"
          style={{ background: 'var(--accent)', boxShadow: '0 4px 14px rgba(124,58,237,0.3)' }}
        >
          {saving ? L('Salvando...', 'Saving...', 'Guardando...') : L('Salvar preferências', 'Save preferences', 'Guardar preferencias')}
        </button>
        <a
          href="/dashboard/settings"
          className="text-[13px] font-semibold"
          style={{ color: 'var(--fg-secondary)' }}
        >
          ← {L('Voltar pra configurações', 'Back to settings', 'Volver a configuración')}
        </a>
      </div>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <h2 className="text-[15px] font-bold" style={{ color: 'var(--fg)' }}>{title}</h2>
      {subtitle && <p className="text-[12px] mt-0.5 mb-4" style={{ color: 'var(--fg-muted)' }}>{subtitle}</p>}
      {children}
    </div>
  )
}

function Toggle({
  label, description, checked, onChange, disabled,
}: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <p className="text-[13px] font-semibold" style={{ color: disabled ? 'var(--fg-muted)' : 'var(--fg)' }}>{label}</p>
        {description && <p className="text-[11px] mt-0.5" style={{ color: 'var(--fg-muted)' }}>{description}</p>}
      </div>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className="w-11 h-6 rounded-full relative shrink-0 disabled:opacity-50"
        style={{ background: checked && !disabled ? '#10b981' : '#d1d5db' }}
      >
        <span className="absolute w-5 h-5 bg-white rounded-full top-0.5 shadow" style={{ left: checked ? '22px' : '2px', transition: 'left .2s' }} />
      </button>
    </div>
  )
}

function IntervalChips({ selected, onToggle }: { selected: number[]; onToggle: (m: number) => void }) {
  const set = useMemo(() => new Set(selected), [selected])
  return (
    <div className="flex flex-wrap gap-2">
      {INTERVAL_OPTIONS.map(min => {
        const active = set.has(min)
        return (
          <button
            key={min}
            type="button"
            onClick={() => onToggle(min)}
            className="px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all"
            style={{
              background: active ? 'var(--accent)' : 'var(--bg)',
              color: active ? '#fff' : 'var(--fg-secondary)',
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            {min < 60 ? `${min}min` : `${min / 60}h`}
          </button>
        )
      })}
    </div>
  )
}

function PermissionBadge({ state, subscribed }: { state: 'default' | 'granted' | 'denied' | 'unsupported'; subscribed: boolean }) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const label = state === 'unsupported' ? L('Sem suporte', 'Not supported', 'Sin soporte')
    : state === 'denied' ? L('Bloqueado', 'Blocked', 'Bloqueado')
    : state === 'granted' && subscribed ? L('Inscrito', 'Subscribed', 'Suscrito')
    : state === 'granted' ? L('Permitido', 'Allowed', 'Permitido')
    : L('Não solicitado', 'Not requested', 'No solicitado')
  const color = state === 'granted' && subscribed ? '#10b981'
    : state === 'denied' ? '#dc2626'
    : '#64748b'
  const bg = state === 'granted' && subscribed ? '#ecfdf5'
    : state === 'denied' ? 'var(--err-soft)'
    : 'var(--bg-soft)'
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
      style={{ background: bg, color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}
