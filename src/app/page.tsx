import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ background: '#f8f9fc' }}>
      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-md" style={{ background: 'rgba(255,255,255,0.9)', borderBottom: '1px solid #e8ecf4' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16 sm:h-[72px]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-white text-xs sm:text-sm font-black" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>L</div>
            <span className="text-base sm:text-[17px] font-extrabold" style={{ color: '#1a1a2e' }}>LeadFlow</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="text-xs sm:text-[13px] font-semibold px-3 py-2" style={{ color: '#64748b' }}>Entrar</Link>
            <Link href="/register" className="text-xs sm:text-[13px] font-bold text-white px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl" style={{ background: '#6366f1' }}>
              Comecar
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%)' }}>
        {/* Background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute w-[500px] h-[500px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.3), transparent 70%)', top: '-20%', right: '-10%' }} />
          <div className="absolute w-[300px] h-[300px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.2), transparent 70%)', bottom: '-10%', left: '-5%' }} />
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-16 sm:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
            <div>
              <span className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full text-[11px] sm:text-[12px] font-bold mb-6" style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#34d399' }} /> Leads chegando agora
              </span>
              <h1 className="text-[32px] sm:text-[44px] lg:text-[52px] font-extrabold leading-[1.08] tracking-tight text-white mb-5">
                Leads <span style={{ color: '#a78bfa' }}>exclusivos</span> de brasileiros que querem seguro de vida
              </h1>
              <p className="text-[15px] sm:text-[18px] leading-relaxed mb-8" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Receba leads frescos direto das nossas campanhas no Meta. Brasileiros nos EUA, ja interessados em life insurance. Exclusivos para voce.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 mb-10">
                <Link href="/register" className="px-7 py-4 rounded-xl text-[15px] font-bold text-center" style={{ background: '#f59e0b', color: '#1a1a2e', boxShadow: '0 4px 14px rgba(245,158,11,0.4)' }}>
                  Comecar Agora — E Gratis
                </Link>
                <Link href="#pricing" className="px-7 py-4 rounded-xl text-[15px] font-bold text-white text-center" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
                  Ver Precos
                </Link>
              </div>
              <div className="flex gap-6 sm:gap-10">
                {[
                  { num: '200+', label: 'Leads/mes' },
                  { num: '100%', label: 'Exclusivos' },
                  { num: '<5s', label: 'Entrega' },
                ].map(s => (
                  <div key={s.label}>
                    <p className="text-[24px] sm:text-[28px] font-extrabold text-white">{s.num}</p>
                    <p className="text-[11px] sm:text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Hero Card - Dashboard Preview */}
            <div className="relative hidden sm:block">
              <div className="absolute -inset-4 rounded-3xl" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.1))', filter: 'blur(40px)' }} />
              <div className="relative rounded-2xl p-5 sm:p-6" style={{ background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-[14px] font-bold text-white">Leads de Hoje</h3>
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold" style={{ background: 'rgba(16,185,129,0.2)', color: '#34d399' }}>3 novos</span>
                </div>
                {[
                  { initials: 'RM', name: 'Rodrigo M.', state: 'FL', bg: '#6366f1', isNew: true },
                  { initials: 'AS', name: 'Amanda S.', state: 'MD', bg: '#8b5cf6', isNew: true },
                  { initials: 'CF', name: 'Carlos F.', state: 'TX', bg: '#ec4899', time: '12 min' },
                  { initials: 'JL', name: 'Julia L.', state: 'NJ', bg: '#f59e0b', time: '28 min' },
                  { initials: 'PR', name: 'Pedro R.', state: 'GA', bg: '#10b981', time: '1h' },
                ].map((lead, i) => (
                  <div key={i} className="flex items-center gap-3 py-3" style={{ borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <div className="w-9 h-9 rounded-xl text-white flex items-center justify-center text-[11px] font-bold" style={{ background: lead.bg }}>{lead.initials}</div>
                    <div className="flex-1">
                      <p className="text-[13px] font-bold text-white">{lead.name}</p>
                      <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{lead.state} — Seguro de vida</p>
                    </div>
                    {lead.isNew ? (
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold" style={{ background: 'rgba(16,185,129,0.2)', color: '#34d399' }}>NOVO</span>
                    ) : (
                      <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{lead.time}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trusted By Bar */}
      <div className="py-4 text-center text-[11px] font-semibold tracking-wider" style={{ background: '#fff', color: '#94a3b8', borderBottom: '1px solid #e8ecf4' }}>
        LEADS REAIS DO META ADS &nbsp;·&nbsp; BRASILEIROS NOS EUA &nbsp;·&nbsp; SEGURO DE VIDA &nbsp;·&nbsp; ENTREGA EM TEMPO REAL
      </div>

      {/* Problems */}
      <section className="py-16 sm:py-20" style={{ background: '#fff' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <span className="inline-block px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mb-4" style={{ background: '#eef2ff', color: '#6366f1' }}>O Problema</span>
          <h2 className="text-[28px] sm:text-[36px] font-extrabold tracking-tight mb-3" style={{ color: '#1a1a2e' }}>Voce sabe vender seguro.<br className="hidden sm:block"/>Mas encontrar clientes custa caro.</h2>
          <p className="text-[14px] sm:text-[16px] mb-10 sm:mb-12" style={{ color: '#64748b' }}>Indicacao seca, trafego pago caro, tempo gasto prospectando em vez de vendendo.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            {[
              { icon: '😴', title: 'Indicacoes secam', desc: 'Um mes tem 5, outro tem zero. Impossivel prever receita.' },
              { icon: '💸', title: 'Trafego pago e caro', desc: 'Rodar campanha exige budget, conhecimento de ads e teste A/B.' },
              { icon: '⏰', title: 'Tempo no lugar errado', desc: 'Voce deveria estar vendendo, nao prospectando.' },
            ].map((p, i) => (
              <div key={i} className="p-5 sm:p-6 rounded-2xl" style={{ border: '1px solid #e8ecf4' }}>
                <p className="text-[28px] mb-3">{p.icon}</p>
                <h3 className="text-[15px] sm:text-[16px] font-bold mb-2" style={{ color: '#1a1a2e' }}>{p.title}</h3>
                <p className="text-[13px] leading-relaxed" style={{ color: '#64748b' }}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how" className="py-16 sm:py-20" style={{ background: '#f8f9fc' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <span className="inline-block px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mb-4" style={{ background: '#eef2ff', color: '#6366f1' }}>Como Funciona</span>
          <h2 className="text-[28px] sm:text-[36px] font-extrabold tracking-tight mb-10 sm:mb-12" style={{ color: '#1a1a2e' }}>De zero a leads em 4 passos</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
            {[
              { num: 1, title: 'Escolha', desc: 'Lead ou Appointment. Min 10.' },
              { num: 2, title: 'Pague', desc: 'Cartao via Stripe. Na hora.' },
              { num: 3, title: 'Receba', desc: 'Leads em segundos no painel.' },
              { num: 4, title: 'Feche', desc: 'Ligue em 5 min. 3x conversao.' },
            ].map(s => (
              <div key={s.num} className="text-center p-4 rounded-2xl" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-[16px] sm:text-[18px] font-extrabold text-white mx-auto mb-3" style={{ background: '#6366f1' }}>{s.num}</div>
                <h3 className="text-[14px] sm:text-[15px] font-bold mb-1" style={{ color: '#1a1a2e' }}>{s.title}</h3>
                <p className="text-[12px] sm:text-[13px]" style={{ color: '#64748b' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products */}
      <section id="pricing" className="py-16 sm:py-20" style={{ background: '#fff' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-12">
            <span className="inline-block px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mb-4" style={{ background: '#eef2ff', color: '#6366f1' }}>Produtos</span>
            <h2 className="text-[28px] sm:text-[36px] font-extrabold tracking-tight mb-3" style={{ color: '#1a1a2e' }}>Dois caminhos para fechar apolices</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
            {/* Lead */}
            <div className="rounded-2xl sm:rounded-3xl p-8 sm:p-10 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #312e81, #6366f1)' }}>
              <div className="absolute top-0 right-0 w-40 h-40 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', transform: 'translate(30%,-30%)' }} />
              <span className="inline-block px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-bold mb-5" style={{ background: 'rgba(255,255,255,0.15)' }}>MAIS POPULAR</span>
              <h3 className="text-[22px] sm:text-[26px] font-extrabold mb-2">Lead Exclusivo</h3>
              <p className="text-white/70 mb-5 text-[13px] sm:text-[14px]">Entregue SOMENTE para voce.</p>
              <p className="text-[36px] sm:text-[42px] font-extrabold mb-1">$20–25<span className="text-[14px] sm:text-[16px] font-medium text-white/40">/lead</span></p>
              <p className="text-white/40 text-[11px] sm:text-[12px] mb-5">Minimo 10 leads por pedido</p>
              <ul className="space-y-2 mb-6">
                {['100% exclusivo', 'Entrega em tempo real', 'Notificacao por email', 'Filtro por estado'].map(item => (
                  <li key={item} className="flex items-center gap-2 text-[12px] sm:text-[13px] text-white/80">
                    <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px]" style={{ background: 'rgba(255,255,255,0.15)' }}>✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block text-center py-3 sm:py-3.5 rounded-xl font-bold text-[14px]" style={{ background: '#fff', color: '#1a1a2e' }}>Quero Leads</Link>
            </div>
            {/* Appointment */}
            <div className="rounded-2xl sm:rounded-3xl p-8 sm:p-10 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #7c2d12, #f59e0b)' }}>
              <div className="absolute top-0 right-0 w-40 h-40 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', transform: 'translate(30%,-30%)' }} />
              <span className="inline-block px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-bold mb-5" style={{ background: 'rgba(255,255,255,0.15)' }}>PREMIUM</span>
              <h3 className="text-[22px] sm:text-[26px] font-extrabold mb-2">Appointment</h3>
              <p className="text-white/70 mb-5 text-[13px] sm:text-[14px]">Nos qualificamos e agendamos pra voce.</p>
              <p className="text-[36px] sm:text-[42px] font-extrabold mb-1">$35–40<span className="text-[14px] sm:text-[16px] font-medium text-white/40">/appt</span></p>
              <p className="text-white/40 text-[11px] sm:text-[12px] mb-5">Minimo 10 por pedido</p>
              <ul className="space-y-2 mb-6">
                {['Lead qualificado por telefone', 'Agendado na sua agenda', 'Brief com perfil do lead', '~70% show-up rate'].map(item => (
                  <li key={item} className="flex items-center gap-2 text-[12px] sm:text-[13px] text-white/80">
                    <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px]" style={{ background: 'rgba(255,255,255,0.15)' }}>✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block text-center py-3 sm:py-3.5 rounded-xl font-bold text-[14px]" style={{ background: '#fff', color: '#1a1a2e' }}>Quero Appointments</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof / Testimonial */}
      <section className="py-16 sm:py-20 relative overflow-hidden" style={{ background: '#1e1b4b' }}>
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(99,102,241,0.15) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-[20px] sm:text-[28px] font-bold text-white leading-relaxed mb-8">
            &ldquo;Em 30 dias, fechei 3 apolices com os leads do LeadFlow. O investimento de $440 me rendeu mais de $1.800 em comissoes. Melhor ROI que qualquer campanha que eu ja fiz.&rdquo;
          </p>
          <div className="flex items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[14px] font-bold" style={{ background: 'linear-gradient(135deg, #6366f1, #a78bfa)' }}>RM</div>
            <div className="text-left">
              <p className="text-[14px] font-bold text-white">Roberto M.</p>
              <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Agente de Seguros — FL</p>
            </div>
          </div>
        </div>
      </section>

      {/* ROI Calculator */}
      <section className="py-16 sm:py-20" style={{ background: '#f8f9fc' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 items-center">
          <div>
            <span className="inline-block px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mb-4" style={{ background: '#eef2ff', color: '#6366f1' }}>Retorno</span>
            <h2 className="text-[28px] sm:text-[36px] font-extrabold tracking-tight mb-4" style={{ color: '#1a1a2e' }}>1 apolice paga todos os seus leads do mes</h2>
            <p className="text-[14px] sm:text-[16px] mb-6 leading-relaxed" style={{ color: '#64748b' }}>Com 20 leads a $22, voce investe $440. Uma venda com comissao de $600 = lucro no primeiro fechamento.</p>
            <div className="rounded-xl px-4 sm:px-5 py-4 mb-6" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
              <p className="text-[12px] sm:text-[13px] font-semibold" style={{ color: '#92400e' }}>📈 Agentes fecham 2-3 apolices/mes com 20 leads</p>
            </div>
            <Link href="/register" className="inline-block px-7 py-3.5 rounded-xl text-[15px] font-bold text-white" style={{ background: '#6366f1' }}>Comecar Agora</Link>
          </div>
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: '#fff', border: '1px solid #e8ecf4', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
            <h3 className="text-[15px] sm:text-[16px] font-bold mb-5" style={{ color: '#1a1a2e' }}>💲 Simulacao — 20 Leads</h3>
            {[
              { label: '20 leads x $22', value: '-$440', color: '#64748b' },
              { label: 'Contato (~38%)', value: '~8 atendimentos', color: '#1a1a2e' },
              { label: 'Conversao (~12%)', value: '~2 apolices', color: '#1a1a2e' },
              { label: 'Comissao/apolice', value: '~$600', color: '#1a1a2e' },
            ].map((row, i) => (
              <div key={i} className="flex justify-between py-3" style={{ borderBottom: '1px solid #f1f5f9' }}>
                <span className="text-[12px] sm:text-[13px]" style={{ color: '#64748b' }}>{row.label}</span>
                <span className="text-[12px] sm:text-[13px] font-bold" style={{ color: row.color }}>{row.value}</span>
              </div>
            ))}
            <div className="flex justify-between py-4 mt-2" style={{ borderTop: '2px solid #e8ecf4' }}>
              <span className="text-[14px] sm:text-[15px] font-bold" style={{ color: '#1a1a2e' }}>Lucro estimado</span>
              <span className="text-[20px] sm:text-[22px] font-extrabold" style={{ color: '#10b981' }}>+$760</span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 sm:py-20" style={{ background: '#fff' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-12">
            <span className="inline-block px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mb-4" style={{ background: '#eef2ff', color: '#6366f1' }}>Duvidas</span>
            <h2 className="text-[28px] sm:text-[36px] font-extrabold tracking-tight" style={{ color: '#1a1a2e' }}>Perguntas frequentes</h2>
          </div>
          {[
            { q: 'De onde vem esses leads?', a: 'Campanhas pagas no Instagram e Facebook segmentadas para brasileiros nos EUA interessados em seguro de vida.' },
            { q: 'O lead e exclusivo?', a: 'Sim, 100%. Cada lead e entregue para um unico agente.' },
            { q: 'Preciso ser de alguma seguradora?', a: 'Nao. Qualquer seguradora.' },
            { q: 'Como recebo os leads?', a: 'Por email e no seu painel online. Em menos de 5 segundos.' },
            { q: 'Lead vs Appointment?', a: 'No Lead voce liga. No Appointment, nos ligamos e agendamos na sua agenda.' },
            { q: 'Posso cancelar?', a: 'Sim. Sem contrato. Compra pacotes avulsos.' },
          ].map((faq, i) => (
            <details key={i} className="rounded-xl mb-2 sm:mb-3 overflow-hidden" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
              <summary className="px-4 sm:px-6 py-3 sm:py-4 cursor-pointer text-[13px] sm:text-[14px] font-bold list-none flex justify-between items-center" style={{ color: '#1a1a2e' }}>
                {faq.q}
                <span style={{ color: '#94a3b8' }}>+</span>
              </summary>
              <p className="px-4 sm:px-6 pb-3 sm:pb-4 text-[12px] sm:text-[13px] leading-relaxed" style={{ color: '#64748b' }}>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 sm:py-20 text-white text-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81, #6366f1)' }}>
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
        <div className="relative z-10 max-w-xl mx-auto px-4 sm:px-6">
          <h2 className="text-[28px] sm:text-[36px] font-extrabold tracking-tight mb-4">Pare de prospectar.<br/>Comece a fechar.</h2>
          <p className="text-[14px] sm:text-[16px] text-white/50 mb-8">Leads exclusivos. Em segundos. So para voce.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8 sm:mb-10">
            <Link href="/register" className="px-7 py-4 rounded-xl text-[15px] font-bold text-center" style={{ background: '#f59e0b', color: '#1a1a2e' }}>Quero Receber Leads</Link>
            <a href="https://wa.me/14075551234" className="px-7 py-4 rounded-xl text-[15px] font-bold text-white text-center" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>WhatsApp</a>
          </div>
          <div className="flex flex-wrap gap-4 sm:gap-8 justify-center text-white/30 text-[11px] sm:text-[12px]">
            <span>🔒 Pagamento seguro</span><span>🔔 Tempo real</span><span>🎯 Exclusivos</span><span>✕ Sem contrato</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 sm:py-10 text-center text-[11px] sm:text-[12px]" style={{ background: '#1a1a2e', color: '#64748b' }}>
        <p className="font-semibold" style={{ color: '#94a3b8' }}>LeadFlow</p>
        <p className="mt-1">&copy; 2026 LeadFlow. Todos os direitos reservados.</p>
      </footer>
    </div>
  )
}
