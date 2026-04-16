import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ background: '#f8f9fc' }}>
      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-md" style={{ background: 'rgba(255,255,255,0.92)', borderBottom: '1px solid #e8ecf4' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16 sm:h-[72px]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-white text-xs sm:text-sm font-black" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>L</div>
            <span className="text-base sm:text-[17px] font-extrabold" style={{ color: '#1a1a2e' }}>Lead4Producers</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="hidden sm:inline text-[13px] font-semibold px-4 py-2" style={{ color: '#64748b' }}>Entrar</Link>
            <Link href="/register" className="text-xs sm:text-[13px] font-bold text-white px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl" style={{ background: '#6366f1' }}>
              Criar Conta Gratis
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

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-16 sm:pb-28 text-center">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold mb-6" style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#34d399' }} /> Plataforma completa para insurance producers
          </span>
          <h1 className="text-[32px] sm:text-[44px] lg:text-[54px] font-extrabold leading-[1.06] tracking-tight text-white mb-6 max-w-4xl mx-auto">
            Leads exclusivos + CRM completo para <span style={{ color: '#a78bfa' }}>producers de seguro</span>
          </h1>
          <p className="text-[15px] sm:text-[18px] leading-relaxed mb-10 max-w-2xl mx-auto" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Receba leads de brasileiros nos EUA que querem seguro de vida. Gerencie seu pipeline, distribua pro time, acompanhe follow-ups e feche mais negocios.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
            <Link href="/register" className="px-8 py-4 rounded-xl text-[15px] font-bold text-center inline-block" style={{ background: 'linear-gradient(135deg, #f59e0b, #eab308)', color: '#1a1a2e', boxShadow: '0 4px 20px rgba(245,158,11,0.35)' }}>
              Criar Conta Gratis
            </Link>
            <Link href="#pricing" className="px-8 py-4 rounded-xl text-[15px] font-bold text-white text-center inline-block" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
              Ver Precos
            </Link>
          </div>

          {/* 3 stats */}
          <div className="flex flex-wrap justify-center gap-8 sm:gap-16">
            {[
              { n: '$22', label: 'por lead exclusivo' },
              { n: '< 5min', label: 'entrega via WhatsApp' },
              { n: '100%', label: 'exclusivo (1 lead = 1 producer)' },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <p className="text-[28px] sm:text-[36px] font-extrabold text-white">{s.n}</p>
                <p className="text-[12px] sm:text-[13px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== 2 PILLARS ==================== */}
      <section className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-center text-[12px] font-bold uppercase tracking-widest mb-3" style={{ color: '#6366f1' }}>Tudo que voce precisa</p>
          <h2 className="text-center text-[28px] sm:text-[36px] font-extrabold mb-4" style={{ color: '#1a1a2e' }}>Leads + CRM em uma plataforma</h2>
          <p className="text-center text-[15px] mb-12 max-w-xl mx-auto" style={{ color: '#94a3b8' }}>Pare de usar 5 ferramentas diferentes. Compre leads, gerencie pipeline, distribua pro time — tudo aqui.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Pillar 1: Leads */}
            <div className="rounded-2xl p-8 sm:p-10" style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-5" style={{ background: 'rgba(99,102,241,0.2)' }}>
                <span className="text-[28px]">🎯</span>
              </div>
              <h3 className="text-[22px] font-extrabold text-white mb-3">Leads Exclusivos</h3>
              <p className="text-[14px] leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Campanhas no Meta Ads gerando leads de brasileiros nos EUA interessados em seguro de vida. Cada lead vai pra UM producer — sem compartilhar.
              </p>
              <ul className="space-y-3 mb-6">
                {['Entrega em tempo real via WhatsApp + email', 'Filtro por estado (sua licenca)', 'Lead quente = pessoa preencheu formulario agora', 'Appointments pre-qualificados disponíveis'].map((t, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="text-[14px] mt-0.5" style={{ color: '#34d399' }}>✓</span>
                    <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.7)' }}>{t}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-baseline gap-2">
                <span className="text-[36px] font-extrabold text-white">$22</span>
                <span className="text-[14px]" style={{ color: 'rgba(255,255,255,0.4)' }}>/lead</span>
              </div>
            </div>

            {/* Pillar 2: CRM */}
            <div className="rounded-2xl p-8 sm:p-10" style={{ background: '#fff', border: '1px solid #e8ecf4', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
              <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-5" style={{ background: '#eef2ff' }}>
                <span className="text-[28px]">📋</span>
              </div>
              <h3 className="text-[22px] font-extrabold mb-3" style={{ color: '#1a1a2e' }}>CRM para Producers</h3>
              <p className="text-[14px] leading-relaxed mb-6" style={{ color: '#94a3b8' }}>
                Pipeline visual (Kanban), gestao de time, follow-ups, anexos, relatorios. Tudo feito pra quem vende seguro.
              </p>
              <ul className="space-y-3 mb-6">
                {['Pipeline Kanban com drag-and-drop', 'Gestao de time (distribua leads pro seu time)', 'Follow-ups e historico de contato', 'Anexos (propostas, contratos, docs)', 'Dashboard de performance'].map((t, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="text-[14px] mt-0.5" style={{ color: '#6366f1' }}>✓</span>
                    <span className="text-[13px]" style={{ color: '#64748b' }}>{t}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-baseline gap-2">
                <span className="text-[36px] font-extrabold" style={{ color: '#1a1a2e' }}>$99</span>
                <span className="text-[14px]" style={{ color: '#94a3b8' }}>/mes</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== HOW IT WORKS ==================== */}
      <section id="how" className="py-16 sm:py-24" style={{ background: '#fff' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-center text-[12px] font-bold uppercase tracking-widest mb-3" style={{ color: '#6366f1' }}>Como funciona</p>
          <h2 className="text-center text-[28px] sm:text-[36px] font-extrabold mb-12" style={{ color: '#1a1a2e' }}>3 passos pra comecar</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '1', icon: '📝', title: 'Crie sua conta gratis', desc: 'Cadastre-se em 30 segundos. Configure seus estados, disponibilidade e dados de contato.' },
              { step: '2', icon: '💳', title: 'Compre leads ou assine o CRM', desc: 'Pacotes de leads a partir de 10 unidades. CRM por $99/mes com todas as features.' },
              { step: '3', icon: '📱', title: 'Receba e gerencie', desc: 'Leads chegam no WhatsApp em tempo real. Use o pipeline pra acompanhar cada deal ate o fechamento.' },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: '#eef2ff' }}>
                  <span className="text-[28px]">{s.icon}</span>
                </div>
                <div className="w-8 h-8 rounded-full flex items-center justify-center mx-auto -mt-8 mb-4 text-[12px] font-extrabold text-white" style={{ background: '#6366f1' }}>{s.step}</div>
                <h3 className="text-[17px] font-bold mb-2" style={{ color: '#1a1a2e' }}>{s.title}</h3>
                <p className="text-[14px] leading-relaxed" style={{ color: '#94a3b8' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== PRICING ==================== */}
      <section id="pricing" className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-center text-[12px] font-bold uppercase tracking-widest mb-3" style={{ color: '#6366f1' }}>Precos transparentes</p>
          <h2 className="text-center text-[28px] sm:text-[36px] font-extrabold mb-4" style={{ color: '#1a1a2e' }}>Pague so pelo que usar</h2>
          <p className="text-center text-[15px] mb-12 max-w-xl mx-auto" style={{ color: '#94a3b8' }}>Conta gratis. Compre leads avulso. Assine o CRM quando quiser.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Free */}
            <div className="rounded-2xl p-8" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
              <p className="text-[12px] font-bold uppercase tracking-wider mb-2" style={{ color: '#94a3b8' }}>Conta</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-[40px] font-extrabold" style={{ color: '#1a1a2e' }}>Gratis</span>
              </div>
              <p className="text-[13px] mb-6" style={{ color: '#94a3b8' }}>Pra sempre, sem cartao</p>
              <ul className="space-y-3 mb-8">
                {['Dashboard de leads', 'Notificacao WhatsApp + email', 'Configurar estados/licencas', 'Historico de atividades'].map((t, i) => (
                  <li key={i} className="flex items-center gap-2.5">
                    <span className="text-[13px]" style={{ color: '#10b981' }}>✓</span>
                    <span className="text-[13px]" style={{ color: '#64748b' }}>{t}</span>
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block text-center py-3.5 rounded-xl text-[14px] font-bold" style={{ background: '#f1f5f9', color: '#64748b' }}>
                Criar Conta
              </Link>
            </div>

            {/* Leads */}
            <div className="rounded-2xl p-8 relative" style={{ background: '#fff', border: '2px solid #6366f1', boxShadow: '0 8px 30px rgba(99,102,241,0.12)' }}>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[11px] font-bold text-white" style={{ background: '#6366f1' }}>Mais popular</div>
              <p className="text-[12px] font-bold uppercase tracking-wider mb-2" style={{ color: '#6366f1' }}>Leads</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-[40px] font-extrabold" style={{ color: '#1a1a2e' }}>$22</span>
                <span className="text-[14px]" style={{ color: '#94a3b8' }}>/lead</span>
              </div>
              <p className="text-[13px] mb-6" style={{ color: '#94a3b8' }}>Minimo 10 leads por pacote</p>
              <ul className="space-y-3 mb-4">
                {['Leads quentes exclusivos ($22/un)', 'Appointments pre-qualificados ($39/un)', 'Leads frios com desconto (a partir $3)', 'Filtro por estado', 'Entrega em tempo real'].map((t, i) => (
                  <li key={i} className="flex items-center gap-2.5">
                    <span className="text-[13px]" style={{ color: '#6366f1' }}>✓</span>
                    <span className="text-[13px]" style={{ color: '#64748b' }}>{t}</span>
                  </li>
                ))}
              </ul>
              <div className="rounded-lg p-3 mb-6" style={{ background: '#fef3c7' }}>
                <p className="text-[11px] font-bold" style={{ color: '#92400e' }}>Pacotes: 10 leads ($220) · 25 leads ($500) · 50 leads ($900)</p>
              </div>
              <Link href="/register" className="block text-center py-3.5 rounded-xl text-[14px] font-bold text-white" style={{ background: '#6366f1', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
                Comprar Leads
              </Link>
            </div>

            {/* CRM */}
            <div className="rounded-2xl p-8" style={{ background: 'linear-gradient(160deg, #0f0a2e, #1e1b4b)', border: '1px solid rgba(99,102,241,0.3)' }}>
              <p className="text-[12px] font-bold uppercase tracking-wider mb-2" style={{ color: '#a78bfa' }}>CRM Pro</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-[40px] font-extrabold text-white">$99</span>
                <span className="text-[14px]" style={{ color: 'rgba(255,255,255,0.4)' }}>/mes</span>
              </div>
              <p className="text-[13px] mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>Cancele quando quiser</p>
              <ul className="space-y-3 mb-8">
                {['Tudo do plano gratis', 'Pipeline Kanban (drag-and-drop)', 'Gestao de time ilimitada', 'Follow-ups e lembretes', 'Anexos e documentos', 'Relatorios de performance', 'Features novas incluidas'].map((t, i) => (
                  <li key={i} className="flex items-center gap-2.5">
                    <span className="text-[13px]" style={{ color: '#a78bfa' }}>✓</span>
                    <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.7)' }}>{t}</span>
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block text-center py-3.5 rounded-xl text-[14px] font-bold" style={{ background: 'linear-gradient(135deg, #a78bfa, #6366f1)', color: '#fff', boxShadow: '0 4px 14px rgba(139,92,246,0.3)' }}>
                Assinar CRM Pro
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== FEATURES GRID ==================== */}
      <section className="py-16 sm:py-24" style={{ background: '#fff' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-center text-[28px] sm:text-[36px] font-extrabold mb-12" style={{ color: '#1a1a2e' }}>Feito pra insurance producers</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: '📱', title: 'WhatsApp em tempo real', desc: 'Lead chega no seu celular na hora. Nome, telefone, interesse — tudo pronto pra ligar.' },
              { icon: '📋', title: 'Pipeline visual', desc: 'Kanban com drag-and-drop. Acompanhe cada lead do primeiro contato ao fechamento.' },
              { icon: '👥', title: 'Gestao de time', desc: 'Distribua leads pro seu time. Automatico ou manual. Cada agente recebe no WhatsApp.' },
              { icon: '📌', title: 'Follow-ups', desc: 'Registre ligacoes, notas, reunioes. Nunca esqueca de fazer o follow-up.' },
              { icon: '📎', title: 'Anexos e docs', desc: 'Suba propostas, contratos, documentos. Tudo organizado por lead.' },
              { icon: '📈', title: 'Dashboard de custos', desc: 'Veja CPL, ROI e margem por campanha, criativo e estado. Dados reais do Meta Ads.' },
            ].map((f, i) => (
              <div key={i} className="rounded-xl p-6" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
                <span className="text-[28px] block mb-3">{f.icon}</span>
                <h3 className="text-[16px] font-bold mb-2" style={{ color: '#1a1a2e' }}>{f.title}</h3>
                <p className="text-[13px] leading-relaxed" style={{ color: '#94a3b8' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== TESTIMONIAL ==================== */}
      <section className="py-16 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="rounded-2xl p-8 sm:p-12" style={{ background: '#fff', border: '1px solid #e8ecf4', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 text-white text-[20px] font-bold" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>RM</div>
            <p className="text-[16px] sm:text-[18px] leading-relaxed mb-6" style={{ color: '#475569' }}>
              &ldquo;Em 30 dias, fechei 3 apolices com os leads do Lead4Producers. O investimento de $440 me rendeu mais de $1.800 em comissoes. Com o CRM fico organizado e nao perco nenhum follow-up.&rdquo;
            </p>
            <p className="text-[14px] font-bold" style={{ color: '#1a1a2e' }}>Ricardo M.</p>
            <p className="text-[12px]" style={{ color: '#94a3b8' }}>Insurance Producer — Florida</p>
          </div>
        </div>
      </section>

      {/* ==================== CTA ==================== */}
      <section className="py-16 sm:py-24" style={{ background: 'linear-gradient(160deg, #0f0a2e 0%, #1e1b4b 50%, #312e81 100%)' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-[28px] sm:text-[40px] font-extrabold text-white mb-4">Comece gratis hoje</h2>
          <p className="text-[15px] sm:text-[17px] mb-8" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Crie sua conta em 30 segundos. Sem cartao. Compre leads ou assine o CRM quando estiver pronto.
          </p>
          <Link href="/register" className="inline-block px-10 py-4 rounded-xl text-[16px] font-bold" style={{ background: 'linear-gradient(135deg, #f59e0b, #eab308)', color: '#1a1a2e', boxShadow: '0 4px 20px rgba(245,158,11,0.35)' }}>
            Criar Minha Conta Gratis
          </Link>
        </div>
      </section>

      {/* ==================== FOOTER ==================== */}
      <footer className="py-10" style={{ background: '#fff', borderTop: '1px solid #e8ecf4' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-black" style={{ background: '#6366f1' }}>L</div>
            <span className="text-[14px] font-bold" style={{ color: '#94a3b8' }}>Lead4Producers</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-[12px]" style={{ color: '#94a3b8' }}>Privacidade</Link>
            <Link href="/login" className="text-[12px]" style={{ color: '#94a3b8' }}>Login</Link>
            <Link href="/register" className="text-[12px]" style={{ color: '#94a3b8' }}>Cadastro</Link>
          </div>
          <p className="text-[11px]" style={{ color: '#c0c8d4' }}>&copy; 2026 Lead4Producers. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  )
}
