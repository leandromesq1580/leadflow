import Link from 'next/link'
import Image from 'next/image'
import { getLocale } from '@/lib/locale'
import { getMessages } from '@/lib/i18n'
import { LocaleSwitcher } from '@/components/locale-switcher'

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
            <h1 className="text-[32px] sm:text-[44px] lg:text-[52px] font-extrabold leading-[1.06] tracking-tight text-white mb-6">
              {t.hero.titleA} <span style={{ color: '#a78bfa' }}>{t.hero.titleB}</span>
            </h1>
            <p className="text-[15px] sm:text-[18px] leading-relaxed mb-10 max-w-2xl mx-auto" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {t.hero.subtitle}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
              <Link href="/register" className="px-8 py-4 rounded-xl text-[15px] font-bold text-center inline-block" style={{ background: 'linear-gradient(135deg, #f59e0b, #eab308)', color: '#1a1a2e', boxShadow: '0 4px 20px rgba(245,158,11,0.35)' }}>
                {t.hero.ctaStart}
              </Link>
              <Link href="#features" className="px-8 py-4 rounded-xl text-[15px] font-bold text-white text-center inline-block" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
                {t.hero.ctaFeatures}
              </Link>
            </div>
            <p className="text-[13px] mb-6 flex items-center justify-center gap-2 flex-wrap" style={{ color: 'rgba(255,255,255,0.7)' }}>
              <span>🎁</span>
              <strong style={{ color: '#fbbf24' }}>7 {t.hero.trialNote}</strong>
              <span>{t.hero.trialDetails}</span>
            </p>
          </div>

          <div className="mt-8 sm:mt-12 rounded-xl sm:rounded-2xl overflow-hidden mx-auto max-w-5xl" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Image src="/ss-pipeline.png" alt="Pipeline Kanban Lead4Pro" width={1200} height={700} className="w-full h-auto" priority />
          </div>
        </div>
      </section>

      {/* ==================== SOCIAL PROOF BAR ==================== */}
      <section className="py-8 sm:py-12" style={{ background: '#fff', borderBottom: '1px solid #e8ecf4' }}>
        <div className="max-w-5xl mx-auto px-4 flex flex-wrap justify-center gap-6 sm:gap-12">
          {[
            { n: '$22', label: t.stats.perLead },
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

      {/* ==================== PRICING ==================== */}
      <section id="pricing" className="py-16 sm:py-24" style={{ background: 'linear-gradient(180deg, #fff 0%, #f8f9fc 100%)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-center text-[28px] sm:text-[40px] font-extrabold mb-3" style={{ color: '#1a1a2e' }}>{t.pricing.title}</h2>
          <p className="text-center text-[15px] mb-12 max-w-xl mx-auto" style={{ color: '#94a3b8' }}>{t.pricing.subtitle}</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Free */}
            <div className="rounded-2xl p-8" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
              <p className="text-[14px] font-bold mb-1" style={{ color: '#64748b' }}>{t.pricing.free.name}</p>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-[40px] font-extrabold" style={{ color: '#1a1a2e' }}>{t.pricing.free.price}</span>
                <span className="text-[14px]" style={{ color: '#94a3b8' }}>— {t.pricing.free.priceSub}</span>
              </div>
              <ul className="space-y-2 mb-8">
                {t.pricing.free.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px]" style={{ color: '#475569' }}>
                    <span>✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block text-center px-6 py-3 rounded-xl text-[13px] font-bold" style={{ background: '#f1f5f9', color: '#1a1a2e' }}>
                {t.pricing.free.cta}
              </Link>
            </div>

            {/* Pro — destaque */}
            <div className="rounded-2xl p-8 relative" style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)', boxShadow: '0 20px 60px rgba(99,102,241,0.3)' }}>
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-extrabold" style={{ background: '#fbbf24', color: '#1a1a2e' }}>{t.pricing.pro.badge}</span>
              <p className="text-[14px] font-bold mb-1" style={{ color: '#c7d2fe' }}>{t.pricing.pro.name}</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-[40px] font-extrabold text-white">{t.pricing.pro.price}</span>
                <span className="text-[14px]" style={{ color: 'rgba(255,255,255,0.55)' }}>{t.pricing.pro.priceSub}</span>
              </div>
              <p className="text-[12px] font-bold mb-6" style={{ color: '#fbbf24' }}>🎁 {t.pricing.pro.trial}</p>
              <ul className="space-y-2 mb-8">
                {t.pricing.pro.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px]" style={{ color: 'rgba(255,255,255,0.85)' }}>
                    <span style={{ color: '#34d399' }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block text-center px-6 py-3 rounded-xl text-[13px] font-bold" style={{ background: 'linear-gradient(135deg, #f59e0b, #eab308)', color: '#1a1a2e' }}>
                {t.pricing.pro.cta}
              </Link>
            </div>

            {/* Leads */}
            <div className="rounded-2xl p-8" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
              <p className="text-[14px] font-bold mb-1" style={{ color: '#64748b' }}>{t.pricing.leads.name}</p>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-[12px]" style={{ color: '#94a3b8' }}>{t.pricing.leads.priceFrom}</span>
                <span className="text-[40px] font-extrabold" style={{ color: '#1a1a2e' }}>{t.pricing.leads.price}</span>
                <span className="text-[14px]" style={{ color: '#94a3b8' }}>{t.pricing.leads.priceSub}</span>
              </div>
              <ul className="space-y-2 mb-8">
                {t.pricing.leads.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px]" style={{ color: '#475569' }}>
                    <span>✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block text-center px-6 py-3 rounded-xl text-[13px] font-bold" style={{ background: '#f1f5f9', color: '#1a1a2e' }}>
                {t.pricing.leads.cta}
              </Link>
            </div>
          </div>
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
    </div>
  )
}
