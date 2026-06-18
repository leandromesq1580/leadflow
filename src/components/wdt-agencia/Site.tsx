import Link from 'next/link'
import type { AgenciaContent, Locale } from './content'

// Paleta WDT preservada + accent neon pra vibe tech
const C = {
  ink: '#070707',
  inkAlt: '#0E0E0E',
  surface: '#141414',
  surfaceAlt: '#1C1C1C',
  gold: '#C8A96B',
  goldLight: '#E8CC93',
  goldDeep: '#8E7642',
  neon: '#7C9AFF',       // electric blue (tech accent)
  neonAlt: '#A78BFA',    // violet
  cream: '#F5F3EE',
  white: '#FFFFFF',
  textMuted: 'rgba(245,243,238,0.62)',
  textDim: 'rgba(245,243,238,0.42)',
  border: 'rgba(201,163,91,0.18)',
  borderSoft: 'rgba(255,255,255,0.08)',
}

const CAL_URL = 'mailto:leandro@wdtgroup.com?subject=WDT%20Ag%C3%AAncia%20Digital%20%E2%80%94%20Diagn%C3%B3stico'

function getPath(locale: Locale): string {
  if (locale === 'pt') return '/wdt-agencia'
  return `/wdt-agencia/${locale}`
}

/* ============================================================
   GLOBAL STYLES (animations + glass morphism + gradient mesh)
============================================================ */
function GlobalStyles() {
  return (
    <style>{`
      @keyframes wdtaFadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes wdtaFade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes wdtaPulse { 0%,100% { opacity: 0.55; } 50% { opacity: 0.95; } }
      @keyframes wdtaGradient {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      @keyframes wdtaFloat {
        0%,100% { transform: translateY(0) translateX(0); }
        33% { transform: translateY(-12px) translateX(8px); }
        66% { transform: translateY(8px) translateX(-6px); }
      }
      .wdta-rev { opacity: 0; animation: wdtaFadeUp 0.9s cubic-bezier(0.2,0.85,0.2,1) forwards; }
      .wdta-rev-1 { animation-delay: 0.05s; }
      .wdta-rev-2 { animation-delay: 0.18s; }
      .wdta-rev-3 { animation-delay: 0.32s; }
      .wdta-rev-4 { animation-delay: 0.48s; }
      .wdta-rev-5 { animation-delay: 0.65s; }
      .wdta-pulse { animation: wdtaPulse 3.4s ease-in-out infinite; }
      .wdta-float { animation: wdtaFloat 14s ease-in-out infinite; }
      .wdta-grad-text {
        background-image: linear-gradient(135deg, #F4DEB1 0%, #E8CC93 25%, #C8A96B 55%, #8E7642 100%);
        background-clip: text; -webkit-background-clip: text;
        color: transparent; -webkit-text-fill-color: transparent;
      }
      .wdta-grad-text-neon {
        background-image: linear-gradient(135deg, #C8A96B 0%, #E8CC93 30%, #7C9AFF 70%, #A78BFA 100%);
        background-size: 200% 200%;
        background-clip: text; -webkit-background-clip: text;
        color: transparent; -webkit-text-fill-color: transparent;
        animation: wdtaGradient 8s ease infinite;
      }
      .wdta-cta-primary {
        background: linear-gradient(135deg, #E8CC93 0%, #C8A96B 50%, #8E7642 100%);
        color: #0A0A0A;
        box-shadow: 0 12px 32px rgba(201,163,91,0.35), inset 0 1px 0 rgba(255,255,255,0.3);
        transition: all 240ms cubic-bezier(0.2,0.85,0.2,1);
      }
      .wdta-cta-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 18px 44px rgba(201,163,91,0.5), inset 0 1px 0 rgba(255,255,255,0.4);
      }
      .wdta-cta-secondary {
        background: rgba(124,154,255,0.06);
        color: #E8CC93;
        border: 1px solid rgba(201,163,91,0.4);
        transition: all 240ms ease;
      }
      .wdta-cta-secondary:hover {
        background: rgba(124,154,255,0.12);
        border-color: rgba(232,204,147,0.85);
        color: #F4DEB1;
      }
      .wdta-card {
        background: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(201,163,91,0.18);
        transition: all 280ms cubic-bezier(0.2,0.85,0.2,1);
        position: relative;
      }
      .wdta-card:hover {
        border-color: rgba(232,204,147,0.55);
        transform: translateY(-4px);
        box-shadow: 0 24px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(232,204,147,0.2);
      }
      .wdta-card-neon::before {
        content: ''; position: absolute; inset: -1px; border-radius: inherit;
        background: linear-gradient(135deg, rgba(124,154,255,0.4), rgba(201,163,91,0.4), rgba(167,139,250,0.3));
        z-index: -1; opacity: 0; transition: opacity 280ms ease;
      }
      .wdta-card:hover.wdta-card-neon::before { opacity: 1; }
      .wdta-mono { font-family: var(--font-mono), 'SF Mono', Menlo, monospace; }
      .wdta-serif { font-family: var(--font-playfair), 'Playfair Display', Georgia, serif; }
      @media (prefers-reduced-motion: reduce) {
        .wdta-rev, .wdta-pulse, .wdta-float { opacity: 1 !important; animation: none !important; transform: none !important; }
      }
    `}</style>
  )
}

/* ============================================================
   BG MESH — gradient mesh animado, sutil
============================================================ */
function MeshBg({ intensity = 1 }: { intensity?: number }) {
  const o = (n: number) => Math.min(1, n * intensity)
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div
        className="absolute wdta-float"
        style={{
          top: '-15%', left: '-10%', width: '60%', height: '70%',
          background: `radial-gradient(circle, rgba(201,163,91,${o(0.14)}) 0%, transparent 60%)`,
          filter: 'blur(60px)',
        }}
      />
      <div
        className="absolute wdta-float"
        style={{
          top: '20%', right: '-15%', width: '55%', height: '70%',
          background: `radial-gradient(circle, rgba(124,154,255,${o(0.10)}) 0%, transparent 60%)`,
          filter: 'blur(70px)',
          animationDelay: '-7s',
        }}
      />
      <div
        className="absolute wdta-float"
        style={{
          bottom: '-10%', left: '20%', width: '50%', height: '60%',
          background: `radial-gradient(circle, rgba(167,139,250,${o(0.08)}) 0%, transparent 60%)`,
          filter: 'blur(80px)',
          animationDelay: '-4s',
        }}
      />
      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(201,163,91,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(201,163,91,0.04) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 80%)',
        }}
      />
    </div>
  )
}

/* ============================================================
   NAV
============================================================ */
function LangSwitcher({ locale, labels }: { locale: Locale; labels: { pt: string; en: string; es: string } }) {
  const items: Locale[] = ['pt', 'en', 'es']
  return (
    <div className="flex items-center gap-1 mr-2">
      {items.map((code, i) => (
        <span key={code} className="flex items-center">
          <Link
            href={getPath(code)}
            className="wdta-mono text-[11px] font-bold tracking-wide px-2 py-1"
            style={{
              color: locale === code ? C.gold : C.textDim,
              fontStyle: locale === code ? 'italic' : 'normal',
            }}
          >
            {labels[code]}
          </Link>
          {i < 2 && <span className="text-[10px]" style={{ color: 'rgba(201,163,91,0.3)' }}>·</span>}
        </span>
      ))}
    </div>
  )
}

function Nav({ t, locale }: { t: AgenciaContent; locale: Locale }) {
  return (
    <nav
      className="sticky top-0 z-50 backdrop-blur-xl"
      style={{
        background: 'rgba(7,7,7,0.78)',
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-10 flex items-center justify-between h-16 lg:h-20">
        <Link href={getPath(locale)} className="flex items-center gap-3" style={{ color: C.cream }}>
          {/* Logo: W mark gold + texto */}
          <span
            className="inline-flex items-center justify-center"
            style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'linear-gradient(135deg, #1A1A1A 0%, #2A2A2A 100%)',
              border: '1px solid rgba(201,163,91,0.4)',
            }}
          >
            <span className="wdta-serif font-bold" style={{ color: C.gold, fontSize: 18 }}>W</span>
          </span>
          <span className="flex flex-col leading-none">
            <span className="wdta-mono text-[10px] font-bold tracking-[0.32em]" style={{ color: C.gold }}>WDT AGÊNCIA</span>
            <span className="wdta-mono text-[9px] tracking-[0.28em] mt-1" style={{ color: C.textDim }}>DIGITAL · BY WDT GROUP</span>
          </span>
        </Link>
        <div className="flex items-center gap-3 lg:gap-6">
          <Link href="#manifesto" className="hidden md:inline text-[13px] font-medium tracking-wide" style={{ color: C.textMuted }}>{t.nav.manifesto}</Link>
          <Link href="#produtos" className="hidden md:inline text-[13px] font-medium tracking-wide" style={{ color: C.textMuted }}>{t.nav.products}</Link>
          <Link href="#diferenca" className="hidden md:inline text-[13px] font-medium tracking-wide" style={{ color: C.textMuted }}>{t.nav.diff}</Link>
          <Link href="#processo" className="hidden md:inline text-[13px] font-medium tracking-wide" style={{ color: C.textMuted }}>{t.nav.process}</Link>
          <LangSwitcher locale={locale} labels={t.nav.lang} />
          <Link
            href={CAL_URL}
            className="wdta-cta-primary inline-flex items-center gap-2 text-[12px] font-bold tracking-wider px-4 py-2.5 rounded-lg"
          >
            {t.nav.cta} →
          </Link>
        </div>
      </div>
    </nav>
  )
}

/* ============================================================
   HERO
============================================================ */
function Hero({ t }: { t: AgenciaContent }) {
  return (
    <section className="relative overflow-hidden" style={{ background: C.ink }}>
      <MeshBg />
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 pt-20 lg:pt-32 pb-24 lg:pb-36">
        {/* Badge */}
        <div className="flex justify-center wdta-rev wdta-rev-1">
          <div
            className="inline-flex items-center gap-3 px-4 py-2 rounded-full"
            style={{ background: 'rgba(201,163,91,0.08)', border: `1px solid ${C.border}` }}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full wdta-pulse" style={{ background: C.gold }} />
            <span className="wdta-mono text-[10px] font-bold tracking-[0.28em]" style={{ color: C.gold }}>
              {t.hero.badge}
            </span>
          </div>
        </div>

        {/* Eyebrow */}
        <div className="mt-12 flex justify-center wdta-rev wdta-rev-2">
          <span className="wdta-mono text-[11px] font-bold tracking-[0.4em]" style={{ color: C.neon }}>
            {t.hero.eyebrow}
          </span>
        </div>

        {/* Headline */}
        <h1
          className="mt-8 text-center wdta-serif wdta-rev wdta-rev-2"
          style={{
            color: C.cream,
            fontWeight: 600,
            fontSize: 'clamp(2.2rem, 6vw, 5.2rem)',
            lineHeight: 1.02,
            letterSpacing: '-0.025em',
            maxWidth: '20ch',
            margin: '32px auto 0',
          }}
        >
          {t.hero.h1Pre}{' '}
          <span className="wdta-grad-text-neon italic">{t.hero.h1Accent}</span>
          {t.hero.h1Post}
        </h1>

        {/* Sub */}
        <p
          className="mt-8 mx-auto text-center wdta-rev wdta-rev-3"
          style={{
            color: C.textMuted,
            fontSize: 'clamp(1rem, 1.3vw, 1.2rem)',
            lineHeight: 1.6,
            maxWidth: '58ch',
          }}
        >
          {t.hero.sub}
        </p>

        {/* CTAs */}
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4 wdta-rev wdta-rev-4">
          <Link
            href={CAL_URL}
            className="wdta-cta-primary inline-flex items-center justify-center gap-3 px-7 py-4 rounded-xl wdta-mono text-[12px] font-bold tracking-[0.18em] uppercase"
            style={{ minWidth: 280 }}
          >
            {t.hero.ctaPrimary} <span style={{ fontSize: 16 }}>→</span>
          </Link>
          <Link
            href="#produtos"
            className="wdta-cta-secondary inline-flex items-center justify-center gap-3 px-7 py-4 rounded-xl wdta-mono text-[12px] font-bold tracking-[0.18em] uppercase"
            style={{ minWidth: 220 }}
          >
            {t.hero.ctaSecondary}
          </Link>
        </div>

        {/* Stats line */}
        <div
          className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-px overflow-hidden rounded-2xl wdta-rev wdta-rev-5"
          style={{ background: C.border }}
        >
          {[
            { n: t.hero.stat1n, l: t.hero.stat1l },
            { n: t.hero.stat2n, l: t.hero.stat2l },
            { n: t.hero.stat3n, l: t.hero.stat3l },
          ].map((s, i) => (
            <div key={i} className="p-8 wdta-card" style={{ borderRadius: 0 }}>
              <div className="flex items-baseline gap-4">
                <span
                  className="wdta-serif font-bold wdta-grad-text"
                  style={{ fontSize: 'clamp(2.4rem, 4vw, 3.6rem)', lineHeight: 1, fontStyle: 'italic' }}
                >
                  {s.n}
                </span>
                <div className="flex-1">
                  <p style={{ color: C.textMuted, fontSize: 13, lineHeight: 1.5 }}>{s.l}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ============================================================
   TRIGGER — "Seu concorrente já implementou IA"
============================================================ */
function Trigger({ t }: { t: AgenciaContent }) {
  return (
    <section className="relative overflow-hidden" style={{ background: C.inkAlt }}>
      <MeshBg intensity={0.5} />
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div className="flex items-center gap-3 mb-6">
          <span className="inline-block w-8 h-px" style={{ background: C.neon }} />
          <span className="wdta-mono text-[10px] font-bold tracking-[0.4em]" style={{ color: C.neon }}>
            {t.trigger.eyebrow}
          </span>
        </div>
        <h2
          className="wdta-serif"
          style={{
            color: C.cream,
            fontWeight: 600,
            fontSize: 'clamp(2rem, 4.4vw, 3.8rem)',
            lineHeight: 1.05,
            letterSpacing: '-0.018em',
            maxWidth: '24ch',
          }}
        >
          {t.trigger.h2Pre}
          <span className="wdta-grad-text italic">{t.trigger.h2Accent}</span>
          {t.trigger.h2Post}
        </h2>
        <p className="mt-6 max-w-3xl" style={{ color: C.textMuted, fontSize: 18, lineHeight: 1.6, fontStyle: 'italic' }}>
          {t.trigger.sub}
        </p>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          {t.trigger.points.map((p, i) => (
            <article key={i} className="wdta-card wdta-card-neon p-8 rounded-2xl" style={{ minHeight: 240 }}>
              <div
                className="wdta-serif font-bold wdta-grad-text-neon"
                style={{ fontSize: 'clamp(2.8rem, 4.2vw, 4rem)', lineHeight: 1, fontStyle: 'italic' }}
              >
                {p.kicker}
              </div>
              <p className="mt-5" style={{ color: C.cream, fontSize: 15.5, lineHeight: 1.55, fontWeight: 500 }}>
                {p.t}
              </p>
              <p className="mt-4" style={{ color: C.textDim, fontSize: 12.5, lineHeight: 1.5, fontStyle: 'italic' }}>
                {p.d}
              </p>
            </article>
          ))}
        </div>

        <div
          className="mt-16 p-8 lg:p-10 rounded-2xl wdta-card"
          style={{ borderColor: 'rgba(201,163,91,0.4)', background: 'linear-gradient(135deg, rgba(201,163,91,0.06) 0%, rgba(124,154,255,0.04) 100%)' }}
        >
          <p
            className="wdta-serif text-center"
            style={{ color: C.cream, fontSize: 'clamp(1.2rem, 2vw, 1.6rem)', fontStyle: 'italic', lineHeight: 1.4, fontWeight: 500 }}
          >
            {t.trigger.closing}
          </p>
        </div>
      </div>
    </section>
  )
}

/* ============================================================
   MANIFESTO
============================================================ */
function Manifesto({ t }: { t: AgenciaContent }) {
  return (
    <section id="manifesto" className="relative" style={{ background: C.ink }}>
      <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div className="flex items-center gap-3 mb-6">
          <span className="inline-block w-8 h-px" style={{ background: C.gold }} />
          <span className="wdta-mono text-[10px] font-bold tracking-[0.4em]" style={{ color: C.gold }}>
            {t.manifesto.eyebrow}
          </span>
        </div>
        <h2
          className="wdta-serif"
          style={{
            color: C.cream,
            fontWeight: 600,
            fontSize: 'clamp(2rem, 4.4vw, 3.8rem)',
            lineHeight: 1.05,
            letterSpacing: '-0.018em',
            maxWidth: '24ch',
          }}
        >
          {t.manifesto.h2}
          <span className="wdta-grad-text italic">{t.manifesto.h2Accent}</span>.
        </h2>

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-8">
          <p style={{ color: C.textMuted, fontSize: 16, lineHeight: 1.75 }} dangerouslySetInnerHTML={{ __html: t.manifesto.p1 }} />
          <p style={{ color: C.textMuted, fontSize: 16, lineHeight: 1.75 }} dangerouslySetInnerHTML={{ __html: t.manifesto.p2 }} />
          <p style={{ color: C.cream, fontSize: 16, lineHeight: 1.75 }} dangerouslySetInnerHTML={{ __html: t.manifesto.p3 }} />
        </div>
      </div>
    </section>
  )
}

/* ============================================================
   PRODUCTS
============================================================ */
function Products({ t }: { t: AgenciaContent }) {
  return (
    <section id="produtos" className="relative overflow-hidden" style={{ background: C.inkAlt }}>
      <MeshBg intensity={0.6} />
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-16">
          <div className="lg:col-span-7">
            <div className="flex items-center gap-3 mb-6">
              <span className="inline-block w-8 h-px" style={{ background: C.gold }} />
              <span className="wdta-mono text-[10px] font-bold tracking-[0.4em]" style={{ color: C.gold }}>
                {t.products.eyebrow}
              </span>
            </div>
            <h2
              className="wdta-serif"
              style={{
                color: C.cream,
                fontWeight: 600,
                fontSize: 'clamp(2rem, 4.4vw, 3.6rem)',
                lineHeight: 1.05,
                letterSpacing: '-0.018em',
              }}
            >
              {t.products.h2}
              <span className="wdta-grad-text-neon italic">{t.products.h2Accent}</span>.
            </h2>
          </div>
          <div className="lg:col-span-5 lg:pt-2">
            <p style={{ color: C.textMuted, fontSize: 17, lineHeight: 1.65 }}>{t.products.sub}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {t.products.items.map((p) => (
            <article key={p.name} className="wdta-card wdta-card-neon p-7 rounded-2xl flex flex-col" style={{ minHeight: 380 }}>
              <div className="flex items-center justify-between mb-6">
                <span
                  className="wdta-mono text-[9.5px] font-bold tracking-[0.32em] px-2.5 py-1 rounded"
                  style={{
                    color: p.tag.includes('PLAT') ? C.neon : C.gold,
                    background: p.tag.includes('PLAT') ? 'rgba(124,154,255,0.1)' : 'rgba(201,163,91,0.1)',
                    border: `1px solid ${p.tag.includes('PLAT') ? 'rgba(124,154,255,0.3)' : 'rgba(201,163,91,0.3)'}`,
                  }}
                >
                  {p.tag}
                </span>
                <span
                  className="wdta-mono text-[9px] font-bold tracking-[0.28em] flex items-center gap-1.5"
                  style={{ color: C.textDim }}
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full wdta-pulse" style={{ background: '#5BE49B' }} />
                  LIVE
                </span>
              </div>
              <h3
                className="wdta-serif"
                style={{ color: C.cream, fontWeight: 700, fontSize: 28, lineHeight: 1.1, letterSpacing: '-0.012em' }}
              >
                {p.name}
              </h3>
              <p className="mt-3 wdta-serif italic" style={{ color: C.gold, fontSize: 15, lineHeight: 1.4 }}>
                {p.tagline}
              </p>
              <p className="mt-5" style={{ color: C.textMuted, fontSize: 14, lineHeight: 1.65 }}>{p.desc}</p>
              <ul className="mt-5 space-y-2">
                {p.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-3" style={{ color: C.cream, fontSize: 13 }}>
                    <span className="mt-[8px] inline-block flex-shrink-0" style={{ width: 4, height: 4, background: C.gold, borderRadius: 1 }} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <div className="flex-1" />
              <Link
                href={p.href}
                className="mt-6 inline-flex items-center gap-2 wdta-mono text-[11px] font-bold tracking-[0.2em] uppercase"
                style={{ color: C.goldLight }}
              >
                {t.products.cta} <span style={{ fontSize: 14 }}>→</span>
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ============================================================
   DIFF — comparison table
============================================================ */
function Diff({ t }: { t: AgenciaContent }) {
  return (
    <section id="diferenca" className="relative" style={{ background: C.ink }}>
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div className="flex items-center gap-3 mb-6">
          <span className="inline-block w-8 h-px" style={{ background: C.gold }} />
          <span className="wdta-mono text-[10px] font-bold tracking-[0.4em]" style={{ color: C.gold }}>
            {t.diff.eyebrow}
          </span>
        </div>
        <h2
          className="wdta-serif mb-16"
          style={{
            color: C.cream,
            fontWeight: 600,
            fontSize: 'clamp(2rem, 4.4vw, 3.6rem)',
            lineHeight: 1.05,
            letterSpacing: '-0.018em',
            maxWidth: '24ch',
          }}
        >
          {t.diff.h2}
          <span className="wdta-grad-text italic">{t.diff.h2Accent}</span>.
        </h2>

        <div
          className="grid grid-cols-1 lg:grid-cols-12 gap-0 rounded-2xl overflow-hidden"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="lg:col-span-5 px-7 py-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <span className="wdta-mono text-[10px] font-bold tracking-[0.3em]" style={{ color: C.textDim }}>
              {t.diff.headerThem}
            </span>
          </div>
          <div className="lg:col-span-2 hidden lg:block" style={{ background: 'rgba(255,255,255,0.01)', borderLeft: `1px solid ${C.borderSoft}`, borderRight: `1px solid ${C.borderSoft}` }} />
          <div className="lg:col-span-5 px-7 py-5" style={{ background: 'rgba(201,163,91,0.08)', borderLeft: `1px solid ${C.border}` }}>
            <span className="wdta-mono text-[10px] font-bold tracking-[0.3em]" style={{ color: C.gold }}>
              {t.diff.headerUs}
            </span>
          </div>

          {t.diff.rows.map((r, i) => (
            <div key={i} className="contents">
              <div
                className="lg:col-span-5 px-7 py-6 flex items-center"
                style={{ borderTop: `1px solid ${C.borderSoft}`, color: C.textMuted, fontSize: 14.5, lineHeight: 1.5 }}
              >
                <div>
                  <div className="wdta-mono text-[9.5px] font-bold tracking-[0.3em] mb-2" style={{ color: C.textDim }}>
                    {r.feature}
                  </div>
                  <div>{r.them}</div>
                </div>
              </div>
              <div
                className="lg:col-span-2 hidden lg:flex items-center justify-center"
                style={{ borderTop: `1px solid ${C.borderSoft}`, borderLeft: `1px solid ${C.borderSoft}`, borderRight: `1px solid ${C.borderSoft}` }}
              >
                <span className="wdta-serif italic" style={{ color: C.gold, fontSize: 18 }}>vs.</span>
              </div>
              <div
                className="lg:col-span-5 px-7 py-6 flex items-center"
                style={{ borderTop: `1px solid ${C.borderSoft}`, borderLeft: `1px solid ${C.border}`, background: 'rgba(201,163,91,0.03)', color: C.cream, fontSize: 14.5, lineHeight: 1.5 }}
              >
                <div>
                  <div className="wdta-mono text-[9.5px] font-bold tracking-[0.3em] mb-2" style={{ color: C.gold }}>
                    {r.feature}
                  </div>
                  <div className="wdta-serif italic font-medium" style={{ fontSize: 16 }}>{r.us}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ============================================================
   PROCESS
============================================================ */
function Process({ t }: { t: AgenciaContent }) {
  return (
    <section id="processo" className="relative overflow-hidden" style={{ background: C.inkAlt }}>
      <MeshBg intensity={0.5} />
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div className="flex items-center gap-3 mb-6">
          <span className="inline-block w-8 h-px" style={{ background: C.gold }} />
          <span className="wdta-mono text-[10px] font-bold tracking-[0.4em]" style={{ color: C.gold }}>
            {t.process.eyebrow}
          </span>
        </div>
        <h2
          className="wdta-serif mb-16"
          style={{
            color: C.cream,
            fontWeight: 600,
            fontSize: 'clamp(2rem, 4.4vw, 3.6rem)',
            lineHeight: 1.05,
            letterSpacing: '-0.018em',
            maxWidth: '22ch',
          }}
        >
          {t.process.h2}
          <span className="wdta-grad-text italic">{t.process.h2Accent}</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {t.process.steps.map((s) => (
            <article key={s.n} className="wdta-card p-7 rounded-2xl flex flex-col" style={{ minHeight: 280 }}>
              <span
                className="wdta-serif italic font-bold wdta-grad-text"
                style={{ fontSize: 56, lineHeight: 1 }}
              >
                {s.n}
              </span>
              <h3
                className="wdta-serif mt-5"
                style={{ color: C.cream, fontWeight: 700, fontSize: 22, lineHeight: 1.15, letterSpacing: '-0.012em' }}
              >
                {s.t}
              </h3>
              <p className="mt-3" style={{ color: C.textMuted, fontSize: 14, lineHeight: 1.65 }}>{s.d}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ============================================================
   PROOF
============================================================ */
function Proof({ t }: { t: AgenciaContent }) {
  return (
    <section className="relative" style={{ background: C.ink }}>
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div className="flex items-center gap-3 mb-6">
          <span className="inline-block w-8 h-px" style={{ background: C.gold }} />
          <span className="wdta-mono text-[10px] font-bold tracking-[0.4em]" style={{ color: C.gold }}>
            {t.proof.eyebrow}
          </span>
        </div>
        <h2
          className="wdta-serif mb-16"
          style={{
            color: C.cream,
            fontWeight: 600,
            fontSize: 'clamp(2rem, 4.4vw, 3.6rem)',
            lineHeight: 1.05,
            letterSpacing: '-0.018em',
            maxWidth: '22ch',
          }}
        >
          {t.proof.h2}
          <span className="wdta-grad-text italic">{t.proof.h2Accent}</span>
        </h2>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          {t.proof.stats.map((s, i) => (
            <div key={i} className="wdta-card p-7 rounded-2xl">
              <div
                className="wdta-serif italic font-bold wdta-grad-text"
                style={{ fontSize: 'clamp(2.4rem, 4vw, 3.4rem)', lineHeight: 1 }}
              >
                {s.v}
              </div>
              <p className="mt-4" style={{ color: C.textMuted, fontSize: 13, lineHeight: 1.55 }}>{s.l}</p>
            </div>
          ))}
        </div>

        <blockquote
          className="wdta-serif italic mx-auto"
          style={{
            color: C.cream,
            fontSize: 'clamp(1.3rem, 2.4vw, 1.9rem)',
            lineHeight: 1.45,
            fontWeight: 500,
            maxWidth: '64ch',
          }}
        >
          <span className="wdta-grad-text" style={{ fontSize: '1.4em', lineHeight: 0, marginRight: 8, position: 'relative', top: '0.2em' }}>❝</span>
          <span dangerouslySetInnerHTML={{ __html: t.proof.quote }} />
        </blockquote>
        <div className="flex items-center gap-5 mt-10">
          <span
            className="inline-flex items-center justify-center wdta-serif italic font-bold"
            style={{ width: 64, height: 64, borderRadius: 12, background: 'linear-gradient(135deg, #1A1A1A, #2A2A2A)', border: `1px solid ${C.border}`, color: C.gold, fontSize: 22 }}
          >
            AS
          </span>
          <div>
            <div className="wdta-serif" style={{ color: C.cream, fontSize: 18, fontWeight: 600 }}>{t.proof.author}</div>
            <div className="wdta-mono text-[11px] font-bold tracking-[0.24em] mt-1" style={{ color: C.gold }}>{t.proof.role}</div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ============================================================
   CTA
============================================================ */
function CTASection({ t }: { t: AgenciaContent }) {
  return (
    <section id="contato" className="relative overflow-hidden" style={{ background: C.inkAlt }}>
      <MeshBg />
      <div className="relative z-10 max-w-5xl mx-auto px-6 lg:px-10 py-28 lg:py-36 text-center">
        <div className="flex items-center justify-center gap-3 mb-6">
          <span className="inline-block w-8 h-px" style={{ background: C.gold }} />
          <span className="wdta-mono text-[10px] font-bold tracking-[0.4em]" style={{ color: C.gold }}>
            {t.cta.eyebrow}
          </span>
          <span className="inline-block w-8 h-px" style={{ background: C.gold }} />
        </div>
        <h2
          className="wdta-serif"
          style={{
            color: C.cream,
            fontWeight: 600,
            fontSize: 'clamp(2.2rem, 5vw, 4.4rem)',
            lineHeight: 1.05,
            letterSpacing: '-0.022em',
          }}
        >
          {t.cta.h2}
          <span className="wdta-grad-text-neon italic">{t.cta.h2Accent}</span>.
        </h2>
        <p className="mt-8 mx-auto" style={{ color: C.textMuted, fontSize: 18, lineHeight: 1.65, maxWidth: '60ch' }}>
          {t.cta.sub}
        </p>
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href={CAL_URL}
            className="wdta-cta-primary inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl wdta-mono text-[12px] font-bold tracking-[0.18em] uppercase"
            style={{ minWidth: 280 }}
          >
            {t.cta.primary} <span style={{ fontSize: 16 }}>→</span>
          </Link>
          <Link
            href="#produtos"
            className="wdta-cta-secondary inline-flex items-center justify-center gap-3 px-7 py-4 rounded-xl wdta-mono text-[12px] font-bold tracking-[0.18em] uppercase"
          >
            {t.cta.secondary}
          </Link>
        </div>
        <p className="mt-8 wdta-mono text-[11px] tracking-[0.24em]" style={{ color: C.textDim }}>
          {t.cta.or} <a href={`mailto:${t.cta.email}`} style={{ color: C.goldLight }}>{t.cta.email}</a>
        </p>
      </div>
    </section>
  )
}

/* ============================================================
   FOOTER
============================================================ */
function Footer({ t, locale }: { t: AgenciaContent; locale: Locale }) {
  return (
    <footer style={{ background: '#050505', borderTop: `1px solid ${C.border}` }}>
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-14">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-10">
          <div className="md:col-span-5">
            <Link href={getPath(locale)} className="flex items-center gap-3 mb-5">
              <span
                className="inline-flex items-center justify-center"
                style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #1A1A1A 0%, #2A2A2A 100%)', border: `1px solid ${C.border}` }}
              >
                <span className="wdta-serif font-bold" style={{ color: C.gold, fontSize: 20 }}>W</span>
              </span>
              <span className="flex flex-col leading-none">
                <span className="wdta-mono text-[11px] font-bold tracking-[0.3em]" style={{ color: C.gold }}>WDT AGÊNCIA</span>
                <span className="wdta-mono text-[9px] tracking-[0.26em] mt-1" style={{ color: C.textDim }}>DIGITAL · BY WDT GROUP</span>
              </span>
            </Link>
            <p className="max-w-md" style={{ color: C.textMuted, fontSize: 13.5, lineHeight: 1.7 }}>{t.footer.tagline}</p>
            <div className="flex items-center gap-1 mt-6">
              {(['pt', 'en', 'es'] as Locale[]).map((code, i) => (
                <span key={code} className="flex items-center">
                  <Link
                    href={getPath(code)}
                    className="wdta-mono text-[11px] font-bold tracking-wide px-2 py-1"
                    style={{
                      color: locale === code ? C.gold : C.textDim,
                      fontStyle: locale === code ? 'italic' : 'normal',
                    }}
                  >
                    {code.toUpperCase()}
                  </Link>
                  {i < 2 && <span style={{ color: 'rgba(201,163,91,0.3)' }} className="text-[10px]">·</span>}
                </span>
              ))}
            </div>
          </div>
          <div className="md:col-span-3">
            <span className="wdta-mono text-[11px] font-bold tracking-[0.24em] block mb-4" style={{ color: C.gold }}>{t.footer.mapTitle}</span>
            <ul className="space-y-3 text-[13px]" style={{ color: C.textMuted }}>
              <li><Link href="#manifesto">{t.nav.manifesto}</Link></li>
              <li><Link href="#produtos">{t.nav.products}</Link></li>
              <li><Link href="#diferenca">{t.nav.diff}</Link></li>
              <li><Link href="#processo">{t.nav.process}</Link></li>
              <li><Link href="#contato">{t.nav.cta}</Link></li>
            </ul>
          </div>
          <div className="md:col-span-4">
            <span className="wdta-mono text-[11px] font-bold tracking-[0.24em] block mb-4" style={{ color: C.gold }}>{t.footer.contactTitle}</span>
            <ul className="space-y-3 text-[13px]" style={{ color: C.textMuted }}>
              {t.footer.contactItems.map((it, i) => (
                <li key={i} style={i === 0 ? { color: C.cream } : {}}>{it}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex flex-col md:flex-row md:justify-between gap-3 pt-6 wdta-mono text-[10.5px] uppercase tracking-[0.24em]" style={{ borderTop: `1px solid ${C.borderSoft}`, color: C.textDim }}>
          <span>{t.footer.rights}</span>
          <span className="wdta-serif italic normal-case tracking-[0.04em]" style={{ color: C.gold }}>{t.footer.values}</span>
        </div>
      </div>
    </footer>
  )
}

/* ============================================================
   ROOT
============================================================ */
export default function WdtAgenciaSite({ t, locale }: { t: AgenciaContent; locale: Locale }) {
  return (
    <main
      className="overflow-x-hidden"
      style={{
        background: C.ink,
        color: C.cream,
        fontFamily: 'var(--font-inter), system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <GlobalStyles />
      <Nav t={t} locale={locale} />
      <Hero t={t} />
      <Trigger t={t} />
      <Manifesto t={t} />
      <Products t={t} />
      <Diff t={t} />
      <Process t={t} />
      <Proof t={t} />
      <CTASection t={t} />
      <Footer t={t} locale={locale} />
    </main>
  )
}
