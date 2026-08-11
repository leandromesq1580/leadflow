import Link from 'next/link'
import Image from 'next/image'
import { getLocale } from '@/lib/locale'
import { getMessages } from '@/lib/i18n'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { WhatsAppFab } from '@/components/whatsapp-fab'
import { WhatsAppLeadCta } from '@/components/whatsapp-lead-cta'
import { LiveLeadToast } from '@/components/live-lead-toast'
import { MetaPixel } from '@/components/meta-pixel'
import { BuyCheckoutCta } from '@/components/buy-checkout-cta'
import { CrmPlansGrid } from '@/app/dashboard/planos/crm-plans-grid'

export default async function LandingPage() {
  const locale = await getLocale()
  const t = getMessages(locale)

  return (
    <div className="min-h-screen" style={{ background: '#f8f9fc' }}>
      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-md" style={{ background: 'rgba(255,255,255,0.92)', borderBottom: '1px solid #e8ecf4' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16 sm:h-[72px]">
          <div className="flex items-center gap-2">
            <svg className="w-7 h-7 sm:w-8 sm:h-8" viewBox="0 0 60 60" aria-label="Lead4Pro">
              <defs>
                <linearGradient id="nav-bolt" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0" stopColor="#fbbf24" />
                  <stop offset="1" stopColor="#f59e0b" />
                </linearGradient>
              </defs>
              <rect width="60" height="60" rx="14" fill="#0f172a" />
              <path d="M30 12 L18 34 L28 34 L24 50 L42 26 L32 26 L36 12 Z" fill="url(#nav-bolt)" />
            </svg>
            <span className="text-base sm:text-[17px] font-extrabold" style={{ color: '#0f172a', letterSpacing: '-0.02em' }}>Lead4Pro</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link href="#pricing" className="hidden sm:inline text-[13px] font-semibold px-3 py-2" style={{ color: '#64748b' }}>{t.nav.pricing}</Link>
            <Link href="/login" className="hidden sm:inline text-[13px] font-semibold px-3 py-2" style={{ color: '#64748b' }}>{t.nav.login}</Link>
            <LocaleSwitcher current={locale} />
            <Link href="/register" className="text-xs sm:text-[13px] font-bold text-white px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl" style={{ background: '#6366f1' }}>
              {t.nav.register}
            </Link>
          </div>
        </div>
      </nav>

      {/* ==================== HERO ==================== */}
      <section className="relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #0f0a2e 0%, #1e1b4b 30%, #312e81 60%, #4338ca 100%)' }}>
        <div className="absolute inset-0">
          <div className="absolute w-[600px] h-[600px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.25), transparent 70%)', top: '-20%', right: '-10%' }} />
          <div className="absolute w-[400px] h-[400px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.15), transparent 70%)', bottom: '-15%', left: '-5%' }} />
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-8 sm:pb-16">
          <div className="text-center max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold mb-6" style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#34d399' }} /> {t.hero.badge}
            </span>
            <h1 className="text-[32px] sm:text-[44px] lg:text-[52px] font-extrabold leading-[1.06] tracking-tight text-white mb-5">
              {t.hero.titleA} <span style={{ color: '#a78bfa' }}>{t.hero.titleB}</span>
            </h1>
            <p className="text-[17px] sm:text-[21px] font-bold leading-snug mb-3 max-w-2xl mx-auto text-white">
              {t.hero.tagline}
            </p>
            <p className="text-[14px] sm:text-[16px] leading-relaxed mb-9 max-w-2xl mx-auto" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {t.hero.subtitle}
            </p>

            {/* Vídeo de apresentação — autoplay mudo (HTML cru garante o atributo muted no SSR) */}
            <div className="relative mx-auto max-w-3xl mb-9">
              <div className="absolute -inset-5 sm:-inset-8 rounded-3xl blur-2xl pointer-events-none" style={{ background: 'radial-gradient(closest-side, rgba(139,92,246,0.4), rgba(99,102,241,0.18), transparent)' }} />
              <div
                className="relative rounded-xl sm:rounded-2xl overflow-hidden"
                style={{ border: '1px solid rgba(255,255,255,0.22)', boxShadow: '0 24px 80px rgba(0,0,0,0.55)' }}
                dangerouslySetInnerHTML={{
                  __html: '<video src="/hero-video.mp4" poster="/hero-video-poster.jpg" autoplay muted loop playsinline controls preload="metadata" style="display:block;width:100%;height:auto;aspect-ratio:16/9;background:#0b0820"></video>',
                }}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-4">
              <WhatsAppLeadCta size="lg" label={t.hero.ctaStart} message={t.hero.waMessage} />
              <Link href="#features" className="px-8 py-4 rounded-xl text-[15px] font-bold text-white text-center inline-block" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
                {t.hero.ctaFeatures}
              </Link>
            </div>
            <p className="text-[13px] mb-2 flex items-center justify-center gap-2 flex-wrap" style={{ color: 'rgba(255,255,255,0.7)' }}>
              <span>🎁</span>
              <strong style={{ color: '#fbbf24' }}>7 {t.hero.trialNote}</strong>
              <span>{t.hero.trialDetails}</span>
            </p>
          </div>
        </div>
      </section>

      {/* ==================== TESTIMONIALS ==================== */}
      <section className="py-12 sm:py-16" style={{ background: '#fff', borderBottom: '1px solid #e8ecf4' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-[22px] sm:text-[30px] font-extrabold mb-2" style={{ color: '#1a1a2e' }}>{t.testimonials.title}</h2>
            <p className="text-[13px] sm:text-[14px]" style={{ color: '#94a3b8' }}>{t.testimonials.subtitle}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {t.testimonials.cards.map((c, i) => {
              const colors = ['#6366f1', '#10b981', '#f59e0b']
              const bg = colors[i % colors.length]
              return (
                <div key={i} className="rounded-2xl p-6 relative" style={{ background: '#fafbff', border: '1px solid #e8ecf4' }}>
                  <span className="absolute -top-3 right-5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider text-white" style={{ background: bg, boxShadow: `0 4px 14px ${bg}40` }}>
                    {c.tag}
                  </span>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-extrabold text-[18px] flex-shrink-0" style={{ background: bg }}>
                      {c.initials}
                    </div>
                    <div>
                      <p className="text-[15px] font-extrabold" style={{ color: '#1a1a2e' }}>{c.name}</p>
                      <p className="text-[11px] font-semibold" style={{ color: '#94a3b8' }}>{c.location}</p>
                    </div>
                  </div>
                  <p className="text-[13.5px] leading-relaxed italic" style={{ color: '#475569' }}>
                    &ldquo;{c.quote}&rdquo;
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ==================== COMO FUNCIONA — DOBRA #2 ==================== */}
      <section className="py-16 sm:py-24 relative overflow-hidden" style={{ background: 'radial-gradient(1100px 480px at 82% -8%, rgba(139,92,246,0.20), transparent), linear-gradient(180deg, #0b1020 0%, #0e1430 100%)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            {/* Esquerda: narrativa + passos */}
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold mb-5" style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.25)' }}>
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#34d399' }} /> {t.howItWorks.badge}
              </span>
              <h2 className="text-[28px] sm:text-[40px] font-extrabold text-white leading-[1.08] mb-4">
                {t.howItWorks.titleA} <span style={{ color: '#a78bfa' }}>{t.howItWorks.titleB}</span>
              </h2>
              <p className="text-[15px] sm:text-[17px] leading-relaxed mb-8" style={{ color: 'rgba(255,255,255,0.62)' }}>
                {t.howItWorks.narrative}
              </p>
              <div className="space-y-5">
                {[
                  { n: '1', icon: '🎯', color: '#8b5cf6', title: t.howItWorks.step1Title, desc: t.howItWorks.step1Desc },
                  { n: '2', icon: '⚡', color: '#10b981', title: t.howItWorks.step2Title, desc: t.howItWorks.step2Desc },
                  { n: '3', icon: '🤝', color: '#f59e0b', title: t.howItWorks.step3Title, desc: t.howItWorks.step3Desc },
                ].map((s, i) => (
                  <div key={i} className="flex gap-4 items-start">
                    <div className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-[20px] relative" style={{ background: s.color + '22', border: `1px solid ${s.color}55` }}>
                      {s.icon}
                      <span className="absolute -top-2 -left-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold text-white" style={{ background: s.color }}>{s.n}</span>
                    </div>
                    <div>
                      <p className="text-[15px] font-bold text-white mb-0.5">{s.title}</p>
                      <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link href="/register" className="inline-block mt-8 px-7 py-3.5 rounded-xl text-[14px] font-bold" style={{ background: 'linear-gradient(135deg, #f59e0b, #eab308)', color: '#1a1a2e', boxShadow: '0 4px 20px rgba(245,158,11,0.35)' }}>
                {t.howItWorks.cta}
              </Link>
            </div>

            {/* Direita: feed de leads chegando (figura de desejo) */}
            <div className="relative">
              <div className="absolute inset-0 blur-3xl pointer-events-none" style={{ background: 'radial-gradient(circle at 50% 35%, rgba(139,92,246,0.22), transparent 70%)' }} />
              <div className="relative">
                <p className="text-[11px] font-bold uppercase tracking-widest text-center mb-4 flex items-center justify-center gap-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#34d399' }} /> {t.howItWorks.feedLabel}
                </p>
                <div className="space-y-3.5">
                  {[
                    { name: 'Maria S.', loc: 'Orlando, FL', hue: 280 },
                    { name: 'João P.', loc: 'Newark, NJ', hue: 160 },
                    { name: 'Ana R.', loc: 'Boston, MA', hue: 32 },
                  ].map((l, i) => (
                    <div key={i} className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 12px 34px rgba(0,0,0,0.35)' }}>
                      <div className="w-11 h-11 rounded-full flex items-center justify-center text-[14px] font-extrabold text-white flex-shrink-0" style={{ background: `hsl(${l.hue}, 58%, 55%)` }}>
                        {l.name.split(' ').map(w => w[0]).join('')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[14px] font-bold text-white">{l.name}</p>
                          <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.2)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }}>{t.howItWorks.leadBadge}</span>
                        </div>
                        <p className="text-[12px] truncate" style={{ color: 'rgba(255,255,255,0.55)' }}>🇺🇸 {l.loc} · {t.howItWorks.leadTag}</p>
                      </div>
                      <span className="flex items-center gap-1 text-[10px] font-bold flex-shrink-0" style={{ color: '#34d399' }}>
                        <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#34d399' }} /> {t.howItWorks.leadNew}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Faixa de stats */}
          <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { n: t.howItWorks.stat1n, l: t.howItWorks.stat1l },
              { n: t.howItWorks.stat2n, l: t.howItWorks.stat2l },
              { n: t.howItWorks.stat3n, l: t.howItWorks.stat3l },
              { n: t.howItWorks.stat4n, l: t.howItWorks.stat4l },
            ].map((s, i) => (
              <div key={i} className="rounded-2xl p-5 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <p className="text-[20px] sm:text-[26px] font-extrabold" style={{ color: '#a78bfa' }}>{s.n}</p>
                <p className="text-[11px] font-semibold mt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== SOCIAL PROOF BAR ==================== */}
      <section className="py-8 sm:py-12" style={{ background: '#f8f9fc', borderBottom: '1px solid #e8ecf4' }}>
        <div className="max-w-5xl mx-auto px-4 flex flex-wrap justify-center gap-6 sm:gap-12">
          {[
            { n: '$28', label: t.stats.perLead },
            { n: '< 5min', label: t.stats.delivery },
            { n: '100%', label: t.stats.exclusive },
            { n: 'AI', label: t.stats.ai },
            { n: '$99/mo', label: t.stats.crm },
          ].map((s, i) => (
            <div key={i} className="text-center">
              <p className="text-[22px] sm:text-[32px] font-extrabold" style={{ color: '#6366f1' }}>{s.n}</p>
              <p className="text-[11px] sm:text-[12px] font-semibold" style={{ color: '#94a3b8' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ==================== WHAT'S NEW — SUPERPOWERS ==================== */}
      <section className="py-16 sm:py-24" style={{ background: 'linear-gradient(180deg, #f8f9fc 0%, #fff 100%)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold mb-4" style={{ background: '#eef2ff', color: '#6366f1', border: '1px solid #c7d2fe' }}>
              <span>✨</span> {t.whatsNew.badge}
            </span>
            <h2 className="text-[28px] sm:text-[40px] font-extrabold mb-3" style={{ color: '#1a1a2e' }}>{t.whatsNew.title}</h2>
            <p className="text-[15px] max-w-2xl mx-auto" style={{ color: '#64748b' }}>{t.whatsNew.subtitle}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: '🎁', color: '#f59e0b', ...t.whatsNew.cards.trial },
              { icon: '📱', color: '#16a34a', ...t.whatsNew.cards.multiWhatsApp },
              { icon: '👥', color: '#8b5cf6', ...t.whatsNew.cards.teamMirror },
              { icon: '💬', color: '#10b981', ...t.whatsNew.cards.whatsappInbox },
              { icon: '🔥', color: '#ef4444', ...t.whatsNew.cards.aiScoring },
              { icon: '🔁', color: '#6366f1', ...t.whatsNew.cards.sequencesTrigger },
              { icon: '⚡', color: '#ea580c', ...t.whatsNew.cards.automations },
              { icon: '📅', color: '#0ea5e9', ...t.whatsNew.cards.calendar },
              { icon: '📈', color: '#ec4899', ...t.whatsNew.cards.performance },
            ].map((f, i) => (
              <div key={i} className="rounded-2xl p-6 relative transition-all hover:-translate-y-1" style={{ background: '#fff', border: '1px solid #e8ecf4', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: f.color + '15' }}>
                    <span className="text-[26px]">{f.icon}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider" style={{ background: f.color, color: '#fff' }}>
                    {f.tag}
                  </span>
                </div>
                <h3 className="text-[16px] font-extrabold mb-2" style={{ color: '#1a1a2e' }}>{f.title}</h3>
                <p className="text-[13px] leading-relaxed" style={{ color: '#64748b' }}>{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link href="/register" className="inline-block px-8 py-3.5 rounded-xl text-[14px] font-bold text-white" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
              {t.whatsNew.cta}
            </Link>
          </div>
        </div>
      </section>

      {/* ==================== PRA AGENCIAS ==================== */}
      <section className="py-16 sm:py-24" style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold mb-5" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>
                <span>🏢</span> {t.agency.badge}
              </span>
              <h2 className="text-[28px] sm:text-[36px] font-extrabold mb-4 text-white leading-tight">{t.agency.title}</h2>
              <p className="text-[15px] mb-8" style={{ color: 'rgba(255,255,255,0.6)' }}>{t.agency.subtitle}</p>

              <div className="space-y-4">
                {t.agency.bullets.map((b, i) => {
                  const icons = ['⚡', '👥', '📱', '🎯', '📊']
                  return (
                    <div key={i} className="flex gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)' }}>
                        <span className="text-[18px]">{icons[i]}</span>
                      </div>
                      <div>
                        <p className="text-[14px] font-bold text-white mb-0.5">{b.title}</p>
                        <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>{b.desc}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-8">
                <Link href="/register" className="inline-block px-7 py-3 rounded-xl text-[14px] font-bold" style={{ background: 'linear-gradient(135deg, #f59e0b, #eab308)', color: '#1a1a2e', boxShadow: '0 4px 14px rgba(245,158,11,0.3)' }}>
                  {t.agency.cta}
                </Link>
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <Image src="/ss-team.png" alt="Team pipeline" width={1200} height={650} className="w-full h-auto" />
            </div>
          </div>
        </div>
      </section>

      {/* ==================== FEATURES — AGENCY OWNER ==================== */}
      <section id="features" className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-center text-[12px] font-bold uppercase tracking-widest mb-3" style={{ color: '#6366f1' }}>{t.features.tag}</p>
          <h2 className="text-center text-[28px] sm:text-[40px] font-extrabold mb-4" style={{ color: '#1a1a2e' }}>{t.features.title}</h2>
          <p className="text-center text-[15px] mb-12 max-w-2xl mx-auto" style={{ color: '#94a3b8' }}>{t.features.subtitle}</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div className="rounded-2xl overflow-hidden" style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.08)', border: '1px solid #e8ecf4' }}>
              <Image src="/ss-team.png" alt="Team management" width={1200} height={650} className="w-full h-auto" />
            </div>

            <div className="space-y-6">
              {t.features.items.map((b, i) => {
                const icons = ['👥', '🔄', '📊', '📱']
                return (
                  <div key={i} className="flex gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#eef2ff' }}>
                      <span className="text-[24px]">{icons[i]}</span>
                    </div>
                    <div>
                      <h3 className="text-[16px] font-bold mb-1" style={{ color: '#1a1a2e' }}>{b.title}</h3>
                      <p className="text-[13px] leading-relaxed" style={{ color: '#94a3b8' }}>{b.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ==================== CRM PRO ==================== */}
      <section className="py-16 sm:py-24" style={{ background: '#fff' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-center text-[12px] font-bold uppercase tracking-widest mb-3" style={{ color: '#6366f1' }}>CRM Pro</p>
          <h2 className="text-center text-[28px] sm:text-[40px] font-extrabold mb-4" style={{ color: '#1a1a2e' }}>{t.crm.title}</h2>
          <p className="text-center text-[15px] mb-12 max-w-2xl mx-auto" style={{ color: '#94a3b8' }}>{t.crm.subtitle}</p>

          <div className="rounded-2xl overflow-hidden mb-12" style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.08)', border: '1px solid #e8ecf4' }}>
            <Image src="/ss-pipeline.png" alt="CRM Pipeline" width={1200} height={700} className="w-full h-auto" />
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {[
              { icon: '💬', label: t.crm.labels.inbox },
              { icon: '🔥', label: t.crm.labels.score },
              { icon: '🔁', label: t.crm.labels.sequences },
              { icon: '⚡', label: t.crm.labels.automations },
              { icon: '👥', label: t.crm.labels.team },
              { icon: '📱', label: t.crm.labels.push },
              { icon: '📝', label: t.crm.labels.templates },
              { icon: '📅', label: t.crm.labels.calendar },
              { icon: '📈', label: t.crm.labels.performance },
              { icon: '🏷️', label: t.crm.labels.tags },
            ].map((f, i) => (
              <div key={i} className="text-center py-4 rounded-xl" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
                <span className="text-[22px] block mb-1.5">{f.icon}</span>
                <p className="text-[11px] font-bold leading-tight" style={{ color: '#64748b' }}>{f.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== HOW IT WORKS ==================== */}
      <section className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-center text-[28px] sm:text-[40px] font-extrabold mb-12" style={{ color: '#1a1a2e' }}>{t.how.title}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {t.how.steps.map((s, i) => (
              <div key={i} className="rounded-2xl p-6 text-center" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: '#eef2ff' }}>
                  <span className="text-[26px]">{s.icon}</span>
                </div>
                <p className="text-[11px] font-bold mb-2" style={{ color: '#6366f1' }}>#{s.step}</p>
                <h3 className="text-[15px] font-extrabold mb-2" style={{ color: '#1a1a2e' }}>{s.title}</h3>
                <p className="text-[12px] leading-relaxed" style={{ color: '#64748b' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== QUEM SOMOS ==================== */}
      <section className="py-16 sm:py-24" style={{ background: 'linear-gradient(160deg, #0f0a2e 0%, #1e1b4b 60%, #312e81 100%)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            {/* Foto */}
            <div className="relative mx-auto w-full max-w-[420px]">
              <div className="absolute -inset-4 rounded-3xl blur-2xl pointer-events-none" style={{ background: 'radial-gradient(closest-side, rgba(139,92,246,0.35), transparent)' }} />
              <Image src="/quem-somos.jpg" alt="Leandro e Regiane — fundadores do Lead4Pro" width={840} height={1120}
                className="relative w-full h-auto rounded-2xl object-cover"
                style={{ border: '1px solid rgba(255,255,255,0.18)', boxShadow: '0 24px 70px rgba(0,0,0,0.5)' }} />
            </div>
            {/* Texto */}
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold mb-5" style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.25)' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: '#34d399' }} /> {t.about.badge}
              </span>
              <h2 className="text-[26px] sm:text-[34px] font-extrabold text-white leading-tight mb-5">{t.about.title}</h2>
              <div className="space-y-4 text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.72)' }}>
                <p>{t.about.p1}</p>
                <p>{t.about.p2}</p>
                <p className="text-white font-semibold">{t.about.p3}</p>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-8">
                {[
                  { n: t.about.stat1, l: t.about.stat1l },
                  { n: t.about.stat2, l: t.about.stat2l },
                  { n: t.about.stat3, l: t.about.stat3l },
                ].map((s, i) => (
                  <div key={i} className="rounded-2xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <p className="text-[15px] sm:text-[17px] font-extrabold" style={{ color: '#a78bfa' }}>{s.n}</p>
                    <p className="text-[10px] sm:text-[11px] font-semibold mt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>{s.l}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== PRICING ==================== */}
      <section id="pricing" className="py-16 sm:py-24" style={{ background: 'linear-gradient(180deg, #fff 0%, #f8f9fc 100%)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-center text-[28px] sm:text-[40px] font-extrabold mb-3" style={{ color: '#1a1a2e' }}>{t.pricing.title}</h2>
          <p className="text-center text-[15px] mb-12 max-w-xl mx-auto" style={{ color: '#94a3b8' }}>{t.pricing.subtitle}</p>

          {/* ===== PACOTES DE LEADS EXCLUSIVOS ===== */}
          <div className="text-center mb-2 mt-2">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[12px] font-extrabold" style={{ background: '#eef2ff', color: '#6366f1', border: '1px solid #c7d2fe' }}>🎯 {t.pricing.pkg.leadsLabel}</span>
          </div>
          <p className="text-center text-[13px] mb-7 max-w-xl mx-auto" style={{ color: '#94a3b8' }}>{t.pricing.pkg.leadsNote}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-16 max-w-4xl mx-auto">
            {[
              { id: 'lead_10', qty: 10, total: 280, per: 28 },
              { id: 'lead_25', qty: 25, total: 650, per: 26, tag: t.pricing.pkg.popular },
              { id: 'lead_50', qty: 50, total: 1150, per: 23 },
            ].map((p, i) => (
              <div key={i} className="rounded-2xl p-6 relative text-center" style={{ background: '#fff', border: p.tag ? '2px solid #6366f1' : '1px solid #e8ecf4', boxShadow: p.tag ? '0 14px 40px rgba(99,102,241,0.2)' : '0 4px 12px rgba(0,0,0,0.04)' }}>
                {p.tag && <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-extrabold whitespace-nowrap" style={{ background: '#6366f1', color: '#fff' }}>{p.tag}</span>}
                <p className="text-[15px] font-bold" style={{ color: '#64748b' }}>{p.qty} {t.pricing.pkg.unitLeads}</p>
                <p className="text-[38px] font-extrabold leading-none my-2" style={{ color: '#1a1a2e' }}>${p.total}</p>
                <p className="text-[13px] font-bold mb-1" style={{ color: '#6366f1' }}>${p.per}{t.pricing.pkg.perLead}</p>
                <div className="mb-4" />
                <BuyCheckoutCta block packageId={p.id} label={t.pricing.pkg.buy} />
              </div>
            ))}
          </div>

          {/* ===== CRM (grátis / Pro) ===== */}
          <div className="text-center mb-6">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[12px] font-extrabold" style={{ background: '#f1f5f9', color: '#475569' }}>⚡ {t.pricing.pkg.crmLabel}</span>
          </div>
          <CrmPlansGrid landing />
          <p className="text-center mt-7 text-[13px]" style={{ color: '#64748b' }}>
            Prefere começar de graça? <Link href="/register" className="font-bold" style={{ color: '#6366f1' }}>Crie sua conta CRM grátis →</Link>
          </p>
        </div>
      </section>

      {/* ==================== FINAL CTA ==================== */}
      <section className="py-16 sm:py-20" style={{ background: 'linear-gradient(135deg, #0f0a2e 0%, #1e1b4b 100%)' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-[28px] sm:text-[40px] font-extrabold text-white mb-4">{t.final.title}</h2>
          <p className="text-[15px] mb-8" style={{ color: 'rgba(255,255,255,0.65)' }}>{t.final.subtitle}</p>
          <Link href="/register" className="inline-block px-10 py-4 rounded-xl text-[16px] font-extrabold" style={{ background: 'linear-gradient(135deg, #f59e0b, #eab308)', color: '#1a1a2e', boxShadow: '0 8px 30px rgba(245,158,11,0.4)' }}>
            {t.final.cta}
          </Link>
        </div>
      </section>

      {/* ==================== FOOTER ==================== */}
      <footer className="py-10" style={{ background: '#fff', borderTop: '1px solid #e8ecf4' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6" viewBox="0 0 60 60" aria-label="Lead4Pro">
              <rect width="60" height="60" rx="14" fill="#0f172a" />
              <path d="M30 12 L18 34 L28 34 L24 50 L42 26 L32 26 L36 12 Z" fill="#f59e0b" />
            </svg>
            <span className="text-[14px] font-bold" style={{ color: '#94a3b8' }}>Lead4Pro</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-[12px]" style={{ color: '#94a3b8' }}>{t.footer.privacy}</Link>
            <Link href="/login" className="text-[12px]" style={{ color: '#94a3b8' }}>{t.footer.login}</Link>
            <Link href="/register" className="text-[12px]" style={{ color: '#94a3b8' }}>{t.footer.register}</Link>
          </div>
          <p className="text-[11px]" style={{ color: '#c0c8d4' }}>{t.footer.copyright}</p>
        </div>
      </footer>

      <WhatsAppFab phone="18632808696" />
      <LiveLeadToast badge={t.liveToast.badge} interest={t.liveToast.interest} now={t.liveToast.now} minsAgo={t.liveToast.minsAgo} />
      <MetaPixel />
    </div>
  )
}
