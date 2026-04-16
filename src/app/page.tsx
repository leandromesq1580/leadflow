import Link from 'next/link'
import Image from 'next/image'

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
              Comecar Gratis
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

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-16 sm:pb-28">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold mb-6" style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}>
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#34d399' }} /> Leads chegando agora
              </span>
              <h1 className="text-[32px] sm:text-[44px] lg:text-[54px] font-extrabold leading-[1.06] tracking-tight text-white mb-6">
                Receba leads de brasileiros que <span className="relative">
                  <span style={{ color: '#a78bfa' }}>querem seguro</span>
                  <span className="absolute bottom-0 left-0 w-full h-[3px] rounded" style={{ background: 'linear-gradient(90deg, #a78bfa, #6366f1)' }} />
                </span> de vida nos EUA
              </h1>
              <p className="text-[15px] sm:text-[18px] leading-relaxed mb-8 max-w-lg" style={{ color: 'rgba(255,255,255,0.55)' }}>
                Campanhas no Meta Ads gerando leads exclusivos em tempo real. Voce so precisa ligar e fechar. Sem prospectar, sem rodar ads, sem desperdicar tempo.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 mb-10">
                <Link href="/register" className="px-8 py-4 rounded-xl text-[15px] font-bold text-center inline-block" style={{ background: 'linear-gradient(135deg, #f59e0b, #eab308)', color: '#1a1a2e', boxShadow: '0 4px 20px rgba(245,158,11,0.35)' }}>
                  Comecar Agora — E Gratis
                </Link>
                <Link href="#how" className="px-8 py-4 rounded-xl text-[15px] font-bold text-white text-center inline-block" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
                  Como Funciona ↓
                </Link>
              </div>
              <div className="flex gap-8 sm:gap-12">
                {[
                  { num: '200+', label: 'Leads gerados/mes' },
                  { num: '100%', label: 'Exclusivos pra voce' },
                  { num: '<5s', label: 'Tempo de entrega' },
                ].map(s => (
                  <div key={s.label}>
                    <p className="text-[26px] sm:text-[32px] font-extrabold text-white">{s.num}</p>
                    <p className="text-[10px] sm:text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Hero Visual - Dashboard Preview */}
            <div className="relative">
              <div className="absolute -inset-8 rounded-3xl" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.08))', filter: 'blur(60px)' }} />
              {/* Main card */}
              <div className="relative rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)' }}>
                {/* Fake browser bar */}
                <div className="flex items-center gap-2 px-4 py-3" style={{ background: 'rgba(0,0,0,0.2)' }}>
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#ef4444' }} />
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#f59e0b' }} />
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#10b981' }} />
                  </div>
                  <div className="flex-1 mx-8 px-3 py-1 rounded text-[10px] text-center" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)' }}>
                    lead4producers.com/dashboard
                  </div>
                </div>
                <div className="p-5">
                  {/* Mini dashboard */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-[14px] font-bold text-white">Bom dia, Agente 👋</p>
                      <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>3 novos leads hoje</p>
                    </div>
                    <div className="px-3 py-1.5 rounded-lg text-[10px] font-bold" style={{ background: 'rgba(99,102,241,0.3)', color: '#a78bfa' }}>+ Comprar</div>
                  </div>
                  {/* Stats mini */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {[{ label: 'Leads', value: '47', color: '#6366f1' }, { label: 'Contato', value: '38%', color: '#10b981' }, { label: 'Creditos', value: '23', color: '#f59e0b' }].map(s => (
                      <div key={s.label} className="rounded-lg p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <p className="text-[16px] font-extrabold text-white">{s.value}</p>
                        <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{s.label}</p>
                      </div>
                    ))}
                  </div>
                  {/* Leads list */}
                  {[
                    { initials: 'RM', name: 'Rodrigo M.', state: 'FL', bg: '#6366f1', badge: 'NOVO' },
                    { initials: 'AS', name: 'Amanda S.', state: 'MD', bg: '#8b5cf6', badge: 'NOVO' },
                    { initials: 'CF', name: 'Carlos F.', state: 'TX', bg: '#ec4899', badge: '' },
                  ].map((lead, i) => (
                    <div key={i} className="flex items-center gap-3 py-2.5" style={{ borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <div className="w-8 h-8 rounded-lg text-white flex items-center justify-center text-[10px] font-bold" style={{ background: lead.bg }}>{lead.initials}</div>
                      <div className="flex-1">
                        <p className="text-[12px] font-bold text-white">{lead.name}</p>
                        <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{lead.state} · Seguro de vida</p>
                      </div>
                      {lead.badge && <span className="px-1.5 py-0.5 rounded text-[8px] font-bold" style={{ background: 'rgba(16,185,129,0.2)', color: '#34d399' }}>{lead.badge}</span>}
                    </div>
                  ))}
                </div>
              </div>
              {/* Floating notification */}
              <div className="absolute -bottom-4 -left-4 sm:-left-8 rounded-xl p-3 hidden sm:flex items-center gap-3" style={{ background: '#fff', boxShadow: '0 8px 30px rgba(0,0,0,0.15)', border: '1px solid #e8ecf4' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#ecfdf5' }}>
                  <span className="text-[14px]">📧</span>
                </div>
                <div>
                  <p className="text-[11px] font-bold" style={{ color: '#1a1a2e' }}>Novo lead recebido!</p>
                  <p className="text-[9px]" style={{ color: '#94a3b8' }}>Rodrigo M. — FL — Agora</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== FEATURES ==================== */}
      <section className="py-16 sm:py-24" style={{ background: '#fff' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 sm:mb-16">
            <span className="inline-block px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mb-4" style={{ background: '#eef2ff', color: '#6366f1' }}>Funcionalidades</span>
            <h2 className="text-[28px] sm:text-[40px] font-extrabold tracking-tight mb-4" style={{ color: '#1a1a2e' }}>Tudo que voce precisa pra<br className="hidden sm:block"/> receber e converter leads</h2>
            <p className="text-[14px] sm:text-[16px] max-w-2xl mx-auto" style={{ color: '#64748b' }}>Um sistema completo que faz o trabalho pesado por voce</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {[
              { icon: '⚡', title: 'Entrega em Tempo Real', desc: 'Lead preenche o form no Instagram, em menos de 5 segundos voce recebe no painel e por email. Quente, pronto pra ligar.', color: '#6366f1' },
              { icon: '🎯', title: '100% Exclusivo', desc: 'Cada lead e entregue pra um unico agente. Ninguem mais recebe o mesmo contato. Zero competicao pelo mesmo cliente.', color: '#8b5cf6' },
              { icon: '📍', title: 'Filtro por Estado', desc: 'Voce configura quais estados tem licenca. O sistema so distribui leads desses estados pra voce. Zero lead desperdicado.', color: '#ec4899' },
              { icon: '💳', title: 'Pague com Cartao', desc: 'Checkout seguro via Stripe. Compre pacotes de 10, 25 ou 50 leads. Creditos ativados na hora, sem espera.', color: '#f59e0b' },
              { icon: '📊', title: 'Dashboard Completo', desc: 'Painel pra acompanhar seus leads, creditos, taxa de conversao. Registre atividades, marque como convertido.', color: '#10b981' },
              { icon: '📅', title: 'Appointments Agendados', desc: 'Nos ligamos pro lead, qualificamos o interesse, e agendamos direto na sua agenda. Voce so faz a reuniao e fecha.', color: '#ef4444' },
            ].map((f, i) => (
              <div key={i} className="p-6 sm:p-7 rounded-2xl group hover:-translate-y-1 transition-transform" style={{ background: '#fff', border: '1px solid #e8ecf4', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-[22px] mb-4" style={{ background: f.color + '15' }}>
                  {f.icon}
                </div>
                <h3 className="text-[16px] sm:text-[17px] font-bold mb-2" style={{ color: '#1a1a2e' }}>{f.title}</h3>
                <p className="text-[13px] leading-relaxed" style={{ color: '#64748b' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== HOW IT WORKS ==================== */}
      <section id="how" className="py-16 sm:py-24 relative overflow-hidden" style={{ background: '#f8f9fc' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 sm:mb-16">
            <span className="inline-block px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mb-4" style={{ background: '#eef2ff', color: '#6366f1' }}>Passo a Passo</span>
            <h2 className="text-[28px] sm:text-[40px] font-extrabold tracking-tight" style={{ color: '#1a1a2e' }}>Como funciona na pratica</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { num: '01', icon: '📋', title: 'Crie sua conta', desc: 'Cadastro gratuito em 30 segundos. Configure quais estados voce tem licenca.' },
              { num: '02', icon: '💳', title: 'Compre creditos', desc: 'Escolha pacote de leads ou appointments. Pague com cartao via Stripe.' },
              { num: '03', icon: '📱', title: 'Receba leads', desc: 'Quando um brasileiro preenche nosso form, voce recebe por email e no painel.' },
              { num: '04', icon: '🏆', title: 'Feche vendas', desc: 'Ligue nos primeiros 5 minutos. Leads frescos tem 3x mais chance de conversao.' },
            ].map(s => (
              <div key={s.num} className="relative p-6 rounded-2xl" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
                <span className="text-[48px] font-extrabold absolute top-4 right-4" style={{ color: '#eef2ff' }}>{s.num}</span>
                <span className="text-[28px] mb-4 block">{s.icon}</span>
                <h3 className="text-[16px] font-bold mb-2" style={{ color: '#1a1a2e' }}>{s.title}</h3>
                <p className="text-[13px] leading-relaxed" style={{ color: '#64748b' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== PRODUCTS ==================== */}
      <section id="pricing" className="py-16 sm:py-24" style={{ background: '#fff' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 sm:mb-16">
            <span className="inline-block px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mb-4" style={{ background: '#eef2ff', color: '#6366f1' }}>Precos</span>
            <h2 className="text-[28px] sm:text-[40px] font-extrabold tracking-tight mb-3" style={{ color: '#1a1a2e' }}>Escolha como quer receber clientes</h2>
            <p className="text-[14px] sm:text-[16px]" style={{ color: '#64748b' }}>Lead pra voce ligar, ou appointment ja agendado na sua agenda</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 max-w-4xl mx-auto">
            <div className="rounded-2xl sm:rounded-3xl p-8 sm:p-10 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1e1b4b, #4338ca)' }}>
              <div className="absolute top-0 right-0 w-48 h-48 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', transform: 'translate(30%,-30%)' }} />
              <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold mb-6" style={{ background: 'rgba(255,255,255,0.12)' }}>MAIS POPULAR</span>
              <h3 className="text-[24px] sm:text-[28px] font-extrabold mb-2">Lead Exclusivo</h3>
              <p className="text-white/60 mb-6 text-[13px]">Voce recebe o contato e liga</p>
              <p className="text-[44px] sm:text-[52px] font-extrabold leading-none mb-1">$20<span className="text-[18px] font-medium text-white/30">–25/lead</span></p>
              <p className="text-white/30 text-[12px] mb-6">Min 10 leads · Pacotes de 10, 25 ou 50</p>
              <div className="h-px mb-6" style={{ background: 'rgba(255,255,255,0.1)' }} />
              <ul className="space-y-3 mb-8">
                {['Brasileiro nos EUA com interesse real', 'Exclusivo — ninguem mais recebe', 'Entrega em <5 segundos', 'Email de notificacao', 'Dashboard com historico', 'Filtro por estado/licenca'].map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-[13px] text-white/75">
                    <span className="mt-0.5">✓</span>{item}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block text-center py-3.5 rounded-xl font-bold text-[14px]" style={{ background: '#fff', color: '#1a1a2e' }}>Comecar com Leads</Link>
            </div>
            <div className="rounded-2xl sm:rounded-3xl p-8 sm:p-10 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #78350f, #d97706, #f59e0b)' }}>
              <div className="absolute top-0 right-0 w-48 h-48 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', transform: 'translate(30%,-30%)' }} />
              <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold mb-6" style={{ background: 'rgba(255,255,255,0.12)' }}>PREMIUM</span>
              <h3 className="text-[24px] sm:text-[28px] font-extrabold mb-2">Appointment</h3>
              <p className="text-white/60 mb-6 text-[13px]">Nos ligamos, qualificamos e agendamos</p>
              <p className="text-[44px] sm:text-[52px] font-extrabold leading-none mb-1">$35<span className="text-[18px] font-medium text-white/30">–40/appt</span></p>
              <p className="text-white/30 text-[12px] mb-6">Min 10 appts · Pacotes de 10 ou 25</p>
              <div className="h-px mb-6" style={{ background: 'rgba(255,255,255,0.1)' }} />
              <ul className="space-y-3 mb-8">
                {['Lead qualificado por telefone', 'Agendado direto na sua agenda', 'Brief com perfil e interesse', '~70% taxa de comparecimento', 'Voce so faz a reuniao e fecha', 'Filtro por estado + horarios'].map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-[13px] text-white/75">
                    <span className="mt-0.5">✓</span>{item}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block text-center py-3.5 rounded-xl font-bold text-[14px]" style={{ background: '#fff', color: '#1a1a2e' }}>Comecar com Appointments</Link>
            </div>
          </div>
          {/* Cold leads banner */}
          <div className="mt-8 rounded-2xl p-6 sm:p-8 text-center max-w-4xl mx-auto" style={{ background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
            <p className="text-[14px] sm:text-[16px] font-bold mb-1" style={{ color: '#1a1a2e' }}>❄️ Leads Frios a partir de $3/lead</p>
            <p className="text-[12px] sm:text-[13px]" style={{ color: '#64748b' }}>Leads com 7+ dias. Preco reduzido, volume alto. Perfeito pra quem quer testar.</p>
          </div>
        </div>
      </section>

      {/* ==================== COMPARISON TABLE ==================== */}
      <section className="py-16 sm:py-24" style={{ background: '#f8f9fc' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="inline-block px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mb-4" style={{ background: '#eef2ff', color: '#6366f1' }}>Comparacao</span>
            <h2 className="text-[28px] sm:text-[36px] font-extrabold tracking-tight" style={{ color: '#1a1a2e' }}>Lead vs Appointment</h2>
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr style={{ background: '#f8f9fc', borderBottom: '2px solid #e8ecf4' }}>
                    <th className="text-left px-4 sm:px-6 py-3 text-[11px] font-bold uppercase" style={{ color: '#94a3b8' }}>Caracteristica</th>
                    <th className="text-center px-4 sm:px-6 py-3 text-[11px] font-bold uppercase" style={{ color: '#6366f1' }}>Lead Exclusivo</th>
                    <th className="text-center px-4 sm:px-6 py-3 text-[11px] font-bold uppercase" style={{ color: '#f59e0b' }}>Appointment</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { feat: 'Preco', lead: '$20-25/lead', appt: '$35-40/appt' },
                    { feat: 'Voce precisa ligar?', lead: 'Sim', appt: 'Nao, nos ligamos' },
                    { feat: 'Qualificado?', lead: 'Interesse via form', appt: 'Qualificado por telefone' },
                    { feat: 'Agendamento', lead: '—', appt: 'Na sua agenda' },
                    { feat: 'Exclusividade', lead: '✓ 100%', appt: '✓ 100%' },
                    { feat: 'Entrega', lead: '<5 segundos', appt: 'Ate 24h' },
                    { feat: 'Conversao media', lead: '~12%', appt: '~20%' },
                  ].map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td className="px-4 sm:px-6 py-3 text-[13px] font-semibold" style={{ color: '#1a1a2e' }}>{row.feat}</td>
                      <td className="px-4 sm:px-6 py-3 text-[13px] text-center" style={{ color: '#64748b' }}>{row.lead}</td>
                      <td className="px-4 sm:px-6 py-3 text-[13px] text-center font-semibold" style={{ color: '#1a1a2e', background: '#fffbeb' }}>{row.appt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== TESTIMONIAL ==================== */}
      <section className="py-16 sm:py-24 relative overflow-hidden" style={{ background: '#1e1b4b' }}>
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(rgba(99,102,241,0.2) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <div className="text-[36px] sm:text-[48px] mb-6" style={{ color: 'rgba(99,102,241,0.3)' }}>&ldquo;</div>
          <p className="text-[18px] sm:text-[24px] font-bold text-white leading-relaxed mb-8">
            Em 30 dias, fechei 3 apolices com os leads do Lead4Producers. O investimento de $440 me rendeu mais de $1.800 em comissoes. Melhor ROI que qualquer campanha que eu ja fiz.
          </p>
          <div className="flex items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[14px] font-bold" style={{ background: 'linear-gradient(135deg, #6366f1, #a78bfa)' }}>RM</div>
            <div className="text-left">
              <p className="text-[14px] font-bold text-white">Roberto M.</p>
              <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Agente de Seguros — Florida</p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== ROI ==================== */}
      <section className="py-16 sm:py-24" style={{ background: '#fff' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 items-center">
          <div>
            <span className="inline-block px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mb-4" style={{ background: '#ecfdf5', color: '#10b981' }}>Retorno Garantido</span>
            <h2 className="text-[28px] sm:text-[40px] font-extrabold tracking-tight mb-4" style={{ color: '#1a1a2e' }}>1 apolice paga todos os leads do mes</h2>
            <p className="text-[14px] sm:text-[16px] mb-6 leading-relaxed" style={{ color: '#64748b' }}>Com 20 leads a $22, voce investe $440. Uma unica venda com comissao de $600+ ja te coloca no lucro. Agentes que compram leads fecham em media 2-3 apolices/mes.</p>
            <div className="flex gap-4 mb-8">
              <div className="flex-1 p-4 rounded-xl text-center" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <p className="text-[24px] font-extrabold" style={{ color: '#10b981' }}>2-3</p>
                <p className="text-[11px] font-medium" style={{ color: '#065f46' }}>Apolices/mes</p>
              </div>
              <div className="flex-1 p-4 rounded-xl text-center" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <p className="text-[24px] font-extrabold" style={{ color: '#10b981' }}>+$760</p>
                <p className="text-[11px] font-medium" style={{ color: '#065f46' }}>Lucro/mes</p>
              </div>
              <div className="flex-1 p-4 rounded-xl text-center" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <p className="text-[24px] font-extrabold" style={{ color: '#10b981' }}>173%</p>
                <p className="text-[11px] font-medium" style={{ color: '#065f46' }}>ROI</p>
              </div>
            </div>
            <Link href="/register" className="inline-block px-8 py-4 rounded-xl text-[15px] font-bold text-white" style={{ background: '#6366f1', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>Comecar Agora</Link>
          </div>
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
            <h3 className="text-[16px] font-bold mb-5" style={{ color: '#1a1a2e' }}>💲 Simulacao de ROI — 20 Leads</h3>
            {[
              { label: '20 leads exclusivos x $22', value: '-$440', color: '#ef4444' },
              { label: 'Taxa de contato (~38%)', value: '~8 atendimentos', color: '#1a1a2e' },
              { label: 'Taxa de conversao (~12%)', value: '~2 apolices', color: '#1a1a2e' },
              { label: 'Comissao media/apolice', value: '~$600', color: '#10b981' },
            ].map((row, i) => (
              <div key={i} className="flex justify-between py-3" style={{ borderBottom: '1px solid #e8ecf4' }}>
                <span className="text-[13px]" style={{ color: '#64748b' }}>{row.label}</span>
                <span className="text-[13px] font-bold" style={{ color: row.color }}>{row.value}</span>
              </div>
            ))}
            <div className="flex justify-between py-4 mt-2" style={{ borderTop: '2px solid #d1d5db' }}>
              <span className="text-[16px] font-extrabold" style={{ color: '#1a1a2e' }}>Lucro estimado</span>
              <span className="text-[24px] font-extrabold" style={{ color: '#10b981' }}>+$760</span>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== FAQ ==================== */}
      <section className="py-16 sm:py-24" style={{ background: '#f8f9fc' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-12">
            <span className="inline-block px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mb-4" style={{ background: '#eef2ff', color: '#6366f1' }}>FAQ</span>
            <h2 className="text-[28px] sm:text-[36px] font-extrabold tracking-tight" style={{ color: '#1a1a2e' }}>Perguntas frequentes</h2>
          </div>
          {[
            { q: 'De onde vem esses leads?', a: 'Rodamos campanhas pagas no Instagram e Facebook (Meta Ads) segmentadas exclusivamente para brasileiros morando nos Estados Unidos que demonstram interesse em seguro de vida.' },
            { q: 'O lead e realmente exclusivo?', a: 'Sim, 100% exclusivo. Cada lead e entregue para um unico agente. Ninguem mais recebe o mesmo contato. Isso garante que voce nao esta competindo.' },
            { q: 'Preciso ser de alguma seguradora especifica?', a: 'Nao. Nossos leads sao de pessoas interessadas em seguro de vida em geral. Voce pode ser agente de qualquer seguradora.' },
            { q: 'Como recebo os leads?', a: 'Assim que o lead preenche nosso formulario, voce recebe uma notificacao por email com todos os dados. Tambem pode ver no painel online.' },
            { q: 'Qual a diferenca entre Lead e Appointment?', a: 'No Lead, voce recebe o contato e liga. No Appointment, nossa equipe liga, qualifica o interesse, e agenda uma reuniao diretamente na sua agenda.' },
            { q: 'E se eu nao converter nenhum lead?', a: 'Nossa taxa media de conversao e de 12% para leads e 20% para appointments. Com 20 leads, a maioria dos agentes fecha 2-3 apolices.' },
            { q: 'Posso cancelar?', a: 'Sim. Sem contrato de fidelidade. Voce compra pacotes avulsos e usa conforme sua disponibilidade.' },
          ].map((faq, i) => (
            <details key={i} className="rounded-xl mb-2 sm:mb-3 overflow-hidden group" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
              <summary className="px-5 sm:px-6 py-4 cursor-pointer text-[13px] sm:text-[15px] font-bold list-none flex justify-between items-center" style={{ color: '#1a1a2e' }}>
                {faq.q}
                <span className="text-[18px] group-open:rotate-45 transition-transform" style={{ color: '#94a3b8' }}>+</span>
              </summary>
              <p className="px-5 sm:px-6 pb-4 text-[13px] leading-relaxed" style={{ color: '#64748b' }}>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ==================== FINAL CTA ==================== */}
      <section className="py-16 sm:py-24 text-white text-center relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #0f0a2e, #1e1b4b, #4338ca)' }}>
        <div className="absolute inset-0">
          <div className="absolute w-[500px] h-[500px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.2), transparent 70%)', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }} />
        </div>
        <div className="relative z-10 max-w-xl mx-auto px-4 sm:px-6">
          <h2 className="text-[28px] sm:text-[40px] font-extrabold tracking-tight mb-4">Pare de prospectar.<br/>Comece a fechar.</h2>
          <p className="text-[14px] sm:text-[16px] text-white/40 mb-8">Leads exclusivos de brasileiros nos EUA que querem seguro de vida. Em segundos, so para voce.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
            <Link href="/register" className="px-8 py-4 rounded-xl text-[15px] font-bold text-center" style={{ background: 'linear-gradient(135deg, #f59e0b, #eab308)', color: '#1a1a2e', boxShadow: '0 4px 20px rgba(245,158,11,0.35)' }}>
              Quero Receber Leads
            </Link>
            <a href="https://wa.me/14075551234" className="px-8 py-4 rounded-xl text-[15px] font-bold text-white text-center" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
              Falar no WhatsApp
            </a>
          </div>
          <div className="flex flex-wrap gap-6 justify-center text-white/25 text-[11px]">
            <span>🔒 Pagamento seguro via Stripe</span>
            <span>🔔 Entrega em tempo real</span>
            <span>🎯 100% exclusivos</span>
            <span>✕ Sem contrato</span>
          </div>
        </div>
      </section>

      {/* ==================== FOOTER ==================== */}
      <footer className="py-8 sm:py-10" style={{ background: '#0f0a2e' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded flex items-center justify-center text-white text-[10px] font-black" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>L</div>
              <span className="text-[14px] font-bold" style={{ color: '#94a3b8' }}>Lead4Producers</span>
            </div>
            <p className="text-[11px]" style={{ color: '#475569' }}>&copy; 2026 Lead4Producers. Todos os direitos reservados.</p>
            <div className="flex gap-4 text-[12px]" style={{ color: '#64748b' }}>
              <Link href="/login">Entrar</Link>
              <Link href="/register">Criar Conta</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
