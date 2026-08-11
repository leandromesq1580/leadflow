'use client'

import { useEffect, useRef, useState } from 'react'
import { useT } from '@/lib/i18n-client'

interface UpcomingEvent {
  id: string
  raw_id: string
  type: 'appointment' | 'followup' | 'calendar_item'
  title: string
  subtitle: string
  start: string
  lead_id: string | null
}

interface Prefs {
  reminder_intervals: number[]
  banner_enabled: boolean
  sound_enabled: boolean
  sound_volume: number
  sound_file: 'alarm' | 'chime' | 'bell'
}

const DEFAULT_PREFS: Prefs = {
  reminder_intervals: [60, 15, 5],
  banner_enabled: true,
  sound_enabled: true,
  sound_volume: 70,
  sound_file: 'chime',
}

let _ctx: AudioContext | null = null
function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (_ctx) return _ctx
  try {
    const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!Ctor) return null
    _ctx = new Ctor()
    return _ctx
  } catch {
    return null
  }
}

function playTone(ctx: AudioContext, freq: number, when: number, duration: number, volume: number, type: OscillatorType = 'sine') {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, ctx.currentTime + when)
  gain.gain.setValueAtTime(0, ctx.currentTime + when)
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + when + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + duration)
  osc.connect(gain).connect(ctx.destination)
  osc.start(ctx.currentTime + when)
  osc.stop(ctx.currentTime + when + duration + 0.05)
}

export function playReminderSound(file: 'alarm' | 'chime' | 'bell', volume: number) {
  const ctx = getAudioCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  const v = Math.max(0, Math.min(1, volume / 100))
  if (file === 'alarm') {
    // Beep agudo repetido
    for (let i = 0; i < 4; i++) {
      playTone(ctx, 1000, i * 0.18, 0.13, v * 0.7, 'square')
      playTone(ctx, 800, i * 0.18 + 0.06, 0.07, v * 0.4, 'square')
    }
  } else if (file === 'bell') {
    // Sino com decay longo
    playTone(ctx, 660, 0, 1.6, v * 0.6, 'sine')
    playTone(ctx, 1320, 0, 1.2, v * 0.25, 'sine')
    playTone(ctx, 1980, 0, 0.9, v * 0.12, 'sine')
  } else {
    // chime — três tons subindo (C5 E5 G5)
    playTone(ctx, 523.25, 0, 0.5, v * 0.55, 'sine')
    playTone(ctx, 659.25, 0.18, 0.5, v * 0.55, 'sine')
    playTone(ctx, 783.99, 0.36, 0.7, v * 0.55, 'sine')
  }
}

interface Props {
  buyerId: string
}

export function MeetingBanner({ buyerId }: Props) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [events, setEvents] = useState<UpcomingEvent[]>([])
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [tick, setTick] = useState(0)
  const lastMinutesRef = useRef<Map<string, number>>(new Map())
  const audioUnlocked = useRef(false)

  // Liberar AudioContext após primeira interação (Chrome autoplay policy)
  useEffect(() => {
    if (audioUnlocked.current) return
    const unlock = () => {
      const ctx = getAudioCtx()
      if (ctx?.state === 'suspended') ctx.resume().catch(() => {})
      audioUnlocked.current = true
      document.removeEventListener('click', unlock)
      document.removeEventListener('keydown', unlock)
    }
    document.addEventListener('click', unlock, { once: true })
    document.addEventListener('keydown', unlock, { once: true })
    return () => {
      document.removeEventListener('click', unlock)
      document.removeEventListener('keydown', unlock)
    }
  }, [])

  // Carrega preferências
  useEffect(() => {
    if (!buyerId) return
    fetch(`/api/notification-preferences?buyer_id=${buyerId}`)
      .then(r => r.ok ? r.json() : DEFAULT_PREFS)
      .then(data => {
        setPrefs({
          reminder_intervals: Array.isArray(data.reminder_intervals) ? data.reminder_intervals : DEFAULT_PREFS.reminder_intervals,
          banner_enabled: data.banner_enabled !== false,
          sound_enabled: data.sound_enabled !== false,
          sound_volume: Number.isFinite(data.sound_volume) ? data.sound_volume : 70,
          sound_file: data.sound_file === 'alarm' || data.sound_file === 'bell' ? data.sound_file : 'chime',
        })
      })
      .catch(() => {})
  }, [buyerId])

  // Polling de eventos próximos a cada 30s
  useEffect(() => {
    if (!buyerId) return
    let cancelled = false
    async function load() {
      try {
        const r = await fetch(`/api/appointments/upcoming?buyer_id=${buyerId}&minutes=90`, { cache: 'no-store' })
        if (!r.ok) return
        const d = await r.json()
        if (!cancelled) setEvents(d.events || [])
      } catch {}
    }
    load()
    const t = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [buyerId])

  // Tick a cada 1s pra atualizar countdown ao vivo
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Detecta cruzamento de intervals → toca som
  useEffect(() => {
    if (!prefs.sound_enabled || events.length === 0) return
    const now = Date.now()
    let triggered = false
    for (const ev of events) {
      if (dismissed.has(ev.id)) continue
      const minutes = (new Date(ev.start).getTime() - now) / 60_000
      const prev = lastMinutesRef.current.get(ev.id)
      lastMinutesRef.current.set(ev.id, minutes)
      if (prev === undefined) continue // primeira observação — não toca
      for (const interval of prefs.reminder_intervals) {
        if (prev > interval && minutes <= interval && minutes > 0) {
          if (!triggered) {
            playReminderSound(prefs.sound_file, prefs.sound_volume)
            triggered = true
          }
        }
      }
    }
  }, [tick, events, prefs, dismissed])

  if (!prefs.banner_enabled) return null

  const visible = events.filter(e => !dismissed.has(e.id))
  if (visible.length === 0) return null

  // Mostra o evento mais próximo
  const next = visible[0]
  const nowMs = Date.now()
  const ms = new Date(next.start).getTime() - nowMs
  if (ms <= 0) return null

  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60

  // Severidade pelas faixas configuradas
  const intervals = [...prefs.reminder_intervals].sort((a, b) => a - b)
  const closest = intervals.find(i => min <= i) ?? Math.max(...intervals)

  let bg = 'linear-gradient(135deg, #6366f1, #8b5cf6)'
  let pulse = false
  let icon = '⏰'
  if (min < 5 || (min === 5 && sec === 0)) {
    bg = 'linear-gradient(135deg, #dc2626, #f87171)'
    pulse = true
    icon = '🚨'
  } else if (min < 15) {
    bg = 'linear-gradient(135deg, #ea580c, #fb923c)'
    icon = '⚠️'
  } else if (min < 30) {
    bg = 'linear-gradient(135deg, #d97706, #fbbf24)'
  }

  const countdown = min < 1 ? `${sec}s` : min < 60 ? `${min}m ${String(sec).padStart(2, '0')}s` : `${Math.floor(min / 60)}h ${min % 60}m`

  return (
    <div className="sticky top-0 z-40 mb-4">
      <div
        className="rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg"
        style={{
          background: bg,
          color: '#fff',
          animation: pulse ? 'meetingBannerPulse 1.2s ease-in-out infinite' : undefined,
        }}
      >
        <span className="text-[24px]" aria-hidden>{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-extrabold truncate" style={{ letterSpacing: '-0.01em' }}>
            {next.title}
          </p>
          <p className="text-[11px] opacity-90 truncate">
            {L('Em', 'In', 'En')} <span className="font-bold tabular-nums">{countdown}</span>
            {next.subtitle ? ` · ${next.subtitle}` : ''}
            {visible.length > 1 ? ` · +${visible.length - 1} ${L(visible.length > 2 ? 'próximos' : 'próximo', 'more', 'más')}` : ''}
          </p>
        </div>
        <a
          href="/dashboard/appointments"
          className="px-3 py-1.5 rounded-lg text-[11px] font-extrabold whitespace-nowrap"
          style={{ background: 'rgba(255,255,255,0.22)', color: '#fff', textDecoration: 'none' }}
        >
          {L('Abrir', 'Open', 'Abrir')} →
        </a>
        <button
          onClick={() => setDismissed(prev => new Set(prev).add(next.id))}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[14px] font-bold"
          style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}
          aria-label={L('Dispensar', 'Dismiss', 'Descartar')}
        >
          ×
        </button>
      </div>
      <style jsx>{`
        @keyframes meetingBannerPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 4px 16px rgba(220,38,38,0.4); }
          50% { transform: scale(1.015); box-shadow: 0 8px 28px rgba(220,38,38,0.6); }
        }
      `}</style>
    </div>
  )
}
