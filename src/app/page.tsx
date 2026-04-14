import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-[72px]">
          <span className="text-2xl font-extrabold text-gray-900">Lead<span className="text-blue-600">Flow</span></span>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-semibold text-gray-600 px-4 py-2 hover:text-blue-600">Entrar</Link>
            <Link href="/register" className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-md shadow-blue-600/20">
              Quero Receber Leads
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-20 pb-16 bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <span className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-4 py-1.5 rounded-full text-sm font-bold mb-6">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> Leads chegando agora
            </span>
            <h1 className="text-5xl font-extrabold text-gray-900 leading-tight tracking-tight mb-5">
              Leads <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">exclusivos</span> de brasileiros que querem seguro de vida
            </h1>
            <p className="text-lg text-gray-500 leading-relaxed mb-8 max-w-lg">
              Receba leads frescos direto das nossas campanhas no Meta. Brasileiros nos EUA, ja interessados em life insurance. Exclusivos para voce.
            </p>
            <div className="flex gap-3 mb-10">
              <Link href="#pricing" className="bg-blue-600 text-white px-7 py-3.5 rounded-xl text-base font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/25 hover:-translate-y-0.5">
                Comecar Agora
              </Link>
              <Link href="#how" className="bg-white text-gray-800 px-7 py-3.5 rounded-xl text-base font-bold shadow-md hover:-translate-y-0.5 transition-all border border-gray-100">
                Como Funciona
              </Link>
            </div>
            <div className="flex gap-10">
              <div><p className="text-3xl font-extrabold text-gray-900">200+</p><p className="text-sm text-gray-400 font-medium">Leads por mes</p></div>
              <div><p className="text-3xl font-extrabold text-gray-900">100%</p><p className="text-sm text-gray-400 font-medium">Exclusivos</p></div>
              <div><p className="text-3xl font-extrabold text-gray-900">&lt;5s</p><p className="text-sm text-gray-400 font-medium">Entrega</p></div>
            </div>
          </div>
          <div className="relative">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
              <div className="flex justify-between items-center mb-5">
                <h3 className="font-bold text-gray-900">Leads de Hoje</h3>
                <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full text-xs font-bold">3 novos</span>
              </div>
              {[
                { initials: 'RM', name: 'Rodrigo M.', city: 'Orlando, FL', bg: 'bg-blue-500', isNew: true },
                { initials: 'AS', name: 'Amanda S.', city: 'Miami, FL', bg: 'bg-purple-500', isNew: true },
                { initials: 'CF', name: 'Carlos F.', city: 'Houston, TX', bg: 'bg-pink-500', time: '12 min' },
                { initials: 'JL', name: 'Julia L.', city: 'Newark, NJ', bg: 'bg-amber-500', time: '28 min' },
                { initials: 'PR', name: 'Pedro R.', city: 'Atlanta, GA', bg: 'bg-emerald-500', time: '1h' },
              ].map((lead, i) => (
                <div key={i} className="flex items-center gap-3.5 py-3 border-b border-gray-50 last:border-0">
                  <div className={`w-10 h-10 ${lead.bg} text-white rounded-full flex items-center justify-center text-sm font-bold`}>{lead.initials}</div>
                  <div className="flex-1">
                    <p className="font-bold text-sm text-gray-900">{lead.name}</p>
                    <p className="text-xs text-gray-400">{lead.city} — Seguro de vida</p>
                  </div>
                  {lead.isNew ? (
                    <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded text-[11px] font-bold">NOVO</span>
                  ) : (
                    <span className="text-xs text-gray-400">{lead.time}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Bar */}
      <div className="bg-gray-900 py-4 text-center text-gray-400 text-xs font-medium tracking-wider">
        LEADS DE CAMPANHAS REAIS NO META ADS &nbsp;•&nbsp; BRASILEIROS NOS EUA &nbsp;•&nbsp; SEGURO DE VIDA &nbsp;•&nbsp; ENTREGA EM TEMPO REAL
      </div>

      {/* Problems */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <span className="inline-block bg-blue-50 text-blue-600 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-4">O Problema</span>
          <h2 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-3">Voce sabe vender seguro.<br/>Mas encontrar clientes custa caro.</h2>
          <p className="text-lg text-gray-500 mb-12 max-w-xl">Se voce depende de indicacao, cold call ou grupos de WhatsApp, voce ja sabe: e imprevisivel e nao escala.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: '😴', title: 'Indicacoes secam', desc: 'Um mes tem 5, outro mes tem zero. Impossivel prever receita.' },
              { icon: '💸', title: 'Trafego pago e caro', desc: 'Rodar campanha exige budget, conhecimento de ads, teste A/B. E se der errado?' },
              { icon: '⏰', title: 'Tempo no lugar errado', desc: 'Voce deveria estar vendendo, nao prospectando. Cada hora buscando e uma hora sem fechar.' },
            ].map((p, i) => (
              <div key={i} className="p-7 rounded-2xl border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all">
                <p className="text-3xl mb-3">{p.icon}</p>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{p.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how" className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <span className="inline-block bg-blue-50 text-blue-600 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-4">Como Funciona</span>
          <h2 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-12">De zero a leads em 4 passos</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { num: 1, title: 'Escolha seu produto', desc: 'Lead (voce liga) ou Appointment (nos agendamos). Min 10.' },
              { num: 2, title: 'Pague com cartao', desc: 'Pagamento seguro via Stripe. Saldo ativado na hora.' },
              { num: 3, title: 'Receba leads', desc: 'Brasileiro preenche form no Meta, voce recebe em segundos.' },
              { num: 4, title: 'Feche vendas', desc: 'Ligue nos primeiros 5 min. 3x mais chance de conversao.' },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="w-14 h-14 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-extrabold mx-auto mb-4 shadow-lg shadow-blue-600/25">
                  {s.num}
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{s.title}</h3>
                <p className="text-sm text-gray-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products */}
      <section id="pricing" className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block bg-blue-50 text-blue-600 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-4">Produtos</span>
            <h2 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-3">Dois caminhos para fechar mais apolices</h2>
            <p className="text-lg text-gray-500">Lead para ligar voce mesmo, ou appointment para receber o cliente ja agendado.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Lead */}
            <div className="bg-gradient-to-br from-slate-800 to-blue-600 rounded-3xl p-10 text-white hover:-translate-y-1 transition-all">
              <span className="bg-white/15 px-3 py-1 rounded-full text-xs font-bold mb-5 inline-block">MAIS POPULAR</span>
              <h3 className="text-3xl font-extrabold mb-2">Lead Exclusivo</h3>
              <p className="text-white/80 mb-6">Lead preenche form, entregue SOMENTE para voce. Ninguem mais recebe.</p>
              <p className="text-5xl font-extrabold mb-1">$20–25<span className="text-lg font-medium text-white/50">/lead</span></p>
              <p className="text-white/50 text-sm mb-6">Minimo 10 leads por pedido ($200–250)</p>
              <ul className="space-y-3 mb-8">
                {['Brasileiro nos EUA interessado em seguro', 'Nome, telefone, email, cidade', '100% exclusivo — so voce recebe', 'Entrega em tempo real (<5 seg)', 'Notificacao por email e SMS'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-white/90">
                    <span className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-[10px] font-bold">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block text-center bg-white text-gray-900 py-3.5 rounded-xl font-bold hover:bg-gray-100 transition-colors shadow-lg">
                Quero Leads Exclusivos
              </Link>
            </div>

            {/* Appointment */}
            <div className="bg-gradient-to-br from-orange-900 to-orange-500 rounded-3xl p-10 text-white hover:-translate-y-1 transition-all">
              <span className="bg-white/15 px-3 py-1 rounded-full text-xs font-bold mb-5 inline-block">PREMIUM</span>
              <h3 className="text-3xl font-extrabold mb-2">Appointment Agendado</h3>
              <p className="text-white/80 mb-6">Nos recebemos, ligamos, qualificamos e agendamos na SUA agenda.</p>
              <p className="text-5xl font-extrabold mb-1">$35–40<span className="text-lg font-medium text-white/50">/appt</span></p>
              <p className="text-white/50 text-sm mb-6">Minimo 10 appointments por pedido ($350–400)</p>
              <ul className="space-y-3 mb-8">
                {['Lead ja qualificado por telefone', 'Agendado direto na sua agenda', 'Confirmacao automatica pro cliente', 'Brief com perfil e interesse do lead', 'Taxa de show-up de ~70%'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-white/90">
                    <span className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-[10px] font-bold">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block text-center bg-white text-gray-900 py-3.5 rounded-xl font-bold hover:bg-gray-100 transition-colors shadow-lg">
                Quero Appointments
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ROI */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-block bg-blue-50 text-blue-600 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-4">Retorno</span>
            <h2 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-4">1 apolice paga todos os seus leads do mes</h2>
            <p className="text-lg text-gray-500 mb-6 leading-relaxed">Se voce fecha 1 apolice de $50k com comissao de 60%, voce ganha $600+. Com 20 leads a $22, investiu $440. Uma venda = lucro.</p>
            <div className="bg-amber-400 text-gray-900 px-5 py-4 rounded-2xl font-semibold text-sm flex items-center gap-3 mb-6">
              📈 Agentes que compram leads fecham 2-3 apolices/mes com 20 leads
            </div>
            <Link href="/register" className="bg-blue-600 text-white px-7 py-3.5 rounded-xl text-base font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/25 inline-block">
              Comecar Agora
            </Link>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <h3 className="font-bold text-gray-900 mb-5">💲 Simulacao de ROI — 20 Leads</h3>
            {[
              { label: '20 leads exclusivos x $22', value: '-$440', color: 'text-gray-500' },
              { label: 'Taxa de contato (~38%)', value: '~8 atendimentos', color: 'text-gray-700' },
              { label: 'Taxa de conversao (~12%)', value: '~2 apolices', color: 'text-gray-700' },
              { label: 'Comissao media por apolice', value: '~$600', color: 'text-gray-700' },
            ].map((row, i) => (
              <div key={i} className="flex justify-between py-3 border-b border-gray-100">
                <span className="text-sm text-gray-600">{row.label}</span>
                <span className={`text-sm font-bold ${row.color}`}>{row.value}</span>
              </div>
            ))}
            <div className="flex justify-between py-4 mt-2 border-t-2 border-gray-200">
              <span className="text-base font-bold text-gray-900">Lucro estimado</span>
              <span className="text-2xl font-extrabold text-green-600">+$760/mes</span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block bg-blue-50 text-blue-600 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-4">Duvidas</span>
            <h2 className="text-4xl font-extrabold text-gray-900 tracking-tight">Perguntas frequentes</h2>
          </div>
          {[
            { q: 'De onde vem esses leads?', a: 'Rodamos campanhas pagas no Instagram e Facebook segmentadas para brasileiros nos EUA interessados em seguro de vida.' },
            { q: 'O lead e realmente exclusivo?', a: 'Sim, 100%. Cada lead e entregue para um unico agente. Ninguem mais recebe o mesmo contato.' },
            { q: 'Preciso ser de alguma seguradora especifica?', a: 'Nao. Pode ser agente de qualquer seguradora — National Life, Prudential, MetLife, etc.' },
            { q: 'Como recebo os leads?', a: 'Por email, SMS e no seu painel online. Tudo em menos de 5 segundos apos o lead preencher o formulario.' },
            { q: 'Qual a diferenca entre Lead e Appointment?', a: 'No Lead voce liga. No Appointment, nos ligamos, qualificamos e agendamos na sua agenda. Voce so faz a reuniao.' },
            { q: 'Posso cancelar a qualquer momento?', a: 'Sim. Sem contrato. Voce compra pacotes e usa conforme sua disponibilidade.' },
          ].map((faq, i) => (
            <details key={i} className="group bg-white rounded-xl border border-gray-100 mb-3 overflow-hidden">
              <summary className="px-6 py-5 cursor-pointer text-base font-bold text-gray-900 flex justify-between items-center list-none">
                {faq.q}
                <span className="text-gray-400 group-open:rotate-45 transition-transform text-xl">+</span>
              </summary>
              <p className="px-6 pb-5 text-sm text-gray-500 leading-relaxed">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-gradient-to-br from-gray-900 via-slate-800 to-blue-600 text-white text-center">
        <div className="max-w-xl mx-auto px-6">
          <h2 className="text-4xl font-extrabold mb-4 tracking-tight">Pare de prospectar.<br/>Comece a fechar.</h2>
          <p className="text-lg text-white/60 mb-8">Leads exclusivos de brasileiros que querem seguro de vida. Em segundos, so para voce.</p>
          <div className="flex gap-3 justify-center mb-10">
            <Link href="/register" className="bg-amber-400 text-gray-900 px-7 py-3.5 rounded-xl text-base font-bold hover:bg-amber-300 shadow-lg transition-all">
              Quero Receber Leads
            </Link>
            <a href="https://wa.me/14075551234" className="bg-white/10 text-white px-7 py-3.5 rounded-xl text-base font-bold border border-white/20 hover:bg-white/20 transition-all">
              Falar no WhatsApp
            </a>
          </div>
          <div className="flex gap-8 justify-center text-white/40 text-xs">
            <span>🔒 Pagamento seguro</span>
            <span>🔔 Tempo real</span>
            <span>🎯 100% exclusivos</span>
            <span>✕ Sem contrato</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-10 text-center text-sm">
        <p className="font-semibold text-gray-300 mb-1">LeadFlow</p>
        <p>Leads exclusivos de seguro de vida para agentes. &copy; 2026</p>
      </footer>
    </div>
  )
}
