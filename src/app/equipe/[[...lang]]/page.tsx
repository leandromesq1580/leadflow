import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

/**
 * Página pública de recrutamento: /equipe (pt) · /equipe/en · /equipe/es
 * Só afirma o que o dono confirmou: comissão a partir de 65%, CRM próprio, leads com preço diferenciado para a equipe.
 * Sem número de preço e sem promessa de ganho. Link vai nos e-mails de recrutamento (src/lib/recruit-agents.ts).
 */
type Lang = 'pt' | 'en' | 'es'
const WA = 'https://wa.me/17867442126'

const COPY: Record<Lang, {
  title: string; kicker: string; h1: string; sub: string; cta: string; wa: string
  cards: { icon: string; h: string; p: string }[]
  crmH: string; crm: string[]; howH: string; how: string[]; note: string; privacy: string; other: { href: string; label: string }[]
}> = {
  pt: {
    title: 'Venha para o time Lead4Pro',
    kicker: 'PARA AGENTES RECÉM-LICENCIADOS',
    h1: 'Sua licença de seguro de vida merece um time que entrega leads e sistema.',
    sub: 'Comissão a partir de 65%, CRM próprio e leads com preço diferenciado para quem está na nossa equipe.',
    cta: 'Quero conversar',
    wa: 'Olá! Vi a página da equipe Lead4Pro e quero conhecer os benefícios.',
    cards: [
      { icon: '💰', h: 'Comissão a partir de 65%', p: 'Você começa já com uma comissão alta sobre o que vender.' },
      { icon: '🧰', h: 'CRM próprio', p: 'Um sistema feito para o agente de seguro acompanhar cada cliente do primeiro contato ao fechamento.' },
      { icon: '🎯', h: 'Leads com preço de equipe', p: 'Quem está no time compra leads com preço diferenciado.' },
    ],
    crmH: 'O que o CRM já faz por você',
    crm: ['Funil de vendas para organizar cada cliente por etapa', 'WhatsApp integrado, com a conversa no mesmo lugar do cliente', 'Ligações pelo navegador, com gravação', 'Leads chegando direto no seu painel'],
    howH: 'Como funciona',
    how: ['Você fala com a gente (sem compromisso).', 'Explicamos as condições do time e como começar.', 'Você ganha acesso ao sistema e aos leads com preço de equipe.'],
    note: 'Condições detalhadas, incluindo seguradoras e valores dos leads, são passadas na conversa.',
    privacy: 'Privacidade',
    other: [{ href: '/equipe/en', label: 'English' }, { href: '/equipe/es', label: 'Español' }],
  },
  en: {
    title: 'Join the Lead4Pro team',
    kicker: 'FOR NEWLY LICENSED AGENTS',
    h1: 'Your life insurance license deserves a team that delivers leads and software.',
    sub: 'Commission starting at 65%, our own CRM, and team pricing on leads.',
    cta: 'Let’s talk',
    wa: 'Hi! I saw the Lead4Pro team page and I want to learn about the benefits.',
    cards: [
      { icon: '💰', h: 'Commission starting at 65%', p: 'You start with a high commission on everything you sell.' },
      { icon: '🧰', h: 'Our own CRM', p: 'A system built for insurance agents to follow each client from first contact to close.' },
      { icon: '🎯', h: 'Team pricing on leads', p: 'Team members buy leads at a special team price.' },
    ],
    crmH: 'What the CRM already does for you',
    crm: ['Sales pipeline to organize each client by stage', 'Built-in WhatsApp, with the conversation next to the client', 'Browser calling with call recording', 'Leads delivered straight to your dashboard'],
    howH: 'How it works',
    how: ['You talk to us (no commitment).', 'We explain the team terms and how to get started.', 'You get access to the system and team-priced leads.'],
    note: 'Full terms, including carriers and lead prices, are shared during the conversation.',
    privacy: 'Privacy',
    other: [{ href: '/equipe', label: 'Português' }, { href: '/equipe/es', label: 'Español' }],
  },
  es: {
    title: 'Únete al equipo Lead4Pro',
    kicker: 'PARA AGENTES RECIÉN LICENCIADOS',
    h1: 'Tu licencia de seguro de vida merece un equipo que entrega leads y sistema.',
    sub: 'Comisión desde el 65%, CRM propio y leads con precio especial para el equipo.',
    cta: 'Quiero hablar',
    wa: '¡Hola! Vi la página del equipo Lead4Pro y quiero conocer los beneficios.',
    cards: [
      { icon: '💰', h: 'Comisión desde el 65%', p: 'Empiezas con una comisión alta sobre todo lo que vendas.' },
      { icon: '🧰', h: 'CRM propio', p: 'Un sistema hecho para el agente de seguros: sigue a cada cliente desde el primer contacto hasta el cierre.' },
      { icon: '🎯', h: 'Leads con precio de equipo', p: 'Quien está en el equipo compra leads a un precio diferenciado.' },
    ],
    crmH: 'Lo que el CRM ya hace por ti',
    crm: ['Embudo de ventas para organizar cada cliente por etapa', 'WhatsApp integrado, con la conversación junto al cliente', 'Llamadas desde el navegador, con grabación', 'Leads directo en tu panel'],
    howH: 'Cómo funciona',
    how: ['Hablas con nosotros (sin compromiso).', 'Te explicamos las condiciones del equipo y cómo empezar.', 'Recibes acceso al sistema y a los leads con precio de equipo.'],
    note: 'Las condiciones completas, incluidas aseguradoras y precios de los leads, se explican en la conversación.',
    privacy: 'Privacidad',
    other: [{ href: '/equipe', label: 'Português' }, { href: '/equipe/en', label: 'English' }],
  },
}

const isLang = (s: string): s is Lang => s === 'pt' || s === 'en' || s === 'es'
const langOf = (seg?: string[]): Lang | null => (!seg || seg.length === 0 ? 'pt' : seg.length === 1 && isLang(seg[0]) && seg[0] !== 'pt' ? (seg[0] as Lang) : null)

export const dynamicParams = false
export function generateStaticParams() { return [{ lang: [] }, { lang: ['en'] }, { lang: ['es'] }] }

export async function generateMetadata({ params }: { params: Promise<{ lang?: string[] }> }): Promise<Metadata> {
  const l = langOf((await params).lang)
  return { title: l ? `${COPY[l].title} — Lead4Pro` : 'Lead4Pro', robots: { index: false, follow: false } }
}

export default async function EquipePage({ params }: { params: Promise<{ lang?: string[] }> }) {
  const lang = langOf((await params).lang)
  if (!lang) notFound()
  const t = COPY[lang]
  const link = `${WA}?text=${encodeURIComponent(t.wa)}`
  const bg = '#04060c', card = '#0b1020', line = '#1b2440', txt = '#eef1f8', mut = '#9aa5bd', accent = '#6366f1'
  return (
    <main lang={lang === 'pt' ? 'pt-BR' : lang} style={{ background: bg, color: txt, minHeight: '100vh', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '28px 20px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 }}>
          <div style={{ fontWeight: 800, fontSize: 20 }}>Lead<span style={{ color: accent }}>4Pro</span></div>
          <div style={{ fontSize: 13, display: 'flex', gap: 14 }}>{t.other.map(o => <a key={o.href} href={o.href} style={{ color: mut }}>{o.label}</a>)}</div>
        </div>

        <div style={{ color: accent, fontSize: 12, fontWeight: 700, letterSpacing: 1.5 }}>{t.kicker}</div>
        <h1 style={{ fontSize: 'clamp(28px, 6vw, 44px)', lineHeight: 1.12, fontWeight: 800, margin: '10px 0 14px' }}>{t.h1}</h1>
        <p style={{ color: mut, fontSize: 18, lineHeight: 1.5, margin: '0 0 26px' }}>{t.sub}</p>
        <a href={link} style={{ display: 'inline-block', background: accent, color: '#fff', fontWeight: 700, fontSize: 17, padding: '14px 28px', borderRadius: 14, textDecoration: 'none' }}>{t.cta} →</a>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, margin: '48px 0 36px' }}>
          {t.cards.map(c => (
            <div key={c.h} style={{ background: card, border: `1px solid ${line}`, borderRadius: 16, padding: 22 }}>
              <div style={{ fontSize: 30 }}>{c.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 18, margin: '10px 0 6px' }}>{c.h}</div>
              <div style={{ color: mut, fontSize: 15, lineHeight: 1.5 }}>{c.p}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          <section style={{ background: card, border: `1px solid ${line}`, borderRadius: 16, padding: 22 }}>
            <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>{t.crmH}</h2>
            <ul style={{ margin: 0, paddingLeft: 20, color: mut, fontSize: 15, lineHeight: 1.8 }}>{t.crm.map(x => <li key={x}>{x}</li>)}</ul>
          </section>
          <section style={{ background: card, border: `1px solid ${line}`, borderRadius: 16, padding: 22 }}>
            <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>{t.howH}</h2>
            <ol style={{ margin: 0, paddingLeft: 20, color: mut, fontSize: 15, lineHeight: 1.8 }}>{t.how.map(x => <li key={x}>{x}</li>)}</ol>
          </section>
        </div>

        <div style={{ textAlign: 'center', margin: '44px 0 18px' }}>
          <a href={link} style={{ display: 'inline-block', background: accent, color: '#fff', fontWeight: 700, fontSize: 17, padding: '14px 28px', borderRadius: 14, textDecoration: 'none' }}>{t.cta} →</a>
          <p style={{ color: mut, fontSize: 13, marginTop: 14 }}>{t.note}</p>
        </div>
        <div style={{ textAlign: 'center', fontSize: 12, color: mut, marginTop: 30 }}>© Lead4Pro · <a href="/privacy" style={{ color: mut }}>{t.privacy}</a></div>
      </div>
    </main>
  )
}
