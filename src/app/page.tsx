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
            <Link href="#pricing" className="hidden sm:inline text-[13px] font-semibold px-4 py-2" style={{ color: '#64748b' }}>Precos</Link>
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

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-8 sm:pb-16">
          <div className="text-center max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold mb-6" style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#34d399' }} /> Para donos de agencia e producers independentes
            </span>
            <h1 className="text-[32px] sm:text-[44px] lg:text-[52px] font-extrabold leading-[1.06] tracking-tight text-white mb-6">
              Leads exclusivos + CRM feito pra quem <span style={{ color: '#a78bfa' }}>vende seguro de vida</span>
            </h1>
            <p className="text-[15px] sm:text-[18px] leading-relaxed mb-10 max-w-2xl mx-auto" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Compre leads quentes de brasileiros nos EUA, distribua pro seu time automaticamente, acompanhe cada deal no pipeline e feche mais apolices.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
              <Link href="/register" className="px-8 py-4 rounded-xl text-[15px] font-bold text-center inline-block" style={{ background: 'linear-gradient(135deg, #f59e0b, #eab308)', color: '#1a1a2e', boxShadow: '0 4px 20px rgba(245,158,11,0.35)' }}>
                Comecar Gratis — Sem Cartao
              </Link>
              <Link href="#features" className="px-8 py-4 rounded-xl text-[15px] font-bold text-white text-center inline-block" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
                Ver Features
              </Link>
            </div>
          </div>

          {/* Pipeline screenshot */}
          <div className="mt-8 sm:mt-12 rounded-xl sm:rounded-2xl overflow-hidden mx-auto max-w-5xl" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Image src="/ss-pipeline.png" alt="Pipeline Kanban Lead4Producers" width={1200} height={700} className="w-full h-auto" priority />
          </div>
        </div>
      </section>

      {/* ==================== SOCIAL PROOF BAR ==================== */}
      <section className="py-8 sm:py-12" style={{ background: '#fff', borderBottom: '1px solid #e8ecf4' }}>
        <div className="max-w-5xl mx-auto px-4 flex flex-wrap justify-center gap-6 sm:gap-12">
          {[
            { n: '$22', label: 'por lead exclusivo' },
            { n: '< 5min', label: 'entrega WhatsApp' },
            { n: '100%', label: 'exclusivo (1:1)' },
            { n: 'AI', label: 'prioriza seus leads' },
            { n: '$99/mo', label: 'CRM completo' },
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
              <span>✨</span> Novidades 2026
            </span>
            <h2 className="text-[28px] sm:text-[40px] font-extrabold mb-3" style={{ color: '#1a1a2e' }}>
              Superpoderes que fecham negócio sozinho
            </h2>
            <p className="text-[15px] max-w-2xl mx-auto" style={{ color: '#64748b' }}>
              Plataforma completa: marketplace de leads, CRM com IA, agenda unificada, WhatsApp bidirecional e automações. Tudo num lugar só.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: '💬',
                tag: 'COMPLETO',
                title: 'WhatsApp Inbox bidirecional',
                desc: 'Envie e receba dentro do sistema: texto, emoji, fotos, áudios, PDFs e documentos. Histórico completo por lead, time compartilhado.',
                color: '#10b981',
              },
              {
                icon: '🔥',
                tag: 'AI',
                title: 'Lead Scoring com IA',
                desc: 'Claude analisa cada lead e dá score 0-100 com explicação. Priorize os quentes automaticamente. Rode em lote com 1 clique.',
                color: '#ef4444',
              },
              {
                icon: '⚡',
                tag: 'AUTOMAÇÃO',
                title: 'Automações sem código',
                desc: 'Lead parado 48h? Dispara follow-up. Entrou em "Negociação"? Manda proposta. Configure gatilhos visualmente e esqueça.',
                color: '#f59e0b',
              },
              {
                icon: '🔁',
                tag: 'SEQUENCES',
                title: 'Drip Campaigns (Sequences)',
                desc: 'Dia 1 WhatsApp → Dia 3 email → Dia 7 ligação. Crie sequências de múltiplos passos e enrolle leads com 1 clique.',
                color: '#8b5cf6',
              },
              {
                icon: '📅',
                tag: 'NOVO',
                title: 'Agenda unificada',
                desc: 'Calendário Dia/Semana/Mês com Eventos, Tarefas, Appointments e Follow-ups num só lugar. Reagende, delete, marque como concluído direto no calendário.',
                color: '#0ea5e9',
              },
              {
                icon: '📈',
                tag: 'ANALYTICS',
                title: 'Performance Dashboard',
                desc: 'KPIs de contato, conversão, custo por fechamento, funil do pipeline, ROI por fonte. Leaderboard do time pra agências.',
                color: '#6366f1',
              },
              {
                icon: '📂',
                tag: 'NOVO',
                title: 'Import de leads + Manual',
                desc: 'Adicione leads manualmente ou importe CSV em massa (2000 por vez). Já tem base antiga? Migre em 30 segundos e comece a vender hoje.',
                color: '#ec4899',
              },
              {
                icon: '🏷️',
                tag: 'ORGANIZAÇÃO',
                title: 'Tags + Filtros avançados',
                desc: 'Categorize leads com tags coloridas. Filtros por data de chegada (hoje, 7d, 30d, custom), estágio, status. Analise cohorts sem Excel.',
                color: '#14b8a6',
              },
              {
                icon: '📱',
                tag: 'MOBILE',
                title: 'App instalável + Push',
                desc: 'Adicione o sistema na tela inicial do celular. Receba push quando um lead cair. Contate em 30 segundos e converta 3x mais.',
                color: '#06b6d4',
              },
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
              Testar todas as features grátis →
            </Link>
          </div>
        </div>
      </section>

      {/* ==================== AGENCY OWNER SECTION ==================== */}
      <section id="features" className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-center text-[12px] font-bold uppercase tracking-widest mb-3" style={{ color: '#6366f1' }}>Para donos de agencia</p>
          <h2 className="text-center text-[28px] sm:text-[40px] font-extrabold mb-4" style={{ color: '#1a1a2e' }}>Monte seu time e escale suas vendas</h2>
          <p className="text-center text-[15px] mb-12 max-w-2xl mx-auto" style={{ color: '#94a3b8' }}>Cadastre seus agentes, compre leads em volume e distribua automaticamente. Acompanhe o pipeline de cada membro do time em tempo real.</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            {/* Screenshot Meu Time */}
            <div className="rounded-2xl overflow-hidden" style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.08)', border: '1px solid #e8ecf4' }}>
              <Image src="/ss-team.png" alt="Gestao de Time Lead4Producers" width={1200} height={650} className="w-full h-auto" />
            </div>

            {/* Benefits */}
            <div className="space-y-6">
              {[
                { icon: '👥', title: 'Cadastre seu time inteiro', desc: 'Adicione agentes com nome, email e WhatsApp. Cada um recebe notificacao direta quando um lead chega.' },
                { icon: '🔄', title: 'Distribuicao automatica ou manual', desc: 'Round-robin distribui igualmente. Ou voce escolhe pra quem mandar cada lead. Mude a qualquer hora.' },
                { icon: '📊', title: 'Pipeline por agente', desc: 'Veja em tempo real como cada agente do seu time esta gerenciando os leads. Quem ta fechando, quem ta atrasando.' },
                { icon: '📱', title: 'WhatsApp pra cada agente', desc: 'Quando o lead chega, o agente recebe no WhatsApp com nome, telefone e interesse. So ligar.' },
              ].map((b, i) => (
                <div key={i} className="flex gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#eef2ff' }}>
                    <span className="text-[24px]">{b.icon}</span>
                  </div>
                  <div>
                    <h3 className="text-[16px] font-bold mb-1" style={{ color: '#1a1a2e' }}>{b.title}</h3>
                    <p className="text-[13px] leading-relaxed" style={{ color: '#94a3b8' }}>{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ==================== PIPELINE CRM SECTION ==================== */}
      <section className="py-16 sm:py-24" style={{ background: '#fff' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-center text-[12px] font-bold uppercase tracking-widest mb-3" style={{ color: '#6366f1' }}>CRM Pro</p>
          <h2 className="text-center text-[28px] sm:text-[40px] font-extrabold mb-4" style={{ color: '#1a1a2e' }}>Pipeline visual que fecha negocios</h2>
          <p className="text-center text-[15px] mb-12 max-w-2xl mx-auto" style={{ color: '#94a3b8' }}>Kanban drag-and-drop feito pra insurance producers. Acompanhe cada lead do primeiro contato ao contrato fechado.</p>

          {/* Pipeline screenshot full width */}
          <div className="rounded-2xl overflow-hidden mb-12" style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.08)', border: '1px solid #e8ecf4' }}>
            <Image src="/ss-pipeline.png" alt="Pipeline CRM Lead4Producers" width={1200} height={700} className="w-full h-auto" />
          </div>

          {/* CRM features grid — todas as features do CRM Pro */}
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { icon: '📋', label: 'Kanban' },
              { icon: '💬', label: 'WhatsApp Inbox' },
              { icon: '🔥', label: 'AI Score' },
              { icon: '⚡', label: 'Automações' },
              { icon: '🔁', label: 'Sequences' },
              { icon: '📅', label: 'Agenda' },
              { icon: '📌', label: 'Follow-ups' },
              { icon: '📎', label: 'Anexos/Mídia' },
              { icon: '🏷️', label: 'Tags + Filtros' },
              { icon: '📂', label: 'Import CSV' },
              { icon: '👥', label: 'Time + Leaderboard' },
              { icon: '📈', label: 'Performance' },
              { icon: '📱', label: 'App Mobile' },
              { icon: '🎁', label: 'Indicações' },
            ].map((f, i) => (
              <div key={i} className="text-center py-4 rounded-xl" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
                <span className="text-[22px] block mb-1.5">{f.icon}</span>
                <p className="text-[11px] font-bold leading-tight" style={{ color: '#64748b' }}>{f.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== LEADS SECTION ==================== */}
      <section className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-widest mb-3" style={{ color: '#f59e0b' }}>Leads exclusivos</p>
              <h2 className="text-[28px] sm:text-[36px] font-extrabold mb-4" style={{ color: '#1a1a2e' }}>Leads de brasileiros que querem seguro de vida nos EUA</h2>
              <p className="text-[15px] leading-relaxed mb-8" style={{ color: '#94a3b8' }}>
                Campanhas no Meta Ads rodando 24/7. Quando alguem preenche o formulario de interesse, voce recebe em tempo real no WhatsApp. Exclusivo — ninguem mais recebe esse lead.
              </p>
              <div className="space-y-4 mb-8">
                {[
                  { icon: '🎯', text: 'Lead quente — pessoa preencheu formulario AGORA' },
                  { icon: '🔒', text: '100% exclusivo — 1 lead = 1 producer, sem compartilhar' },
                  { icon: '📱', text: 'Entrega imediata via WhatsApp + email' },
                  { icon: '📍', text: 'Filtro por estado — so recebe onde tem licenca' },
                  { icon: '❄️', text: 'Leads frios com desconto — a partir de $3/lead' },
                ].map((f, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-[18px]">{f.icon}</span>
                    <span className="text-[14px] font-semibold" style={{ color: '#475569' }}>{f.text}</span>
                  </div>
                ))}
              </div>
              <Link href="/register" className="inline-block px-8 py-3.5 rounded-xl text-[14px] font-bold text-white" style={{ background: '#6366f1', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
                Comprar Meus Primeiros Leads
              </Link>
            </div>

            {/* WhatsApp mockup */}
            <div className="flex justify-center">
              <div className="w-[320px] rounded-3xl p-5" style={{ background: '#1a1a2e', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                <div className="rounded-2xl overflow-hidden" style={{ background: '#0b141a' }}>
                  <div className="px-4 py-3 flex items-center gap-3" style={{ background: '#1f2c34' }}>
                    <div className="w-8 h-8 rounded-full" style={{ background: '#6366f1' }} />
                    <div>
                      <p className="text-[13px] font-bold text-white">Lead4Producers</p>
                      <p className="text-[10px]" style={{ color: '#8696a0' }}>online</p>
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="rounded-xl px-3 py-2.5 max-w-[260px]" style={{ background: '#005c4b' }}>
                      <p className="text-[12px] text-white leading-relaxed">
                        🎯 <strong>Novo Lead — Lead4Producers!</strong><br/><br/>
                        📋 <strong>Carlos Mendes</strong><br/>
                        📞 +1 (407) 555-0101<br/>
                        📍 FL<br/>
                        💡 Seguro de vida<br/><br/>
                        ⚡ Ligue nos proximos 5 minutos!
                      </p>
                      <p className="text-[9px] text-right mt-1" style={{ color: '#8696a0' }}>14:32 ✓✓</p>
                    </div>
                    <div className="rounded-xl px-3 py-2.5 max-w-[260px]" style={{ background: '#005c4b' }}>
                      <p className="text-[12px] text-white leading-relaxed">
                        🎯 <strong>Novo Lead — Lead4Producers!</strong><br/><br/>
                        📋 <strong>Amanda Silva</strong><br/>
                        📞 +1 (305) 555-0202<br/>
                        📍 MA<br/>
                        💡 Seguro de vida<br/><br/>
                        ⚡ Ligue nos proximos 5 minutos!
                      </p>
                      <p className="text-[9px] text-right mt-1" style={{ color: '#8696a0' }}>14:35 ✓✓</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== HOW IT WORKS ==================== */}
      <section className="py-16 sm:py-24" style={{ background: '#fff' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-center text-[12px] font-bold uppercase tracking-widest mb-3" style={{ color: '#6366f1' }}>Como funciona</p>
          <h2 className="text-center text-[28px] sm:text-[36px] font-extrabold mb-12" style={{ color: '#1a1a2e' }}>3 passos pra comecar a fechar</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '1', icon: '📝', title: 'Crie sua conta gratis', desc: 'Cadastre-se em 30 segundos. Configure seus estados e dados de contato. Sem cartao.' },
              { step: '2', icon: '💳', title: 'Compre leads ou assine o CRM', desc: 'Pacotes de leads a partir de $220. CRM Pro com pipeline e gestao de time por $99/mes.' },
              { step: '3', icon: '🚀', title: 'Receba, gerencie e feche', desc: 'Leads no WhatsApp em tempo real. Pipeline pra acompanhar. Time pra escalar. Feche mais apolices.' },
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
          <p className="text-center text-[15px] mb-12 max-w-xl mx-auto" style={{ color: '#94a3b8' }}>Conta gratis pra sempre. Compre leads avulso. Assine o CRM quando quiser escalar.</p>

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
              <p className="text-[13px] mb-6" style={{ color: '#94a3b8' }}>Min. 10 leads por pacote</p>
              <ul className="space-y-3 mb-4">
                {['Leads quentes exclusivos ($22/un)', 'Appointments qualificados ($39/un)', 'Leads frios com desconto ($3-5)', 'Filtro por estado', 'Entrega WhatsApp em tempo real'].map((t, i) => (
                  <li key={i} className="flex items-center gap-2.5">
                    <span className="text-[13px]" style={{ color: '#6366f1' }}>✓</span>
                    <span className="text-[13px]" style={{ color: '#64748b' }}>{t}</span>
                  </li>
                ))}
              </ul>
              <div className="rounded-lg p-3 mb-6" style={{ background: '#fef3c7' }}>
                <p className="text-[11px] font-bold" style={{ color: '#92400e' }}>10x $220 · 25x $500 · 50x $900</p>
              </div>
              <Link href="/register" className="block text-center py-3.5 rounded-xl text-[14px] font-bold text-white" style={{ background: '#6366f1', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
                Comprar Leads
              </Link>
            </div>

            {/* CRM Pro */}
            <div className="rounded-2xl p-8 relative" style={{ background: 'linear-gradient(160deg, #0f0a2e, #1e1b4b)', border: '1px solid rgba(99,102,241,0.3)' }}>
              <div className="absolute -top-3 right-4 px-3 py-1 rounded-full text-[10px] font-extrabold" style={{ background: '#10b981', color: '#fff' }}>Anual -20%</div>
              <p className="text-[12px] font-bold uppercase tracking-wider mb-2" style={{ color: '#a78bfa' }}>CRM Pro</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-[40px] font-extrabold text-white">$99</span>
                <span className="text-[14px]" style={{ color: 'rgba(255,255,255,0.4)' }}>/mês</span>
              </div>
              <p className="text-[12px] mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>ou <span className="font-bold" style={{ color: '#34d399' }}>$950/ano</span> (economize $238)</p>
              <p className="text-[13px] mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>Cancele quando quiser</p>
              <ul className="space-y-2.5 mb-8">
                {[
                  'Tudo do plano grátis',
                  '💬 WhatsApp Inbox (emoji + fotos + docs)',
                  '🔥 Lead Scoring com IA (Claude)',
                  '⚡ Automações sem código',
                  '🔁 Sequências / Drip Campaigns',
                  '📅 Agenda (Eventos + Tarefas + Appointments)',
                  '📋 Pipeline Kanban customizável',
                  '📂 Import CSV + adição manual de leads',
                  '👥 Gestão de time + Leaderboard',
                  '📈 Analytics + ROI por fonte',
                  '🏷️ Tags + filtros avançados',
                  '📱 App mobile + notificações push',
                  '💳 Billing portal self-service',
                  '🎁 Programa de indicação ($25-100)',
                ].map((t, i) => (
                  <li key={i} className="flex items-center gap-2.5">
                    <span className="text-[13px]" style={{ color: '#a78bfa' }}>✓</span>
                    <span className="text-[12.5px]" style={{ color: 'rgba(255,255,255,0.75)' }}>{t}</span>
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

      {/* ==================== TESTIMONIALS ==================== */}
      <section className="py-16 sm:py-24" style={{ background: '#fff' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-center text-[28px] sm:text-[36px] font-extrabold mb-12" style={{ color: '#1a1a2e' }}>Quem usa, recomenda</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { name: 'Ricardo M.', role: 'Insurance Producer — FL', text: 'Em 30 dias, fechei 3 apolices. O investimento de $440 me rendeu mais de $1.800 em comissoes. Com o pipeline fico organizado e nao perco nenhum follow-up.', initials: 'RM', color: '#6366f1' },
              { name: 'Regiane P.', role: 'Agency Owner — FL', text: 'Gerencio 3 agentes pelo Meu Time. Os leads chegam e sao distribuidos automaticamente. Cada agente recebe no WhatsApp e eu acompanho o pipeline de todos em tempo real.', initials: 'RP', color: '#8b5cf6' },
            ].map((t, i) => (
              <div key={i} className="rounded-2xl p-8" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
                <p className="text-[15px] leading-relaxed mb-6" style={{ color: '#475569' }}>&ldquo;{t.text}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-bold" style={{ background: t.color }}>{t.initials}</div>
                  <div>
                    <p className="text-[14px] font-bold" style={{ color: '#1a1a2e' }}>{t.name}</p>
                    <p className="text-[12px]" style={{ color: '#94a3b8' }}>{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== CTA ==================== */}
      <section className="py-16 sm:py-24" style={{ background: 'linear-gradient(160deg, #0f0a2e 0%, #1e1b4b 50%, #312e81 100%)' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-[28px] sm:text-[40px] font-extrabold text-white mb-4">Pare de perder leads. Comece a fechar.</h2>
          <p className="text-[15px] sm:text-[17px] mb-8" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Conta gratis em 30 segundos. Compre leads ou assine o CRM quando estiver pronto. Sem contrato, sem fidelidade.
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
