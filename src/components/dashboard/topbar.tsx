'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useT } from '@/lib/i18n-client'
import { LocaleSwitcher } from '@/components/locale-switcher'

/**
 * TOPBAR (reconcept Fase 3): contexto de onde estou + sino unificado.
 * O sino agrega o que já existe — WhatsApp não lido, novidades da comunidade,
 * reuniões chegando e leads sem contato — sem backend novo: só as APIs atuais.
 * Desktop only (o mobile tem a própria navegação).
 */
export function TopBar({ buyerId }: { buyerId?: string }) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const pathname = usePathname()
  const [aberto, setAberto] = useState(false)
  const [n, setN] = useState({ wa: 0, comunidade: 0, reunioes: 0, semContato: 0 })
  const [creditos, setCreditos] = useState<number | null>(null)
  const caixa = useRef<HTMLDivElement>(null)

  // saldo de créditos sempre à vista (reconcept): carrega, atualiza a cada 5 min
  // e quando a aba volta ao foco (ex.: acabou de comprar em outra aba)
  useEffect(() => {
    if (!buyerId) return
    let vivo = true
    const carregarSaldo = () => fetch('/api/home', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (vivo && d && typeof d.remaining === 'number') setCreditos(d.remaining) })
      .catch(() => {})
    carregarSaldo()
    const timer = setInterval(carregarSaldo, 5 * 60_000)
    const foco = () => carregarSaldo()
    window.addEventListener('focus', foco)
    return () => { vivo = false; clearInterval(timer); window.removeEventListener('focus', foco) }
  }, [buyerId])

  useEffect(() => {
    if (!buyerId) return
    let vivo = true
    const carregar = async () => {
      try {
        const [wa, com, reu, spd] = await Promise.all([
          fetch(`/api/whatsapp/unread?buyer_id=${buyerId}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch('/api/community/notifications?count=1', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`/api/appointments/upcoming?buyer_id=${buyerId}&minutes=90`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch('/api/speed-to-lead', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
        ])
        if (!vivo) return
        setN({
          wa: wa?.total || 0,
          comunidade: com?.unread || 0,
          reunioes: Array.isArray(reu?.events) ? reu.events.length : 0,
          semContato: Array.isArray(spd?.leads) ? spd.leads.length : 0,
        })
      } catch {}
    }
    carregar()
    const timer = setInterval(carregar, 60_000)
    return () => { vivo = false; clearInterval(timer) }
  }, [buyerId])

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  // rótulo da página atual a partir da rota (mesmos nomes do menu)
  const paginas: Record<string, string> = {
    '/dashboard': L('Visão Geral', 'Overview', 'Visión General'),
    '/dashboard/performance': t.sidebar.performance,
    '/dashboard/calculadora': L('Calculadora', 'Calculator', 'Calculadora'),
    '/dashboard/leads': L('Meus Leads', 'My Leads', 'Mis Leads'),
    '/dashboard/pipeline': t.sidebar.pipeline,
    '/dashboard/apolices': L('Gestão de Apólices', 'Policy Management', 'Gestión de Pólizas'),
    '/dashboard/appointments': t.sidebar.appointments,
    '/dashboard/whatsapp': 'WhatsApp',
    '/dashboard/roteiro': L('Roteiro', 'Call Script', 'Guion'),
    '/dashboard/ai-consult': L('Especialista AI', 'AI Specialist', 'Especialista IA'),
    '/dashboard/templates': t.sidebar.templates,
    '/dashboard/automations': L('Automações', 'Automations', 'Automatizaciones'),
    '/dashboard/sequences': t.sidebar.sequences,
    '/dashboard/notas': L('Notas', 'Notes', 'Notas'),
    '/dashboard/community': L('Comunidade', 'Community', 'Comunidad'),
    '/dashboard/treinamento': L('Treinamento', 'Training', 'Entrenamiento'),
    '/dashboard/referral': L('Indicações', 'Referrals', 'Referidos'),
    '/dashboard/team': L('Meu Time', 'My Team', 'Mi Equipo'),
    '/dashboard/credits': L('Créditos & Planos', 'Credits & Plans', 'Créditos y Planes'),
    '/dashboard/settings': L('Configurações', 'Settings', 'Configuración'),
  }
  const chave = Object.keys(paginas).filter(k => pathname === k || (k !== '/dashboard' && pathname.startsWith(k))).sort((a, b) => b.length - a.length)[0]
  const total = n.wa + n.comunidade + n.reunioes + n.semContato

  const Item = ({ href, icone, cor, texto }: { href: string; icone: string; cor: string; texto: string }) => (
    <Link href={href} onClick={() => setAberto(false)}
      className="flex items-center gap-3 px-4 py-3 hover:opacity-80"
      style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="w-8 h-8 rounded-lg flex items-center justify-center text-[15px] flex-shrink-0" style={{ background: cor }}>{icone}</span>
      <span className="text-[13px] font-semibold" style={{ color: 'var(--fg)' }}>{texto}</span>
      <span className="ml-auto text-[13px]" style={{ color: 'var(--fg-muted)' }}>›</span>
    </Link>
  )

  return (
    <header className="hidden md:flex items-center justify-between px-6 h-[56px] sticky top-0 z-30"
      style={{ background: 'color-mix(in srgb, var(--bg) 85%, transparent)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border)' }}>
      <p className="text-[13px] font-semibold" style={{ color: 'var(--fg-secondary)' }}>
        {chave ? paginas[chave] : 'Lead4Pro'}
      </p>

      <div className="flex items-center gap-2">
        <LocaleSwitcher current={t._locale} variant="topbar" />
        {creditos !== null && (
          <Link href="/dashboard/credits"
            className="flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-xl transition-transform hover:scale-[1.03]"
            title={creditos === 0
              ? L('Sem créditos — próximo lead não chega! Clique pra recarregar', 'No credits — your next lead will not arrive! Click to top up', 'Sin créditos — ¡tu próximo lead no llega! Haz clic para recargar')
              : L('Seu saldo de leads', 'Your lead balance', 'Tu saldo de leads')}
            style={{
              background: creditos === 0 ? 'var(--err-soft)' : 'var(--bg-soft)',
              border: `1px solid ${creditos === 0 ? 'var(--err-line)' : 'var(--border)'}`,
            }}>
            <span className="text-[10px] font-extrabold uppercase" style={{ letterSpacing: '0.12em', color: creditos === 0 ? '#ef4444' : 'var(--fg-muted)' }}>
              ⚡ {L('Créditos', 'Credits', 'Créditos')}
            </span>
            <span className="text-[14px] font-extrabold" style={{ color: creditos === 0 ? '#ef4444' : 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
              {creditos}
            </span>
            <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[13px] font-extrabold text-white"
              style={{ background: 'linear-gradient(135deg, var(--accent), #8b5cf6)' }}>+</span>
          </Link>
        )}
        <Link href="/dashboard/leads"
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12.5px] font-bold text-white transition-transform hover:scale-[1.03]"
          style={{ background: 'linear-gradient(135deg, var(--accent), #8b5cf6)', boxShadow: '0 4px 14px rgba(124,58,237,0.35)' }}>
          + {L('Novo Lead', 'New Lead', 'Nuevo Lead')}
        </Link>

      <div ref={caixa} className="relative">
        <button onClick={() => setAberto(v => !v)} aria-label={L('Notificações', 'Notifications', 'Notificaciones')}
          className="relative w-9 h-9 rounded-xl flex items-center justify-center text-[16px] transition-transform hover:scale-105"
          style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)' }}>
          🔔
          {total > 0 && (
            <span className="absolute -top-1 -right-1 text-[9px] font-extrabold text-white rounded-full flex items-center justify-center"
              style={{ background: '#ef4444', minWidth: 16, height: 16, padding: '0 4px' }}>
              {total > 99 ? '99+' : total}
            </span>
          )}
        </button>

        {aberto && (
          <div className="absolute right-0 top-11 w-[320px] rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 16px 48px rgba(0,0,0,0.25)' }}>
            <p className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--fg-muted)', borderBottom: '1px solid var(--border)' }}>
              {L('Notificações', 'Notifications', 'Notificaciones')}
            </p>
            {total === 0 ? (
              <p className="px-4 py-8 text-center text-[13px]" style={{ color: 'var(--fg-muted)' }}>
                ✨ {L('Tudo em dia por aqui', 'All caught up', 'Todo al día por aquí')}
              </p>
            ) : (
              <>
                {n.semContato > 0 && <Item href="/dashboard" icone="⏱️" cor="var(--err-soft)" texto={n.semContato === 1
                  ? L('1 lead esperando o primeiro contato', '1 lead waiting for first contact', '1 lead esperando el primer contacto')
                  : L(`${n.semContato} leads esperando o primeiro contato`, `${n.semContato} leads waiting for first contact`, `${n.semContato} leads esperando el primer contacto`)} />}
                {n.wa > 0 && <Item href="/dashboard/whatsapp" icone="💬" cor="var(--ok-soft)" texto={n.wa === 1
                  ? L('1 conversa não lida no WhatsApp', '1 unread WhatsApp conversation', '1 conversación sin leer en WhatsApp')
                  : L(`${n.wa} conversas não lidas no WhatsApp`, `${n.wa} unread WhatsApp conversations`, `${n.wa} conversaciones sin leer en WhatsApp`)} />}
                {n.reunioes > 0 && <Item href="/dashboard/appointments" icone="📅" cor="var(--accent-light)" texto={n.reunioes === 1
                  ? L('1 compromisso nos próximos 90 min', '1 appointment in the next 90 min', '1 cita en los próximos 90 min')
                  : L(`${n.reunioes} compromissos nos próximos 90 min`, `${n.reunioes} appointments in the next 90 min`, `${n.reunioes} citas en los próximos 90 min`)} />}
                {n.comunidade > 0 && <Item href="/dashboard/community" icone="🤝" cor="var(--warn-soft)" texto={n.comunidade === 1
                  ? L('1 novidade na comunidade', '1 update in the community', '1 novedad en la comunidad')
                  : L(`${n.comunidade} novidades na comunidade`, `${n.comunidade} updates in the community`, `${n.comunidade} novedades en la comunidad`)} />}
              </>
            )}
          </div>
        )}
      </div>
      </div>
    </header>
  )
}
