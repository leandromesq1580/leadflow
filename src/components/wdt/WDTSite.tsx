import Link from 'next/link'
import type { Locale, WDTContent } from './content'
import WDTLogo from './WDTLogo'

// Paleta oficial WDT USA GROUP — Brand Guide
const C = {
  ink: '#0D0D0D',           // Preto profundo (oficial)
  navy: '#1A1A1A',          // Grafite (oficial)
  gold: '#C8A96B',          // Champagne gold (oficial)
  goldLight: '#E2CB9A',
  goldDeep: '#8E7642',
  cream: '#F5F3EE',         // Off-white (oficial)
  paper: '#FFFFFF',
  bg: '#FAFAF7',
  bgAlt: '#EFEDE6',
  border: '#E5E2D9',
  textDark: '#0D0D0D',
  textMid: '#4A4A4A',       // Cinza aço (oficial)
  textMuted: '#8E8E8E',
  textLightMuted: '#C7C5BF',
}

function getPath(locale: Locale): string {
  if (locale === 'pt') return '/wdtgroup'
  return `/wdtgroup/${locale}`
}

function LangSwitcher({ locale }: { locale: Locale }) {
  const items: { code: Locale; label: string }[] = [
    { code: 'pt', label: 'PT' },
    { code: 'en', label: 'EN' },
    { code: 'es', label: 'ES' },
  ]
  return (
    <div className="flex items-center gap-1 mr-2">
      {items.map((it, i) => (
        <span key={it.code} className="flex items-center">
          <Link
            href={getPath(it.code)}
            className="text-[11px] font-bold tracking-wide px-2 py-1"
            style={{
              color: locale === it.code ? C.gold : C.textLightMuted,
              fontStyle: locale === it.code ? 'italic' : 'normal',
              fontFamily: locale === it.code ? 'Georgia, serif' : 'inherit',
            }}
          >
            {it.label}
          </Link>
          {i < items.length - 1 && (
            <span style={{ color: 'rgba(201,163,91,0.3)' }} className="text-[10px]">·</span>
          )}
        </span>
      ))}
    </div>
  )
}

function Nav({ t, locale }: { t: WDTContent; locale: Locale }) {
  const home = getPath(locale)
  return (
    <nav
      className="sticky top-0 z-50 backdrop-blur-md"
      style={{ background: 'rgba(15,23,42,0.92)', borderBottom: `1px solid rgba(201,163,91,0.15)` }}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-10 flex items-center justify-between h-20 lg:h-[104px]">
        <Link href={home} className="flex items-center" style={{ color: C.paper }} aria-label="WDT USA GROUP">
          <WDTLogo
            variant="full"
            inkColor={C.cream}
            goldColor={C.gold}
            style={{ height: 'clamp(64px, 8vw, 92px)', width: 'auto', display: 'block' }}
          />
        </Link>
        <div className="flex items-center gap-2 lg:gap-6">
          <Link href="#manifesto" className="hidden md:inline text-[13px] font-medium tracking-wide" style={{ color: C.textLightMuted }}>{t.nav.manifesto}</Link>
          <Link href="#servicos" className="hidden md:inline text-[13px] font-medium tracking-wide" style={{ color: C.textLightMuted }}>{t.nav.services}</Link>
          <Link href="#diferenca" className="hidden md:inline text-[13px] font-medium tracking-wide" style={{ color: C.textLightMuted }}>{t.nav.differential}</Link>
          <Link href="#parceria" className="hidden md:inline text-[13px] font-medium tracking-wide" style={{ color: C.textLightMuted }}>{t.nav.partnership}</Link>
          <LangSwitcher locale={locale} />
          <Link href="#contato" className="text-[13px] font-bold px-5 py-2.5 rounded-md tracking-wide"
            style={{ background: C.gold, color: C.ink, boxShadow: '0 4px 16px rgba(201,163,91,0.25)' }}>
            {t.nav.cta}
          </Link>
        </div>
      </div>
    </nav>
  )
}

function Hero({ t }: { t: WDTContent }) {
  // Editorial Boardroom — Bloomberg Businessweek meets Carlyle Group annual report.
  // One cinematic image, magazine-grade typography, restrained palette, editorial markings.
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background: C.ink,
        // Use system + Georgia stack — restrained, editorial, no display-font import.
        fontFamily: 'Georgia, "Times New Roman", serif',
      }}
    >
      <style>{`
        @keyframes wdtFadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes wdtFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes wdtScaleIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes wdtSlideRight {
          from { opacity: 0; transform: translateX(-12px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes wdtMarqueeShimmer {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 0.85; }
        }
        .wdt-rev { opacity: 0; animation: wdtFadeUp 1.05s cubic-bezier(0.2, 0.85, 0.2, 1) forwards; }
        .wdt-rev-1 { animation-delay: 0.05s; }
        .wdt-rev-2 { animation-delay: 0.20s; }
        .wdt-rev-3 { animation-delay: 0.40s; }
        .wdt-rev-4 { animation-delay: 0.60s; }
        .wdt-rev-5 { animation-delay: 0.80s; }
        .wdt-rev-6 { animation-delay: 1.00s; }
        .wdt-img { opacity: 0; animation: wdtFade 1.6s cubic-bezier(0.2, 0.85, 0.2, 1) forwards; animation-delay: 0.05s; }
        .wdt-num { opacity: 0; animation: wdtScaleIn 1s cubic-bezier(0.2, 0.85, 0.2, 1) forwards; }
        .wdt-line { opacity: 0; animation: wdtSlideRight 0.8s cubic-bezier(0.2, 0.85, 0.2, 1) forwards; }
        .wdt-pulse { animation: wdtMarqueeShimmer 4s ease-in-out infinite; }
        .wdt-cta-primary {
          transition: transform 220ms cubic-bezier(0.2, 0.85, 0.2, 1), box-shadow 220ms ease;
        }
        .wdt-cta-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 18px 48px rgba(201,163,91,0.55), inset 0 1px 0 rgba(255,255,255,0.4);
        }
        .wdt-cta-secondary {
          transition: border-color 220ms ease, color 220ms ease, background 220ms ease;
        }
        .wdt-cta-secondary:hover {
          border-color: rgba(232,204,147,0.85);
          color: ${C.goldLight};
          background: rgba(201,163,91,0.06);
        }
        .wdt-num-line {
          transition: padding-left 320ms cubic-bezier(0.2, 0.85, 0.2, 1), color 220ms ease;
        }
        .wdt-num-line:hover {
          padding-left: 16px;
        }
        .wdt-num-line:hover .wdt-num-arrow {
          opacity: 1;
          transform: translateX(0);
        }
        .wdt-num-arrow {
          opacity: 0;
          transform: translateX(-6px);
          transition: opacity 220ms ease, transform 220ms ease;
        }
        @media (prefers-reduced-motion: reduce) {
          .wdt-rev, .wdt-img, .wdt-num, .wdt-line, .wdt-pulse {
            opacity: 1 !important;
            transform: none !important;
            animation: none !important;
          }
        }
      `}</style>

      {/* ============================================================
          CINEMATIC BACKGROUND — duotone treated photograph
      ============================================================ */}
      {/* The photograph itself */}
      <div
        className="absolute inset-0 pointer-events-none wdt-img"
        style={{
          backgroundImage:
            'url("https://images.unsplash.com/photo-1486325212027-8081e485255e?auto=format&fit=crop&w=2400&q=80")',
          backgroundSize: 'cover',
          backgroundPosition: 'center 35%',
          // Heavy duotone — desaturated, slight warmth
          filter: 'grayscale(0.55) contrast(1.15) brightness(0.55)',
          opacity: 0.4,
        }}
      />

      {/* Ink wash — vertical depth */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, rgba(10,15,28,0.55) 0%, rgba(15,23,42,0.78) 55%, rgba(10,15,28,0.96) 100%)',
        }}
      />

      {/* Single warm gold beam — the only colored light source */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 1100px 700px at 78% 18%, rgba(232,204,147,0.18) 0%, rgba(201,163,91,0.08) 30%, transparent 60%)',
        }}
      />

      {/* Fine grain — paper / printed feel */}
      <div
        className="absolute inset-0 pointer-events-none mix-blend-overlay"
        style={{
          opacity: 0.28,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 220 220' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.92' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Vertical guide rules — manuscript paper editorial feel */}
      <div className="absolute inset-0 pointer-events-none hidden lg:block" aria-hidden>
        <div
          className="absolute top-0 bottom-0"
          style={{ left: '50%', width: 1, background: 'rgba(201,163,91,0.06)' }}
        />
        <div
          className="absolute top-0 bottom-0"
          style={{ left: '12.5%', width: 1, background: 'rgba(201,163,91,0.04)' }}
        />
        <div
          className="absolute top-0 bottom-0"
          style={{ left: '87.5%', width: 1, background: 'rgba(201,163,91,0.04)' }}
        />
      </div>

      {/* Brand side rail */}
      <div
        className="absolute left-0 top-0 bottom-0 z-10"
        style={{ width: 6, background: C.gold }}
      />

      {/* ============================================================
          EDITORIAL MASTHEAD (top bar) — magazine cover marking
      ============================================================ */}
      <div className="relative z-20 border-b" style={{ borderColor: 'rgba(201,163,91,0.18)' }}>
        <div
          className="max-w-[1380px] mx-auto px-6 lg:px-12 flex items-center justify-between"
          style={{ height: 44 }}
        >
          <div className="flex items-center gap-3 wdt-rev wdt-rev-1">
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: C.gold,
              }}
              className="wdt-pulse"
            />
            <span
              style={{
                fontFamily: '"SF Mono", "Menlo", "Consolas", monospace',
                fontSize: 10,
                letterSpacing: '0.32em',
                color: C.cream,
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              WDT USA GROUP <span style={{ color: C.gold, margin: '0 8px' }}>—</span> Institutional Statement
            </span>
          </div>
          <div
            className="hidden md:flex items-center gap-5 wdt-rev wdt-rev-1"
            style={{
              fontFamily: '"SF Mono", "Menlo", "Consolas", monospace',
              fontSize: 10,
              letterSpacing: '0.32em',
              color: C.gold,
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            <span>VOL. XX</span>
            <span style={{ color: 'rgba(201,163,91,0.4)' }}>·</span>
            <span>Nº 01</span>
            <span style={{ color: 'rgba(201,163,91,0.4)' }}>·</span>
            <span>MMXXVI</span>
          </div>
        </div>
      </div>

      {/* ============================================================
          MAIN COMPOSITION — magazine cover layout
      ============================================================ */}
      <div className="relative z-20 max-w-[1380px] mx-auto px-6 lg:px-12 pt-16 lg:pt-24 pb-14 lg:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
          {/* ============ LEFT: editorial typography ============ */}
          <div className="lg:col-span-7 relative">
            {/* Issue label — small mono framing */}
            <div className="flex items-center gap-3 mb-12 lg:mb-16 wdt-rev wdt-rev-1">
              <span
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: 28,
                  height: 1,
                  background: C.gold,
                }}
              />
              <span
                style={{
                  fontFamily: '"SF Mono", "Menlo", "Consolas", monospace',
                  fontSize: 10,
                  letterSpacing: '0.4em',
                  color: C.gold,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                {t.hero.eyebrow}
              </span>
            </div>

            {/* HEADLINE — magazine cover typography */}
            <h1
              className="wdt-rev wdt-rev-2"
              style={{
                color: C.paper,
                fontFamily: '"Georgia", "Times New Roman", serif',
                fontWeight: 700,
                fontSize: 'clamp(1.85rem, 7vw, 6.4rem)',
                lineHeight: 0.95,
                letterSpacing: '-0.028em',
                textTransform: 'none',
                wordBreak: 'normal',
                overflowWrap: 'break-word',
                hyphens: 'manual',
              }}
            >
              {t.hero.tagline}
            </h1>
            <h1
              className="wdt-rev wdt-rev-3"
              style={{
                fontFamily: '"Georgia", "Times New Roman", serif',
                fontWeight: 700,
                fontStyle: 'italic',
                fontSize: 'clamp(2.2rem, 8.4vw, 8rem)',
                lineHeight: 0.92,
                letterSpacing: '-0.035em',
                color: C.gold,
                marginTop: '0.06em',
                // Subtle inner gradient — editorial gold ink, not glitter
                backgroundImage:
                  'linear-gradient(178deg, #F4DEB1 0%, #E8CC93 30%, #C9A35B 70%, #B0894A 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                wordBreak: 'normal',
                overflowWrap: 'break-word',
              }}
            >
              {t.hero.taglineGold}
            </h1>

            {/* Editorial divider — magazine column rule */}
            <div
              className="flex items-center gap-3 wdt-rev wdt-rev-4"
              style={{ marginTop: '2.4rem', marginBottom: '2.0rem' }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 56,
                  height: 1,
                  background: C.gold,
                }}
              />
              <span
                style={{
                  fontFamily: '"SF Mono", "Menlo", "Consolas", monospace',
                  fontSize: 9,
                  letterSpacing: '0.38em',
                  color: C.gold,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                Editorial
              </span>
              <span
                style={{
                  display: 'inline-block',
                  width: 56,
                  height: 1,
                  background: 'rgba(201,163,91,0.2)',
                }}
              />
            </div>

            {/* Statement — pull quote */}
            <p
              className="wdt-rev wdt-rev-4"
              style={{
                fontFamily: '"Georgia", "Times New Roman", serif',
                fontWeight: 400,
                fontStyle: 'italic',
                color: C.cream,
                fontSize: 'clamp(1.1rem, 1.7vw, 1.5rem)',
                lineHeight: 1.42,
                maxWidth: '32ch',
              }}
            >
              <span
                aria-hidden
                style={{
                  fontFamily: '"Georgia", serif',
                  color: C.gold,
                  fontSize: '1.5em',
                  lineHeight: 0,
                  marginRight: 4,
                  position: 'relative',
                  top: '0.18em',
                }}
              >
                ❝
              </span>
              {t.hero.statement}{' '}
              <span style={{ color: C.gold, fontWeight: 700, fontStyle: 'italic' }}>
                {t.hero.statementGold}
              </span>
            </p>

            {/* CTAs — magazine button bar */}
            <div className="flex flex-col sm:flex-row gap-3 mt-10 wdt-rev wdt-rev-5">
              <Link
                href="#contato"
                className="wdt-cta-primary inline-flex items-center justify-center gap-3"
                style={{
                  background:
                    'linear-gradient(135deg, #E8CC93 0%, #C9A35B 60%, #8B6F2C 100%)',
                  color: C.ink,
                  padding: '15px 28px',
                  fontFamily: '"SF Mono", "Menlo", "Consolas", monospace',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.28em',
                  textTransform: 'uppercase',
                  boxShadow:
                    '0 14px 38px rgba(201,163,91,0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
                  border: '1px solid rgba(232,204,147,0.4)',
                  borderRadius: 0,
                }}
              >
                <span>{t.hero.ctaPrimary}</span>
                <span style={{ fontSize: 13, fontFamily: 'Georgia, serif' }}>→</span>
              </Link>
              <Link
                href="#manifesto"
                className="wdt-cta-secondary inline-flex items-center justify-center gap-3"
                style={{
                  background: 'transparent',
                  color: C.cream,
                  padding: '15px 28px',
                  fontFamily: '"SF Mono", "Menlo", "Consolas", monospace',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.28em',
                  textTransform: 'uppercase',
                  border: '1px solid rgba(201,163,91,0.4)',
                  borderRadius: 0,
                }}
              >
                {t.hero.ctaSecondary}
              </Link>
            </div>
          </div>

          {/* ============ RIGHT: numbered editorial manifesto ============ */}
          <aside
            className="lg:col-span-5 relative"
            style={{
              fontFamily: '"Georgia", serif',
            }}
          >
            <div
              className="hidden lg:block absolute top-0 bottom-0"
              style={{
                left: -8,
                width: 1,
                background:
                  'linear-gradient(180deg, transparent 0%, rgba(201,163,91,0.45) 18%, rgba(201,163,91,0.45) 82%, transparent 100%)',
              }}
              aria-hidden
            />

            <div className="lg:pl-6 space-y-10 lg:space-y-12 mt-12 lg:mt-2">
              {/* Editorial section label */}
              <div className="wdt-rev wdt-rev-2">
                <div
                  style={{
                    fontFamily: '"SF Mono", "Menlo", "Consolas", monospace',
                    fontSize: 10,
                    letterSpacing: '0.42em',
                    color: C.gold,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  Track Record
                </div>
                <div
                  style={{
                    fontFamily: '"SF Mono", "Menlo", "Consolas", monospace',
                    fontSize: 9,
                    letterSpacing: '0.32em',
                    color: 'rgba(245,239,226,0.45)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}
                >
                  By the numbers · Brasil → United States
                </div>
              </div>

              {/* Numbered entries */}
              {[
                {
                  num: '01',
                  bigA: 'Twenty',
                  bigB: 'Years',
                  caption: 'Established · MMVI',
                  detail: 'Two decades of operation, never a pivot away from delivery.',
                  delay: 'wdt-rev-3',
                },
                {
                  num: '02',
                  bigA: 'Four',
                  bigB: 'Groups',
                  caption: 'Embraer · Abril · Casacor · Globo',
                  detail: 'Building infrastructure for groups whose operations cannot fail.',
                  delay: 'wdt-rev-4',
                },
                {
                  num: '03',
                  bigA: 'One',
                  bigB: 'Exit',
                  caption: 'Grupo Abril → Grupo Globo · 2026',
                  detail: 'Five years of digital architecture culminating in acquisition.',
                  delay: 'wdt-rev-5',
                },
              ].map((entry) => (
                <div
                  key={entry.num}
                  className={`wdt-rev ${entry.delay} wdt-num-line`}
                  style={{
                    paddingLeft: 0,
                  }}
                >
                  <div className="flex items-start gap-5">
                    <span
                      className="wdt-num"
                      style={{
                        fontFamily: '"Georgia", "Times New Roman", serif',
                        fontWeight: 400,
                        fontStyle: 'italic',
                        fontSize: 14,
                        color: C.gold,
                        letterSpacing: '0.04em',
                        paddingTop: 6,
                        flexShrink: 0,
                        minWidth: 28,
                      }}
                    >
                      {entry.num}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div
                        style={{
                          fontFamily: '"Georgia", serif',
                          fontWeight: 700,
                          color: C.cream,
                          fontSize: 'clamp(1.6rem, 2.6vw, 2.1rem)',
                          lineHeight: 1.02,
                          letterSpacing: '-0.018em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {entry.bigA}{' '}
                        <em
                          style={{
                            color: C.gold,
                            fontStyle: 'italic',
                            fontWeight: 400,
                            textTransform: 'lowercase',
                            letterSpacing: '-0.01em',
                          }}
                        >
                          {entry.bigB}
                        </em>
                        <span
                          className="wdt-num-arrow"
                          style={{
                            color: C.gold,
                            marginLeft: 12,
                            fontStyle: 'italic',
                            fontWeight: 400,
                            display: 'inline-block',
                          }}
                        >
                          →
                        </span>
                      </div>
                      <div
                        style={{
                          fontFamily: '"SF Mono", "Menlo", "Consolas", monospace',
                          fontSize: 10,
                          letterSpacing: '0.32em',
                          color: C.gold,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          marginTop: 8,
                        }}
                      >
                        {entry.caption}
                      </div>
                      <div
                        style={{
                          fontFamily: '"Georgia", serif',
                          fontStyle: 'italic',
                          fontSize: 13.5,
                          color: 'rgba(245,239,226,0.65)',
                          lineHeight: 1.55,
                          marginTop: 8,
                          maxWidth: '32ch',
                        }}
                      >
                        {entry.detail}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>

      {/* ============================================================
          FOOTER TICKER — proof line as printer's bottom mark
      ============================================================ */}
      <div
        className="relative z-20 border-t"
        style={{ borderColor: 'rgba(201,163,91,0.22)', background: 'rgba(10,15,28,0.55)' }}
      >
        <div
          className="max-w-[1380px] mx-auto px-6 lg:px-12 flex items-center gap-4"
          style={{ minHeight: 56 }}
        >
          <span
            aria-hidden
            className="wdt-pulse"
            style={{
              width: 8,
              height: 8,
              transform: 'rotate(45deg)',
              background: C.gold,
              flexShrink: 0,
            }}
          />
          <span
            className="wdt-line wdt-rev-6"
            style={{
              fontFamily: '"SF Mono", "Menlo", "Consolas", monospace',
              fontSize: 11,
              letterSpacing: '0.34em',
              color: C.cream,
              fontWeight: 600,
              textTransform: 'uppercase',
              opacity: 0.85,
            }}
          >
            {t.hero.proof}
          </span>
        </div>
      </div>

      {/* ============================================================
          BOTTOM TRACK STRIP — original 4 markers, redesigned editorial
      ============================================================ */}
      <div
        className="relative z-10 border-t"
        style={{ borderColor: 'rgba(201,163,91,0.14)', background: 'rgba(10,15,28,0.7)' }}
      >
        <div className="max-w-[1380px] mx-auto px-6 lg:px-12 py-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-12">
          {t.track.map((s, i) => (
            <div
              key={i}
              className={`wdt-rev wdt-rev-${Math.min(6, 3 + i)} relative`}
              style={{
                borderLeft:
                  i === 0
                    ? 'none'
                    : '1px solid rgba(201,163,91,0.12)',
                paddingLeft: i === 0 ? 0 : 24,
              }}
            >
              <div
                style={{
                  fontFamily: '"SF Mono", "Menlo", "Consolas", monospace',
                  fontSize: 10,
                  letterSpacing: '0.4em',
                  color: C.gold,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                {s.tag}
              </div>
              <div
                style={{
                  fontFamily: '"Georgia", serif',
                  fontWeight: 700,
                  fontStyle: 'italic',
                  fontSize: 'clamp(1.4rem, 2.3vw, 1.95rem)',
                  lineHeight: 1.05,
                  color: C.cream,
                  letterSpacing: '-0.012em',
                }}
              >
                {s.t}
              </div>
              <div
                style={{
                  marginTop: 12,
                  fontFamily: '"Georgia", serif',
                  fontSize: 13,
                  color: 'rgba(245,239,226,0.55)',
                  lineHeight: 1.55,
                  fontStyle: 'italic',
                }}
              >
                {s.d}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function TrustStrip({ t }: { t: WDTContent }) {
  const clients = [
    { name: 'EMBRAER', weight: 800 },
    { name: 'GRUPO ABRIL', weight: 800 },
    { name: 'CASACOR', weight: 700 },
    { name: 'GRUPO GLOBO', weight: 800 },
  ]
  return (
    <section className="relative" style={{ background: C.paper, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-12 lg:py-16">
        <div className="text-center mb-10">
          <span className="text-[11px] font-bold uppercase" style={{ color: C.goldDeep, letterSpacing: '0.32em' }}>{t.trustStrip}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12 items-center justify-items-center">
          {clients.map((c) => (
            <span key={c.name} className="text-[15px] md:text-[17px] lg:text-[19px]"
              style={{ color: C.textDark, fontFamily: 'Georgia, serif', fontWeight: c.weight, letterSpacing: '0.18em', opacity: 0.85 }}>
              {c.name}
            </span>
          ))}
        </div>
        <p className="text-center mt-10 max-w-3xl mx-auto" style={{ color: C.textMid, fontSize: 13.5, lineHeight: 1.7, fontStyle: 'italic' }}>
          {t.trustNote}
        </p>
      </div>
    </section>
  )
}

function SignatureCase({ t }: { t: WDTContent }) {
  return (
    <section id="caso" className="relative overflow-hidden" style={{ background: C.ink }}>
      <div className="absolute left-0 top-0 bottom-0" style={{ width: 6, background: C.gold }} />
      <div className="absolute pointer-events-none" style={{ top: '20%', right: '-15%', width: 700, height: 700, background: 'radial-gradient(circle, rgba(201,163,91,0.12), transparent 65%)' }} />

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
          <div className="lg:col-span-5">
            <div className="flex items-center gap-4 mb-8">
              <span className="inline-block" style={{ width: 40, height: 2, background: C.gold }} />
              <span className="text-[11px] font-bold uppercase" style={{ color: C.gold, letterSpacing: '0.32em' }}>{t.signatureCase.eyebrow}</span>
            </div>
            <h2 className="font-bold leading-[1.05] tracking-tight" style={{ color: C.paper, fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 3.4rem)' }}>
              {t.signatureCase.h2a}<br />
              {t.signatureCase.h2b} <em style={{ color: C.gold }}>{t.signatureCase.h2bGold}</em>
            </h2>
            <p className="mt-8" style={{ color: C.textLightMuted, fontSize: 16.5, lineHeight: 1.75 }} dangerouslySetInnerHTML={{ __html: t.signatureCase.p1 }} />
            <p className="mt-5" style={{ color: C.textLightMuted, fontSize: 16.5, lineHeight: 1.75 }} dangerouslySetInnerHTML={{ __html: t.signatureCase.p2 }} />
          </div>

          <div className="lg:col-span-7 lg:pl-8">
            <div className="grid grid-cols-2 gap-px" style={{ background: 'rgba(201,163,91,0.18)' }}>
              {t.signatureCase.stats.map((s, i) => (
                <div key={i} className="p-8 lg:p-10" style={{ background: C.ink, minHeight: 200 }}>
                  <span className="font-bold" style={{ color: C.gold, fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 3.4vw, 2.8rem)', fontStyle: 'italic', lineHeight: 1 }}>{s.n}</span>
                  <span className="block mt-4 text-[13px]" style={{ color: C.textLightMuted, lineHeight: 1.6 }}>{s.l}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 p-6 lg:p-8" style={{ background: 'rgba(201,163,91,0.06)', border: `1px solid rgba(201,163,91,0.25)` }}>
              <span className="text-[10px] font-bold uppercase block mb-3" style={{ color: C.gold, letterSpacing: '0.32em' }}>{t.signatureCase.lessonTag}</span>
              <p style={{ color: C.paper, fontFamily: 'Georgia, serif', fontSize: 17, lineHeight: 1.55, fontStyle: 'italic' }}>
                {t.signatureCase.lesson}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Testimonial({ t }: { t: WDTContent }) {
  return (
    <section className="relative" style={{ background: C.cream }}>
      <div className="max-w-6xl mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div className="flex items-center gap-4 mb-10">
          <span className="inline-block" style={{ width: 40, height: 2, background: C.goldDeep }} />
          <span className="text-[11px] font-bold uppercase" style={{ color: C.goldDeep, letterSpacing: '0.32em' }}>{t.testimonial.eyebrow}</span>
        </div>

        <span className="block leading-none mb-4" style={{ color: C.gold, fontFamily: 'Georgia, serif', fontSize: 'clamp(5rem, 8vw, 8rem)', fontStyle: 'italic', fontWeight: 700 }}>"</span>

        <blockquote className="font-bold tracking-tight"
          style={{ color: C.textDark, fontFamily: 'Georgia, serif', fontSize: 'clamp(1.4rem, 2.6vw, 2.2rem)', lineHeight: 1.35, fontStyle: 'italic', fontWeight: 400, maxWidth: '60ch' }}
          dangerouslySetInnerHTML={{ __html: t.testimonial.quote }} />

        <div className="flex items-center gap-5 mt-12">
          <span className="inline-flex items-center justify-center font-bold"
            style={{ width: 64, height: 64, background: C.ink, color: C.gold, fontFamily: 'Georgia, serif', fontSize: 22, fontStyle: 'italic', letterSpacing: '0.04em', borderRadius: 4 }}>
            AS
          </span>
          <div>
            <span className="block font-bold" style={{ color: C.textDark, fontFamily: 'Georgia, serif', fontSize: 18 }}>{t.testimonial.name}</span>
            <span className="block mt-1 text-[12px]" style={{ color: C.textMid, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{t.testimonial.role}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function Manifesto({ t }: { t: WDTContent }) {
  return (
    <section id="manifesto" className="relative" style={{ background: C.bg }}>
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div className="flex items-center gap-4 mb-8">
          <span className="inline-block" style={{ width: 40, height: 2, background: C.gold }} />
          <span className="text-[11px] font-bold uppercase" style={{ color: C.goldDeep, letterSpacing: '0.32em' }}>{t.manifesto.eyebrow}</span>
        </div>
        <h2 className="font-bold leading-tight tracking-tight" style={{ color: C.textDark, fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4.2vw, 3.4rem)', maxWidth: '22ch' }}>
          {t.manifesto.h2a} <em style={{ color: C.goldDeep }}>{t.manifesto.h2aGold}</em> {t.manifesto.h2b}
        </h2>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6">
          {t.manifesto.items.map((it) => (
            <article key={it.n} className="relative p-8 lg:p-10" style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 4 }}>
              <div className="absolute left-0 top-0 bottom-0" style={{ width: 4, background: C.gold }} />
              <div className="flex items-baseline gap-5 mb-5">
                <span className="font-bold" style={{ color: C.gold, fontFamily: 'Georgia, serif', fontSize: 38, fontStyle: 'italic', lineHeight: 1 }}>{it.n}</span>
                <h3 className="font-bold tracking-tight" style={{ color: C.textDark, fontFamily: 'Georgia, serif', fontSize: 'clamp(1.25rem, 1.8vw, 1.6rem)', lineHeight: 1.2 }}>{it.t}</h3>
              </div>
              <p style={{ color: C.textMid, fontSize: 15, lineHeight: 1.7 }}>{it.d}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function Services({ t }: { t: WDTContent }) {
  return (
    <section id="servicos" className="relative" style={{ background: C.paper }}>
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 mb-16">
          <div className="lg:col-span-5">
            <div className="flex items-center gap-4 mb-8">
              <span className="inline-block" style={{ width: 40, height: 2, background: C.gold }} />
              <span className="text-[11px] font-bold uppercase" style={{ color: C.goldDeep, letterSpacing: '0.32em' }}>{t.services.eyebrow}</span>
            </div>
            <h2 className="font-bold leading-tight tracking-tight" style={{ color: C.textDark, fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 3.6vw, 3rem)' }}>
              {t.services.h2a} <em style={{ color: C.goldDeep }}>{t.services.h2aGold}</em><br />{t.services.h2b}
            </h2>
          </div>
          <div className="lg:col-span-7 lg:pt-3">
            <p style={{ color: C.textMid, fontSize: 'clamp(1rem, 1.25vw, 1.15rem)', lineHeight: 1.7 }}>{t.services.sub}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {t.services.items.map((s, i) => (
            <article key={s.title} className="relative p-8" style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4 }}>
              <div className="absolute top-0 left-0 right-0" style={{ height: 3, background: C.gold }} />
              <span className="font-bold mb-5 inline-block" style={{ color: C.gold, fontFamily: 'Georgia, serif', fontSize: 24, fontStyle: 'italic' }}>0{i + 1}</span>
              <h3 className="font-bold tracking-tight mb-3" style={{ color: C.textDark, fontFamily: 'Georgia, serif', fontSize: 'clamp(1.1rem, 1.4vw, 1.3rem)', lineHeight: 1.25 }}>{s.title}</h3>
              <p className="mb-5" style={{ color: C.textMid, fontSize: 14, lineHeight: 1.6 }}>{s.desc}</p>
              <ul className="space-y-2">
                {s.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-3 text-[13px]" style={{ color: C.textDark }}>
                    <span className="mt-[7px] inline-block" style={{ width: 5, height: 5, background: C.gold, flexShrink: 0 }} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function Differentiator({ t }: { t: WDTContent }) {
  return (
    <section id="diferenca" className="relative overflow-hidden" style={{ background: C.ink }}>
      <div className="absolute pointer-events-none" style={{ top: '-15%', left: '-10%', width: 600, height: 600, background: 'radial-gradient(circle, rgba(201,163,91,0.12), transparent 65%)' }} />

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div className="flex items-center gap-4 mb-8">
          <span className="inline-block" style={{ width: 40, height: 2, background: C.gold }} />
          <span className="text-[11px] font-bold uppercase" style={{ color: C.gold, letterSpacing: '0.32em' }}>{t.differential.eyebrow}</span>
        </div>

        <h2 className="font-bold leading-tight tracking-tight mb-16 lg:mb-20" style={{ color: C.paper, fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4.2vw, 3.4rem)', maxWidth: '22ch' }}>
          {t.differential.h2a} <em style={{ color: C.gold }}>{t.differential.h2aGold}</em><br />
          {t.differential.h2b} <em style={{ color: C.gold }}>{t.differential.h2bGold}</em>
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden" style={{ border: `1px solid rgba(201,163,91,0.2)` }}>
          <div className="lg:col-span-5 px-8 py-5" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <span className="text-[11px] font-bold uppercase" style={{ color: C.textMuted, letterSpacing: '0.28em' }}>{t.differential.headerLeft}</span>
          </div>
          <div className="lg:col-span-2 hidden lg:flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.02)', borderLeft: '1px solid rgba(201,163,91,0.2)', borderRight: '1px solid rgba(201,163,91,0.2)' }} />
          <div className="lg:col-span-5 px-8 py-5" style={{ background: 'rgba(201,163,91,0.08)', borderLeft: '1px solid rgba(201,163,91,0.25)' }}>
            <span className="text-[11px] font-bold uppercase" style={{ color: C.gold, letterSpacing: '0.28em' }}>{t.differential.headerRight}</span>
          </div>

          {t.differential.rows.map((r, i) => (
            <div key={i} className="contents">
              <div className="lg:col-span-5 px-8 py-7" style={{ borderTop: `1px solid rgba(201,163,91,0.12)`, color: C.textLightMuted, fontSize: 16, lineHeight: 1.5 }}>{r.others}</div>
              <div className="lg:col-span-2 hidden lg:flex items-center justify-center" style={{ borderTop: `1px solid rgba(201,163,91,0.12)`, borderLeft: '1px solid rgba(201,163,91,0.2)', borderRight: '1px solid rgba(201,163,91,0.2)', fontFamily: 'Georgia, serif', fontSize: 18, fontStyle: 'italic', color: C.gold }}>vs.</div>
              <div className="lg:col-span-5 px-8 py-7" style={{ borderTop: `1px solid rgba(201,163,91,0.12)`, borderLeft: '1px solid rgba(201,163,91,0.2)', background: 'rgba(201,163,91,0.04)', color: C.paper, fontSize: 16, lineHeight: 1.5, fontWeight: 600, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>{r.us}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Audience({ t }: { t: WDTContent }) {
  return (
    <section id="parceria" className="relative" style={{ background: C.bg }}>
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div className="max-w-3xl mb-16">
          <div className="flex items-center gap-4 mb-8">
            <span className="inline-block" style={{ width: 40, height: 2, background: C.gold }} />
            <span className="text-[11px] font-bold uppercase" style={{ color: C.goldDeep, letterSpacing: '0.32em' }}>{t.audience.eyebrow}</span>
          </div>
          <h2 className="font-bold leading-tight tracking-tight" style={{ color: C.textDark, fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 3.2rem)' }}>
            {t.audience.h2a} <em style={{ color: C.goldDeep }}>{t.audience.h2aGold}</em><br />
            {t.audience.h2b}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {t.audience.cards.map((c, i) => (
            <article key={c.tag} className="relative flex flex-col p-8 lg:p-10" style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 4 }}>
              <span className="absolute font-bold pointer-events-none select-none"
                style={{ color: C.bgAlt, fontFamily: 'Georgia, serif', fontSize: 88, fontStyle: 'italic', lineHeight: 1, top: 12, right: 16, zIndex: 0 }}>
                0{i + 1}
              </span>
              <span className="relative font-bold mb-6" style={{ color: C.gold, fontFamily: 'Georgia, serif', fontSize: 16, fontStyle: 'italic', letterSpacing: '0.04em', zIndex: 1 }}>{c.tag}</span>
              <h3 className="relative font-bold tracking-tight mb-4" style={{ color: C.textDark, fontFamily: 'Georgia, serif', fontSize: 'clamp(1.1rem, 1.4vw, 1.35rem)', lineHeight: 1.25, zIndex: 1 }}>{c.t}</h3>
              <p className="relative flex-1 mb-8" style={{ color: C.textMid, fontSize: 14.5, lineHeight: 1.65, zIndex: 1 }}>{c.d}</p>
              <Link href="#contato" className="relative inline-flex items-center gap-2 font-bold text-[13px] tracking-wide self-start"
                style={{ color: C.goldDeep, borderBottom: `2px solid ${C.gold}`, paddingBottom: 4, zIndex: 1 }}>
                {c.cta}<span style={{ fontSize: 16 }}>→</span>
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function Process({ t }: { t: WDTContent }) {
  return (
    <section className="relative" style={{ background: C.paper }}>
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div className="flex items-center gap-4 mb-8">
          <span className="inline-block" style={{ width: 40, height: 2, background: C.gold }} />
          <span className="text-[11px] font-bold uppercase" style={{ color: C.goldDeep, letterSpacing: '0.32em' }}>{t.process.eyebrow}</span>
        </div>
        <h2 className="font-bold leading-tight tracking-tight max-w-3xl" style={{ color: C.textDark, fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 3.8vw, 3rem)' }}>
          {t.process.h2a} <em style={{ color: C.goldDeep }}>{t.process.h2aGold}</em>
        </h2>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0 lg:gap-px" style={{ background: C.border }}>
          {t.process.steps.map((s) => (
            <div key={s.n} className="p-8 lg:p-10 flex flex-col" style={{ background: C.paper, minHeight: 280 }}>
              <span className="font-bold" style={{ color: C.gold, fontFamily: 'Georgia, serif', fontSize: 44, fontStyle: 'italic', lineHeight: 1 }}>{s.n}</span>
              <h3 className="font-bold tracking-tight mt-5 mb-3" style={{ color: C.textDark, fontFamily: 'Georgia, serif', fontSize: 22, lineHeight: 1.2 }}>{s.t}</h3>
              <p style={{ color: C.textMid, fontSize: 14, lineHeight: 1.65 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FounderCard({ founder }: { founder: WDTContent['leadership']['founders'][0] }) {
  return (
    <article className="flex flex-col h-full">
      <div className="relative aspect-[5/4] flex items-center justify-center overflow-hidden" style={{ background: C.ink }}>
        <div className="absolute left-0 top-0 bottom-0" style={{ width: 6, background: C.gold }} />
        <div className="absolute pointer-events-none" style={{ inset: 0, background: 'radial-gradient(circle at 70% 30%, rgba(201,163,91,0.18), transparent 60%)' }} />
        <span className="relative font-bold tracking-tight" style={{ color: C.gold, fontFamily: 'Georgia, serif', fontSize: 'clamp(6rem, 12vw, 10rem)', fontStyle: 'italic', lineHeight: 1 }}>
          {founder.initials}
        </span>
        <span className="absolute top-6 right-6 text-[10px] font-bold uppercase px-3 py-1.5"
          style={{ color: C.gold, letterSpacing: '0.28em', background: 'rgba(201,163,91,0.1)', border: '1px solid rgba(201,163,91,0.3)' }}>
          {founder.flag}
        </span>
        <span className="absolute bottom-6 left-8 right-8 text-[10px] font-bold uppercase" style={{ color: C.gold, letterSpacing: '0.32em' }}>WDT USA GROUP</span>
      </div>

      <div className="mt-8 flex-1 flex flex-col">
        <h3 className="font-bold leading-tight tracking-tight" style={{ color: C.textDark, fontFamily: 'Georgia, serif', fontSize: 'clamp(1.8rem, 2.8vw, 2.4rem)' }}>
          {founder.first} <em style={{ color: C.goldDeep }}>{founder.last}</em>
        </h3>
        <span className="block mt-3 text-[12px] font-bold uppercase" style={{ color: C.textMid, letterSpacing: '0.2em' }}>{founder.role}</span>
        <div className="mt-2 mb-6" style={{ width: 32, height: 2, background: C.gold }} />
        <div className="space-y-4 flex-1" style={{ color: C.textMid, fontSize: 15, lineHeight: 1.7 }}>
          {founder.bio.map((p, i) => <p key={i} dangerouslySetInnerHTML={{ __html: p }} />)}
        </div>
      </div>
    </article>
  )
}

function Leadership({ t }: { t: WDTContent }) {
  return (
    <section id="lideranca" className="relative" style={{ background: C.bg }}>
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div className="flex items-center gap-4 mb-8">
          <span className="inline-block" style={{ width: 40, height: 2, background: C.gold }} />
          <span className="text-[11px] font-bold uppercase" style={{ color: C.goldDeep, letterSpacing: '0.32em' }}>{t.leadership.eyebrow}</span>
        </div>
        <h2 className="font-bold leading-tight tracking-tight max-w-4xl" style={{ color: C.textDark, fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 3.8vw, 3.2rem)' }}>
          {t.leadership.h2a} <em style={{ color: C.goldDeep }}>{t.leadership.h2aGold}</em>.
        </h2>
        <p className="mt-6 max-w-3xl" style={{ color: C.textMid, fontSize: 'clamp(1rem, 1.2vw, 1.1rem)', lineHeight: 1.7 }}>{t.leadership.sub}</p>

        <div className="mt-16 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
          {t.leadership.founders.map((f) => <FounderCard key={f.initials} founder={f} />)}
        </div>
      </div>
    </section>
  )
}

function CTA({ t }: { t: WDTContent }) {
  return (
    <section id="contato" className="relative overflow-hidden" style={{ background: C.ink }}>
      <div className="absolute pointer-events-none" style={{ top: '-30%', right: '-15%', width: 700, height: 700, background: 'radial-gradient(circle, rgba(201,163,91,0.18), transparent 65%)' }} />

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 py-24 lg:py-36">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-end">
          <div className="lg:col-span-7">
            <div className="flex items-center gap-4 mb-10">
              <span className="inline-block" style={{ width: 40, height: 2, background: C.gold }} />
              <span className="text-[11px] font-bold uppercase" style={{ color: C.gold, letterSpacing: '0.32em' }}>{t.cta.eyebrow}</span>
            </div>
            <h2 className="font-bold leading-tight tracking-tight" style={{ color: C.paper, fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4.8vw, 4.2rem)' }}>
              {t.cta.h2a} <em style={{ color: C.gold }}>{t.cta.h2aGold}</em>
            </h2>
            <p className="mt-8 max-w-2xl" style={{ color: C.textLightMuted, fontSize: 'clamp(1rem, 1.25vw, 1.15rem)', lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: t.cta.sub }} />
          </div>

          <div className="lg:col-span-5 lg:pl-10">
            <div className="p-8 lg:p-10" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid rgba(201,163,91,0.25)`, backdropFilter: 'blur(8px)' }}>
              <span className="text-[11px] font-bold uppercase block mb-6" style={{ color: C.gold, letterSpacing: '0.28em' }}>{t.cta.cardEyebrow}</span>
              <ul className="space-y-5 mb-8">
                {t.cta.cardBullets.map((b) => (
                  <li key={b} className="flex items-start gap-3" style={{ color: C.paper }}>
                    <span className="mt-[9px] inline-block" style={{ width: 6, height: 6, background: C.gold, flexShrink: 0 }} />
                    <span style={{ fontSize: 14.5 }}>{b}</span>
                  </li>
                ))}
              </ul>
              <a href="mailto:leandro@wdtgroup.com?subject=WDT%20GROUP" className="block w-full text-center px-6 py-4 rounded-md font-bold text-[14px] tracking-wide"
                style={{ background: C.gold, color: C.ink, boxShadow: '0 8px 28px rgba(201,163,91,0.3)' }}>
                {t.cta.cardCta} →
              </a>
              <p className="text-center mt-4 text-[12px]" style={{ color: C.textMuted }}>
                {t.cta.cardOr} <span style={{ color: C.goldLight }}>leandro@wdtgroup.com</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer({ t, locale }: { t: WDTContent; locale: Locale }) {
  return (
    <footer style={{ background: '#0A1426', color: C.textMuted }}>
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-10">
          <div className="md:col-span-5">
            <div className="flex items-center mb-5">
              <WDTLogo
                variant="full"
                inkColor={C.cream}
                goldColor={C.gold}
                style={{ height: 'clamp(80px, 10vw, 108px)', width: 'auto', display: 'block' }}
              />
            </div>
            <p className="max-w-md" style={{ color: C.textMuted, fontSize: 13.5, lineHeight: 1.7 }}>{t.footer.tagline}</p>
            <div className="flex items-center gap-1 mt-6">
              {(['pt', 'en', 'es'] as Locale[]).map((code, i) => (
                <span key={code} className="flex items-center">
                  <Link href={getPath(code)} className="text-[11px] font-bold tracking-wide px-2 py-1"
                    style={{ color: locale === code ? C.gold : C.textMuted, fontStyle: locale === code ? 'italic' : 'normal', fontFamily: locale === code ? 'Georgia, serif' : 'inherit' }}>
                    {code.toUpperCase()}
                  </Link>
                  {i < 2 && <span style={{ color: 'rgba(201,163,91,0.3)' }} className="text-[10px]">·</span>}
                </span>
              ))}
            </div>
          </div>
          <div className="md:col-span-3">
            <span className="text-[11px] font-bold uppercase block mb-4" style={{ color: C.gold, letterSpacing: '0.24em' }}>{t.footer.mapTitle}</span>
            <ul className="space-y-3 text-[13px]">
              <li><Link href="#manifesto">{t.nav.manifesto}</Link></li>
              <li><Link href="#servicos">{t.nav.services}</Link></li>
              <li><Link href="#diferenca">{t.nav.differential}</Link></li>
              <li><Link href="#parceria">{t.nav.partnership}</Link></li>
              <li><Link href="#contato">{t.nav.cta}</Link></li>
            </ul>
          </div>
          <div className="md:col-span-4">
            <span className="text-[11px] font-bold uppercase block mb-4" style={{ color: C.gold, letterSpacing: '0.24em' }}>{t.footer.contactTitle}</span>
            <ul className="space-y-3 text-[13px]">
              {t.footer.contactItems.map((it, i) => (
                <li key={i} style={i === 0 ? { color: C.paper } : {}}>{it}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex flex-col md:flex-row md:justify-between gap-3 pt-6 text-[11px] uppercase" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', letterSpacing: '0.2em' }}>
          <span style={{ color: C.textMuted }}>{t.footer.since}</span>
          <span style={{ color: C.gold, fontStyle: 'italic', fontFamily: 'Georgia, serif', textTransform: 'none', letterSpacing: '0.04em' }}>{t.footer.values}</span>
        </div>
      </div>
    </footer>
  )
}

export default function WDTSite({ t, locale }: { t: WDTContent; locale: Locale }) {
  return (
    <main className="overflow-x-hidden" style={{ background: C.bg }}>
      <Nav t={t} locale={locale} />
      <Hero t={t} />
      <TrustStrip t={t} />
      <SignatureCase t={t} />
      <Testimonial t={t} />
      <Manifesto t={t} />
      <Services t={t} />
      <Differentiator t={t} />
      <Audience t={t} />
      <Process t={t} />
      <Leadership t={t} />
      <CTA t={t} />
      <Footer t={t} locale={locale} />
    </main>
  )
}
