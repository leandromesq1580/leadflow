'use client'

import { useEffect, useMemo, useState } from 'react'
import { playReminderSound } from '@/components/dashboard/meeting-banner'

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
const SOUND_OPTIONS: { id: Prefs['sound_file']; label: string; description: string }[] = [
  { id: 'chime', label: 'Chime', description: 'Três tons subindo, agradável' },
  { id: 'alarm', label: 'Alarm', description: 'Beep agudo, mais urgente' },
  { id: 'bell', label: 'Bell', description: 'Sino, decay longo' },
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
        alert('Seu navegador não suporta push notifications.')
        return
      }
      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapid) {
        alert('Push não configurado no servidor (VAPID ausente).')
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
      alert('Falha ao ativar push: ' + (e?.message || 'erro'))
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
        throw new Error(d.error || `Erro ${r.status}`)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="px-5 py-3 rounded-xl text-[13px] font-semibold" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
          ⚠️ {error}
        </div>
      )}
      {saved && (
        <div className="px-5 py-3 rounded-xl text-[13px] font-semibold" style={{ background: '#ecfdf5', color: '#10b981', border: '1px solid #a7f3d0' }}>
          ✅ Preferências salvas
        </div>
      )}

      {/* Browser permission */}
      <Section
        title="Notificações do navegador"
        subtitle="Recebe push mesmo com a aba fechada (precisa permitir uma vez)"
      >
        <div className="flex items-center justify-between">
          <div>
            <PermissionBadge state={pushPerm} subscribed={pushSubscribed} />
            <p className="text-[11px] mt-1.5" style={{ color: '#94a3b8' }}>
              {pushPerm === 'granted' && pushSubscribed && 'Tudo certo. Notificações chegarão neste dispositivo.'}
              {pushPerm === 'granted' && !pushSubscribed && 'Permissão concedida mas não inscrito. Clique em "Ativar".'}
              {pushPerm === 'default' && 'Clique em "Ativar" e aceite no popup do navegador.'}
              {pushPerm === 'denied' && 'Bloqueado. Vá nas configurações do site no navegador pra liberar.'}
              {pushPerm === 'unsupported' && 'Este navegador não suporta push notifications.'}
            </p>
          </div>
          {pushPerm !== 'denied' && pushPerm !== 'unsupported' && !pushSubscribed && (
            <button
              onClick={enablePush}
              disabled={enabling}
              className="px-4 py-2 rounded-xl text-[12px] font-bold text-white whitespace-nowrap disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
              {enabling ? 'Ativando...' : 'Ativar notificações'}
            </button>
          )}
        </div>
      </Section>

      {/* Banner + push intervals */}
      <Section
        title="Banner ao vivo + Push"
        subtitle="Faixa colorida no topo do dashboard com countdown ao vivo. Toca som quando entra em cada faixa de tempo."
      >
        <div className="space-y-4">
          <Toggle
            label="Banner no app"
            description="Mostra a próxima reunião com countdown ao vivo no topo do dashboard"
            checked={prefs.banner_enabled}
            onChange={v => setPrefs(p => ({ ...p, banner_enabled: v }))}
          />
          <Toggle
            label="Push do navegador"
            description="Notificação nativa do sistema (mesmo com aba fechada)"
            checked={prefs.push_enabled}
            onChange={v => setPrefs(p => ({ ...p, push_enabled: v }))}
          />
          <div>
            <p className="text-[12px] font-bold mb-2" style={{ color: '#1a1a2e' }}>
              Avisar quanto tempo antes? <span className="font-normal" style={{ color: '#94a3b8' }}>(escolha 1 ou mais)</span>
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
        title="Alerta sonoro"
        subtitle="Toca um som quando o evento entra em cada faixa de tempo configurada acima"
      >
        <div className="space-y-4">
          <Toggle
            label="Tocar som"
            description="Sons gerados localmente — não consome banda"
            checked={prefs.sound_enabled}
            onChange={v => setPrefs(p => ({ ...p, sound_enabled: v }))}
          />

          {prefs.sound_enabled && (
            <>
              <div>
                <p className="text-[12px] font-bold mb-2" style={{ color: '#1a1a2e' }}>Tipo de som</p>
                <div className="grid sm:grid-cols-3 gap-2">
                  {SOUND_OPTIONS.map(opt => {
                    const active = prefs.sound_file === opt.id
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setPrefs(p => ({ ...p, sound_file: opt.id }))}
                        className="text-left rounded-xl p-3 transition-all"
                        style={{
                          background: active ? '#eef2ff' : '#f8f9fc',
                          border: `1px solid ${active ? '#6366f1' : '#e8ecf4'}`,
                          color: '#1a1a2e',
                        }}
                      >
                        <p className="text-[13px] font-extrabold flex items-center gap-1.5">
                          {active && <span style={{ color: '#6366f1' }}>●</span>}
                          {opt.label}
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: '#64748b' }}>{opt.description}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[12px] font-bold" style={{ color: '#1a1a2e' }}>Volume</p>
                  <span className="text-[11px] tabular-nums" style={{ color: '#64748b' }}>{prefs.sound_volume}%</span>
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
                style={{ background: '#f1f5f9', color: '#1a1a2e', border: '1px solid #e8ecf4' }}
              >
                ▶ Testar som
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
            ? `Manda mensagem pro seu WhatsApp (${phoneForWhatsApp}). Útil quando o app está fechado.`
            : 'Cadastre seu WhatsApp em Perfil pra ativar este canal.'
        }
      >
        <div className="space-y-4">
          <Toggle
            label="WhatsApp lembrete"
            description="Envia mensagem via wa-bridge"
            checked={prefs.whatsapp_enabled}
            disabled={!phoneForWhatsApp}
            onChange={v => setPrefs(p => ({ ...p, whatsapp_enabled: v }))}
          />
          {prefs.whatsapp_enabled && (
            <div>
              <p className="text-[12px] font-bold mb-2" style={{ color: '#1a1a2e' }}>Avisar quanto tempo antes?</p>
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
        subtitle={buyer.email ? `Envia email pra ${buyer.email}.` : 'Cadastre seu email em Perfil pra ativar este canal.'}
      >
        <div className="space-y-4">
          <Toggle
            label="Email lembrete"
            description="Bom pra eventos importantes onde você quer um registro"
            checked={prefs.email_enabled}
            disabled={!buyer.email}
            onChange={v => setPrefs(p => ({ ...p, email_enabled: v }))}
          />
          {prefs.email_enabled && (
            <div>
              <p className="text-[12px] font-bold mb-2" style={{ color: '#1a1a2e' }}>Avisar quanto tempo antes?</p>
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
          style={{ background: '#6366f1', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}
        >
          {saving ? 'Salvando...' : 'Salvar preferências'}
        </button>
        <a
          href="/dashboard/settings"
          className="text-[13px] font-semibold"
          style={{ color: '#64748b' }}
        >
          ← Voltar pra configurações
        </a>
      </div>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
      <h2 className="text-[15px] font-bold" style={{ color: '#1a1a2e' }}>{title}</h2>
      {subtitle && <p className="text-[12px] mt-0.5 mb-4" style={{ color: '#94a3b8' }}>{subtitle}</p>}
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
        <p className="text-[13px] font-semibold" style={{ color: disabled ? '#94a3b8' : '#1a1a2e' }}>{label}</p>
        {description && <p className="text-[11px] mt-0.5" style={{ color: '#94a3b8' }}>{description}</p>}
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
              background: active ? '#6366f1' : '#f8f9fc',
              color: active ? '#fff' : '#64748b',
              border: `1px solid ${active ? '#6366f1' : '#e8ecf4'}`,
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
  const label = state === 'unsupported' ? 'Sem suporte'
    : state === 'denied' ? 'Bloqueado'
    : state === 'granted' && subscribed ? 'Inscrito'
    : state === 'granted' ? 'Permitido'
    : 'Não solicitado'
  const color = state === 'granted' && subscribed ? '#10b981'
    : state === 'denied' ? '#dc2626'
    : '#64748b'
  const bg = state === 'granted' && subscribed ? '#ecfdf5'
    : state === 'denied' ? '#fef2f2'
    : '#f1f5f9'
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
      style={{ background: bg, color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}
