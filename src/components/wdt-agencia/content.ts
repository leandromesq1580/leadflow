export type Locale = 'pt' | 'en' | 'es'

export interface ProductCard {
  tag: string
  name: string
  tagline: string
  desc: string
  bullets: string[]
  href: string
  status: 'live' | 'beta' | 'in-house'
}

export interface AgenciaContent {
  nav: {
    manifesto: string
    products: string
    diff: string
    process: string
    cta: string
    lang: { pt: string; en: string; es: string }
  }
  hero: {
    badge: string
    eyebrow: string
    h1Pre: string
    h1Accent: string
    h1Post: string
    sub: string
    ctaPrimary: string
    ctaSecondary: string
    stat1n: string
    stat1l: string
    stat2n: string
    stat2l: string
    stat3n: string
    stat3l: string
  }
  trigger: {
    eyebrow: string
    h2Pre: string
    h2Accent: string
    h2Post: string
    sub: string
    points: { kicker: string; t: string; d: string }[]
    closing: string
  }
  manifesto: {
    eyebrow: string
    h2: string
    h2Accent: string
    p1: string
    p2: string
    p3: string
  }
  products: {
    eyebrow: string
    h2: string
    h2Accent: string
    sub: string
    items: ProductCard[]
    cta: string
  }
  diff: {
    eyebrow: string
    h2: string
    h2Accent: string
    headerThem: string
    headerUs: string
    rows: { feature: string; them: string; us: string }[]
  }
  process: {
    eyebrow: string
    h2: string
    h2Accent: string
    steps: { n: string; t: string; d: string }[]
  }
  proof: {
    eyebrow: string
    h2: string
    h2Accent: string
    stats: { v: string; l: string }[]
    quote: string
    author: string
    role: string
  }
  cta: {
    eyebrow: string
    h2: string
    h2Accent: string
    sub: string
    primary: string
    secondary: string
    or: string
    email: string
  }
  footer: {
    tagline: string
    mapTitle: string
    contactTitle: string
    contactItems: string[]
    rights: string
    values: string
  }
}

const navCommon = { lang: { pt: 'PT', en: 'EN', es: 'ES' } }

const products_pt: ProductCard[] = [
  {
    tag: 'PLATAFORMA',
    name: 'Lead4Pro',
    tagline: 'Leads exclusivos de seguro de vida — em tempo real.',
    desc: 'Plataforma que entrega leads frescos de brasileiros nos EUA interessados em seguro de vida. Exclusivos, geolocalizados, com automação de outreach.',
    bullets: ['Leads exclusivos por território', 'Automação WhatsApp + email', 'CRM integrado'],
    href: '/',
    status: 'live',
  },
  {
    tag: 'PLATAFORMA',
    name: 'leadflow CRM',
    tagline: 'CRM com IA, pipeline visual e automações reais.',
    desc: 'CRM completo para times de venda consultiva. Pipeline kanban, sequências automáticas, IA para responder lead na hora certa, agenda integrada.',
    bullets: ['Pipeline + sequences', 'IA agente especialista', 'WhatsApp 2-way nativo'],
    href: '/dashboard',
    status: 'live',
  },
  {
    tag: 'PLATAFORMA',
    name: 'WDT Partners',
    tagline: 'Due diligence de Tax Deed em minutos, não dias.',
    desc: 'Plataforma de leilões de Tax Deed nos EUA. Due diligence automatizada em 8 fases, opening bids em tempo real, calendário consolidado de leilões.',
    bullets: ['Due diligence 8 fases automatizada', 'Opening bids em tempo real', 'Calendário multi-estado'],
    href: '#contato',
    status: 'live',
  },
  {
    tag: 'SOB MEDIDA',
    name: 'AI Agents Especialistas',
    tagline: 'Agentes de IA treinados no seu negócio.',
    desc: 'Construímos agentes de IA verticais — atendimento, vendas, suporte, qualificação de lead — com conhecimento profundo do seu produto e tom de voz.',
    bullets: ['RAG + fine-tuning', 'Integração WhatsApp/site/CRM', 'Voz consultiva, não robótica'],
    href: '#contato',
    status: 'live',
  },
  {
    tag: 'SOB MEDIDA',
    name: 'Automação WhatsApp Business',
    tagline: 'Operação completa rodando no WhatsApp.',
    desc: 'Sistemas que rodam na API oficial do WhatsApp Business — campanhas, atendimento, suporte, vendas. Multiagente, com BI e relatórios reais.',
    bullets: ['API oficial Meta', 'Multi-agente + supervisão', 'BI + relatórios em tempo real'],
    href: '#contato',
    status: 'live',
  },
  {
    tag: 'SOB MEDIDA',
    name: 'Sistemas Sob Medida',
    tagline: 'Software que cabe no seu negócio.',
    desc: 'Quando o SaaS de prateleira não serve, construímos. Backoffice, integração com legado, dashboards executivos, automação de processos.',
    bullets: ['Stack moderna (Next, Postgres, Vercel)', 'CI/CD + DevOps inclusos', 'Manutenção e evolução contínua'],
    href: '#contato',
    status: 'live',
  },
]

const products_en: ProductCard[] = [
  {
    tag: 'PLATFORM',
    name: 'Lead4Pro',
    tagline: 'Exclusive life-insurance leads — in real time.',
    desc: 'Platform delivering fresh leads of Brazilians in the US interested in life insurance. Exclusive, geo-targeted, with outreach automation.',
    bullets: ['Exclusive leads per territory', 'WhatsApp + email automation', 'Built-in CRM'],
    href: '/',
    status: 'live',
  },
  {
    tag: 'PLATFORM',
    name: 'leadflow CRM',
    tagline: 'CRM with AI, visual pipeline, real automations.',
    desc: 'Full CRM for consultative sales teams. Kanban pipeline, automated sequences, AI that replies leads at the right moment, integrated calendar.',
    bullets: ['Pipeline + sequences', 'AI specialist agent', 'Native 2-way WhatsApp'],
    href: '/dashboard',
    status: 'live',
  },
  {
    tag: 'PLATFORM',
    name: 'WDT Partners',
    tagline: 'Tax Deed due diligence in minutes, not days.',
    desc: 'US Tax Deed auctions platform. Automated 8-phase due diligence, real-time opening bids, consolidated multi-state calendar.',
    bullets: ['Automated 8-phase DD', 'Real-time opening bids', 'Multi-state calendar'],
    href: '#contact',
    status: 'live',
  },
  {
    tag: 'CUSTOM',
    name: 'Specialist AI Agents',
    tagline: 'AI agents trained on your business.',
    desc: 'We build vertical AI agents — support, sales, qualification, ops — with deep knowledge of your product and brand voice.',
    bullets: ['RAG + fine-tuning', 'WhatsApp / site / CRM integration', 'Consultative, not robotic'],
    href: '#contact',
    status: 'live',
  },
  {
    tag: 'CUSTOM',
    name: 'WhatsApp Business Automation',
    tagline: 'Full operations running on WhatsApp.',
    desc: 'Systems on official WhatsApp Business API — campaigns, support, sales. Multi-agent, BI dashboards, real reports.',
    bullets: ['Official Meta API', 'Multi-agent + supervision', 'BI + real-time reporting'],
    href: '#contact',
    status: 'live',
  },
  {
    tag: 'CUSTOM',
    name: 'Custom Software',
    tagline: 'Software that fits your business.',
    desc: "When off-the-shelf SaaS doesn't fit, we build. Backoffice, legacy integration, executive dashboards, process automation.",
    bullets: ['Modern stack (Next, Postgres, Vercel)', 'CI/CD + DevOps included', 'Ongoing evolution & support'],
    href: '#contact',
    status: 'live',
  },
]

const products_es: ProductCard[] = [
  {
    tag: 'PLATAFORMA',
    name: 'Lead4Pro',
    tagline: 'Leads exclusivos de seguro de vida — en tiempo real.',
    desc: 'Plataforma que entrega leads frescos de brasileños en EE.UU. interesados en seguro de vida. Exclusivos, geolocalizados, con outreach automatizado.',
    bullets: ['Leads exclusivos por territorio', 'Automatización WhatsApp + email', 'CRM integrado'],
    href: '/',
    status: 'live',
  },
  {
    tag: 'PLATAFORMA',
    name: 'leadflow CRM',
    tagline: 'CRM con IA, pipeline visual y automatizaciones reales.',
    desc: 'CRM completo para equipos de venta consultiva. Pipeline kanban, secuencias automáticas, IA que responde leads en el momento correcto, agenda integrada.',
    bullets: ['Pipeline + sequences', 'Agente IA especialista', 'WhatsApp 2-way nativo'],
    href: '/dashboard',
    status: 'live',
  },
  {
    tag: 'PLATAFORMA',
    name: 'WDT Partners',
    tagline: 'Due diligence de Tax Deed en minutos, no días.',
    desc: 'Plataforma de subastas Tax Deed en EE.UU. DD automatizada en 8 fases, opening bids en tiempo real, calendario multi-estado.',
    bullets: ['DD 8 fases automatizada', 'Opening bids en tiempo real', 'Calendario multi-estado'],
    href: '#contacto',
    status: 'live',
  },
  {
    tag: 'A MEDIDA',
    name: 'AI Agents Especialistas',
    tagline: 'Agentes de IA entrenados en tu negocio.',
    desc: 'Construimos agentes de IA verticales — atención, ventas, calificación de lead — con conocimiento profundo de tu producto y tono de voz.',
    bullets: ['RAG + fine-tuning', 'Integración WhatsApp/sitio/CRM', 'Voz consultiva, no robótica'],
    href: '#contacto',
    status: 'live',
  },
  {
    tag: 'A MEDIDA',
    name: 'Automatización WhatsApp Business',
    tagline: 'Operación completa corriendo en WhatsApp.',
    desc: 'Sistemas en la API oficial de WhatsApp Business — campañas, atención, ventas. Multi-agente, con BI y reportes reales.',
    bullets: ['API oficial Meta', 'Multi-agente + supervisión', 'BI + reportes en tiempo real'],
    href: '#contacto',
    status: 'live',
  },
  {
    tag: 'A MEDIDA',
    name: 'Sistemas a Medida',
    tagline: 'Software que cabe en tu negocio.',
    desc: 'Cuando el SaaS de góndola no sirve, construimos. Backoffice, integración con legacy, dashboards ejecutivos, automatización de procesos.',
    bullets: ['Stack moderno (Next, Postgres, Vercel)', 'CI/CD + DevOps incluidos', 'Mantenimiento y evolución continua'],
    href: '#contacto',
    status: 'live',
  },
]

const pt: AgenciaContent = {
  nav: { ...navCommon, manifesto: 'Manifesto', products: 'Produtos', diff: 'Diferencial', process: 'Processo', cta: 'Conversar' },
  hero: {
    badge: 'WDT GROUP · DESDE 2006 · BRASIL → EUA',
    eyebrow: 'AGÊNCIA DIGITAL',
    h1Pre: 'Seu concorrente já implementou IA.',
    h1Accent: 'Você ainda assiste de camarote.',
    h1Post: '',
    sub: 'Somos a agência digital do WDT Group. Construímos sistemas, IA, automação e marketing para empresas que cansaram de promessa de tecnologia — e querem resultado real.',
    ctaPrimary: 'Agendar diagnóstico de 30min',
    ctaSecondary: 'Ver produtos →',
    stat1n: '20+', stat1l: 'anos construindo software',
    stat2n: '4', stat2l: 'grupos atendidos (Embraer · Abril · Casacor · Globo)',
    stat3n: '1', stat3l: 'exit (Abril → Globo · 2026)',
  },
  trigger: {
    eyebrow: '01 · O QUE ESTÁ ACONTECENDO',
    h2Pre: 'A IA virou ',
    h2Accent: 'commodity',
    h2Post: '. Quem ainda não implementou está perdendo mercado todo trimestre.',
    sub: 'Os números não mentem — e a janela para reagir está fechando.',
    points: [
      { kicker: '67%', t: 'das empresas dos EUA já implementaram IA generativa em pelo menos um processo crítico.', d: 'Fonte: McKinsey State of AI, 2025.' },
      { kicker: '3.7×', t: 'mais produtividade média entre empresas que adotaram IA vs. as que ainda discutem.', d: 'Vendas, suporte, ops, marketing — todos os indicadores.' },
      { kicker: '< 18 meses', t: 'é o tempo médio para uma empresa sem transformação digital perder relevância no seu nicho.', d: 'Não é "vai acontecer". Está acontecendo agora.' },
    ],
    closing: 'Você pode continuar assistindo. Ou pode entrar no jogo com quem joga há 20 anos.',
  },
  manifesto: {
    eyebrow: '02 · MANIFESTO',
    h2: 'Não somos uma agência de IA. Somos uma agência que ',
    h2Accent: 'usa IA',
    p1: 'O mercado está cheio de gente que viu um curso de prompt engineering em 2024 e abriu uma "AI agency". O resultado: sites bonitos, slides cheios de buzzwords, zero entrega.',
    p2: 'Nós somos diferentes pelo motivo mais simples possível: <strong>fazemos software há mais de 20 anos</strong>. Antes da IA virar moda. Antes do SaaS. Antes da nuvem. A IA, pra nós, é só mais uma ferramenta — poderosa, mas só uma. O que importa é o resultado no fim do mês.',
    p3: 'Faz parte do <strong>WDT Group</strong>. Mesmo DNA: clareza, performance, proporcionalidade. Tecnologia que vira capital.',
  },
  products: {
    eyebrow: '03 · O QUE ENTREGAMOS',
    h2: 'Produtos prontos para ',
    h2Accent: 'rodar amanhã',
    sub: 'Plataformas que já operam em produção + sistemas sob medida para quem precisa de algo único.',
    items: products_pt,
    cta: 'Quero saber mais',
  },
  diff: {
    eyebrow: '04 · DIFERENCIAL',
    h2: 'O que o mercado promete vs. o que ',
    h2Accent: 'nós entregamos',
    headerThem: 'AGÊNCIA DE IA "TÍPICA"',
    headerUs: 'WDT AGÊNCIA',
    rows: [
      { feature: 'Tempo de mercado', them: '6 meses, talvez 1 ano', us: '20+ anos de software, 2 décadas antes da IA virar hype' },
      { feature: 'Entrega', them: 'POCs eternos, slides bonitos', us: 'Sistemas em produção, com clientes reais usando hoje' },
      { feature: 'Stack', them: 'No-code + GPT wrapper', us: 'Stack moderna real (Next, Postgres, Vercel, RAG, fine-tuning)' },
      { feature: 'Operação', them: '"Te entrego e tchau"', us: 'CI/CD, observabilidade, suporte e evolução contínua' },
      { feature: 'Cobrança', them: 'Por hora ou por POC', us: 'Por resultado entregue em produção' },
      { feature: 'Cases', them: 'Mockups e testimonials genéricos', us: 'Embraer, Grupo Abril, Casacor, Grupo Globo' },
    ],
  },
  process: {
    eyebrow: '05 · COMO TRABALHAMOS',
    h2: 'Quatro etapas. ',
    h2Accent: 'Zero teatro.',
    steps: [
      { n: '01', t: 'Diagnóstico', d: 'Conversa de 30min para entender negócio, mercado, dor real e resultado esperado. Sem proposta-modelo.' },
      { n: '02', t: 'Desenho da solução', d: 'Mapeamos o caminho mais curto até o resultado. Plataforma pronta + customização? Sob medida? Você decide depois de ver as opções.' },
      { n: '03', t: 'Construção em ciclos curtos', d: 'Entrega real em produção a cada 2 semanas. Você vê funcionando, valida, ajusta. Sem big bang.' },
      { n: '04', t: 'Operação e escala', d: 'Tecnologia que entra em produção precisa rodar 24/7. Suporte, observabilidade e evolução contínua — incluídos.' },
    ],
  },
  proof: {
    eyebrow: '06 · TRACK RECORD',
    h2: 'Não vendemos promessa. Vendemos ',
    h2Accent: 'histórico.',
    stats: [
      { v: '20+', l: 'Anos construindo software para grupos que não podem falhar' },
      { v: '4', l: 'Grupos servidos: Embraer, Abril, Casacor, Globo' },
      { v: '1', l: 'Exit estratégico: Grupo Abril → Grupo Globo (2026)' },
      { v: '∞', l: 'Sistemas ainda rodando em produção, anos depois' },
    ],
    quote: 'Trabalhei com o Leandro durante toda a transformação digital do Grupo Abril. O que ele construía não foi apenas tecnologia — foi a <em>fundação operacional</em> que sustentou a Casacor por anos e que, em 2026, viabilizou o melhor exit que o Grupo Abril já fez, com a aquisição pelo Grupo Globo.',
    author: 'André Secchin',
    role: 'CEO · CASACOR',
  },
  cta: {
    eyebrow: '07 · VAMOS CONVERSAR',
    h2: 'Se a IA é o tema da década, o ',
    h2Accent: 'resultado',
    sub: 'Agende uma conversa de 30 minutos. Sem apresentação genérica, sem proposta-modelo. A gente escuta, devolve clareza e — se fizer sentido para os dois lados — começamos a construir.',
    primary: 'Agendar conversa',
    secondary: 'Ver produtos',
    or: 'Ou direto pelo email',
    email: 'leandro@wdtgroup.com',
  },
  footer: {
    tagline: 'A agência digital do WDT Group. Tecnologia que vira capital — desde 2006.',
    mapTitle: 'MAPA DO SITE',
    contactTitle: 'CONTATO',
    contactItems: ['leandro@wdtgroup.com', 'Brasil → United States', 'WDT GROUP · Desde 2006'],
    rights: '© WDT AGÊNCIA DIGITAL · TODOS OS DIREITOS RESERVADOS',
    values: 'clareza · performance · proporcionalidade',
  },
}

const en: AgenciaContent = {
  nav: { ...navCommon, manifesto: 'Manifesto', products: 'Products', diff: 'Why us', process: 'Process', cta: 'Talk to us' },
  hero: {
    badge: 'WDT GROUP · SINCE 2006 · BRAZIL → USA',
    eyebrow: 'DIGITAL AGENCY',
    h1Pre: 'Your competitor already deployed AI.',
    h1Accent: "You're still watching from the sidelines.",
    h1Post: '',
    sub: "We're the digital agency of WDT Group. We build systems, AI, automation and marketing for companies tired of tech promises — and looking for real results.",
    ctaPrimary: 'Book a 30-min diagnostic',
    ctaSecondary: 'See products →',
    stat1n: '20+', stat1l: 'years building software',
    stat2n: '4', stat2l: 'major groups (Embraer · Abril · Casacor · Globo)',
    stat3n: '1', stat3l: 'exit (Abril → Globo · 2026)',
  },
  trigger: {
    eyebrow: '01 · WHAT IS HAPPENING',
    h2Pre: 'AI has become a ',
    h2Accent: 'commodity',
    h2Post: '. Companies that haven\'t deployed it are losing market share every quarter.',
    sub: 'The numbers don\'t lie — and the window to react is closing.',
    points: [
      { kicker: '67%', t: 'of US companies have already deployed generative AI in at least one critical workflow.', d: 'Source: McKinsey State of AI, 2025.' },
      { kicker: '3.7×', t: 'average productivity gap between companies that adopted AI vs. those still discussing.', d: 'Sales, support, ops, marketing — every indicator.' },
      { kicker: '< 18 months', t: 'is the average time for a company without digital transformation to lose relevance in its niche.', d: 'Not "will happen". Happening now.' },
    ],
    closing: 'You can keep watching. Or you can join the game with people who\'ve been playing for 20 years.',
  },
  manifesto: {
    eyebrow: '02 · MANIFESTO',
    h2: "We're not an AI agency. We're an agency that ",
    h2Accent: 'uses AI',
    p1: 'The market is full of people who took a prompt-engineering course in 2024 and launched an "AI agency". The result: pretty sites, slides full of buzzwords, zero delivery.',
    p2: "We are different for the simplest reason possible: <strong>we've been building software for over 20 years</strong>. Before AI became trendy. Before SaaS. Before the cloud. AI, to us, is just one more tool — a powerful one, but just one. What matters is the result at the end of the month.",
    p3: 'Part of <strong>WDT Group</strong>. Same DNA: clarity, performance, proportionality. Technology turning into capital.',
  },
  products: {
    eyebrow: '03 · WHAT WE DELIVER',
    h2: 'Products ready to ',
    h2Accent: 'run tomorrow',
    sub: 'Platforms already in production + custom systems for those who need something unique.',
    items: products_en,
    cta: 'Learn more',
  },
  diff: {
    eyebrow: '04 · WHY US',
    h2: "What the market promises vs. what ",
    h2Accent: 'we deliver',
    headerThem: 'TYPICAL AI AGENCY',
    headerUs: 'WDT AGENCY',
    rows: [
      { feature: 'Time in market', them: '6 months, maybe 1 year', us: '20+ years of software, 2 decades before the AI hype' },
      { feature: 'Delivery', them: 'Endless POCs, pretty slides', us: 'Systems in production, with real customers using them today' },
      { feature: 'Stack', them: 'No-code + GPT wrapper', us: 'Real modern stack (Next, Postgres, Vercel, RAG, fine-tuning)' },
      { feature: 'Operations', them: '"Here you go, bye"', us: 'CI/CD, observability, support and ongoing evolution' },
      { feature: 'Pricing', them: 'Hourly or per POC', us: 'Per result delivered in production' },
      { feature: 'Cases', them: 'Mockups and generic testimonials', us: 'Embraer, Grupo Abril, Casacor, Grupo Globo' },
    ],
  },
  process: {
    eyebrow: '05 · HOW WE WORK',
    h2: 'Four steps. ',
    h2Accent: 'Zero theater.',
    steps: [
      { n: '01', t: 'Diagnostic', d: '30-min conversation to understand business, market, real pain, expected outcome. No template proposals.' },
      { n: '02', t: 'Solution design', d: 'We map the shortest path to the result. Off-the-shelf + customization? Fully custom? You decide after seeing the options.' },
      { n: '03', t: 'Build in short cycles', d: 'Real delivery in production every 2 weeks. You see it working, validate, adjust. No big bang.' },
      { n: '04', t: 'Operate & scale', d: 'Tech in production must run 24/7. Support, observability and ongoing evolution — included.' },
    ],
  },
  proof: {
    eyebrow: '06 · TRACK RECORD',
    h2: "We don't sell promises. We sell ",
    h2Accent: 'history.',
    stats: [
      { v: '20+', l: 'Years building software for groups that cannot fail' },
      { v: '4', l: 'Major groups: Embraer, Abril, Casacor, Globo' },
      { v: '1', l: 'Strategic exit: Grupo Abril → Grupo Globo (2026)' },
      { v: '∞', l: 'Systems still in production, years later' },
    ],
    quote: "I worked with Leandro through the entire digital transformation at Grupo Abril. What he built was not just technology — it was the <em>operational foundation</em> that sustained Casacor for years and, in 2026, enabled Grupo Abril's best-ever exit, with the acquisition by Grupo Globo.",
    author: 'André Secchin',
    role: 'CEO · CASACOR',
  },
  cta: {
    eyebrow: '07 · LET\'S TALK',
    h2: 'If AI is the topic of the decade, the ',
    h2Accent: 'result',
    sub: "Book a 30-minute call. No generic deck, no template proposal. We listen, give clarity back, and — if it makes sense for both sides — we start building.",
    primary: 'Book a call',
    secondary: 'See products',
    or: 'Or straight by email',
    email: 'leandro@wdtgroup.com',
  },
  footer: {
    tagline: 'The digital agency of WDT Group. Technology turning into capital — since 2006.',
    mapTitle: 'SITEMAP',
    contactTitle: 'CONTACT',
    contactItems: ['leandro@wdtgroup.com', 'Brazil → United States', 'WDT GROUP · Since 2006'],
    rights: '© WDT DIGITAL AGENCY · ALL RIGHTS RESERVED',
    values: 'clarity · performance · proportionality',
  },
}

const es: AgenciaContent = {
  nav: { ...navCommon, manifesto: 'Manifiesto', products: 'Productos', diff: 'Diferencial', process: 'Proceso', cta: 'Hablar' },
  hero: {
    badge: 'WDT GROUP · DESDE 2006 · BRASIL → EE.UU.',
    eyebrow: 'AGENCIA DIGITAL',
    h1Pre: 'Tu competencia ya implementó IA.',
    h1Accent: 'Tú sigues mirando desde el palco.',
    h1Post: '',
    sub: 'Somos la agencia digital del WDT Group. Construimos sistemas, IA, automatización y marketing para empresas que se cansaron de promesa tecnológica — y quieren resultado real.',
    ctaPrimary: 'Agendar diagnóstico de 30min',
    ctaSecondary: 'Ver productos →',
    stat1n: '20+', stat1l: 'años construyendo software',
    stat2n: '4', stat2l: 'grupos atendidos (Embraer · Abril · Casacor · Globo)',
    stat3n: '1', stat3l: 'exit (Abril → Globo · 2026)',
  },
  trigger: {
    eyebrow: '01 · LO QUE ESTÁ PASANDO',
    h2Pre: 'La IA se volvió ',
    h2Accent: 'commodity',
    h2Post: '. Quien no la implementó está perdiendo mercado cada trimestre.',
    sub: 'Los números no mienten — y la ventana para reaccionar se está cerrando.',
    points: [
      { kicker: '67%', t: 'de las empresas en EE.UU. ya implementaron IA generativa en al menos un proceso crítico.', d: 'Fuente: McKinsey State of AI, 2025.' },
      { kicker: '3.7×', t: 'más productividad promedio entre empresas que adoptaron IA vs. las que aún discuten.', d: 'Ventas, soporte, ops, marketing — todos los indicadores.' },
      { kicker: '< 18 meses', t: 'es el tiempo promedio para que una empresa sin transformación digital pierda relevancia en su nicho.', d: 'No es "va a pasar". Está pasando ahora.' },
    ],
    closing: 'Puedes seguir mirando. O puedes entrar al juego con quien lleva 20 años jugando.',
  },
  manifesto: {
    eyebrow: '02 · MANIFIESTO',
    h2: 'No somos una agencia de IA. Somos una agencia que ',
    h2Accent: 'usa IA',
    p1: 'El mercado está lleno de gente que vio un curso de prompt engineering en 2024 y abrió una "AI agency". Resultado: sitios bonitos, slides llenos de buzzwords, cero entrega.',
    p2: 'Somos diferentes por la razón más simple posible: <strong>hacemos software hace más de 20 años</strong>. Antes de que la IA fuera moda. Antes del SaaS. Antes de la nube. La IA, para nosotros, es solo una herramienta más — poderosa, pero solo una. Lo que importa es el resultado a fin de mes.',
    p3: 'Parte del <strong>WDT Group</strong>. Mismo DNA: claridad, performance, proporcionalidad. Tecnología que se vuelve capital.',
  },
  products: {
    eyebrow: '03 · LO QUE ENTREGAMOS',
    h2: 'Productos listos para ',
    h2Accent: 'correr mañana',
    sub: 'Plataformas que ya operan en producción + sistemas a medida para quien necesita algo único.',
    items: products_es,
    cta: 'Saber más',
  },
  diff: {
    eyebrow: '04 · DIFERENCIAL',
    h2: 'Lo que el mercado promete vs. lo que ',
    h2Accent: 'entregamos',
    headerThem: 'AGENCIA DE IA "TÍPICA"',
    headerUs: 'WDT AGENCIA',
    rows: [
      { feature: 'Tiempo en mercado', them: '6 meses, tal vez 1 año', us: '20+ años de software, 2 décadas antes del hype de IA' },
      { feature: 'Entrega', them: 'POCs eternos, slides bonitos', us: 'Sistemas en producción, con clientes reales hoy' },
      { feature: 'Stack', them: 'No-code + GPT wrapper', us: 'Stack moderno real (Next, Postgres, Vercel, RAG, fine-tuning)' },
      { feature: 'Operación', them: '"Te entrego y chao"', us: 'CI/CD, observabilidad, soporte y evolución continua' },
      { feature: 'Cobro', them: 'Por hora o por POC', us: 'Por resultado entregado en producción' },
      { feature: 'Cases', them: 'Mockups y testimoniales genéricos', us: 'Embraer, Grupo Abril, Casacor, Grupo Globo' },
    ],
  },
  process: {
    eyebrow: '05 · CÓMO TRABAJAMOS',
    h2: 'Cuatro etapas. ',
    h2Accent: 'Cero teatro.',
    steps: [
      { n: '01', t: 'Diagnóstico', d: 'Conversación de 30min para entender negocio, mercado, dolor real, resultado esperado. Sin propuesta-modelo.' },
      { n: '02', t: 'Diseño de solución', d: 'Mapeamos el camino más corto al resultado. ¿Plataforma lista + customización? ¿A medida? Decides tras ver opciones.' },
      { n: '03', t: 'Construcción en ciclos cortos', d: 'Entrega real en producción cada 2 semanas. Lo ves funcionando, validas, ajustas. Sin big bang.' },
      { n: '04', t: 'Operar y escalar', d: 'Tecnología en producción tiene que correr 24/7. Soporte, observabilidad y evolución continua — incluidos.' },
    ],
  },
  proof: {
    eyebrow: '06 · TRACK RECORD',
    h2: 'No vendemos promesa. Vendemos ',
    h2Accent: 'historial.',
    stats: [
      { v: '20+', l: 'Años construyendo software para grupos que no pueden fallar' },
      { v: '4', l: 'Grupos servidos: Embraer, Abril, Casacor, Globo' },
      { v: '1', l: 'Exit estratégico: Grupo Abril → Grupo Globo (2026)' },
      { v: '∞', l: 'Sistemas aún corriendo en producción, años después' },
    ],
    quote: 'Trabajé con Leandro durante toda la transformación digital del Grupo Abril. Lo que construía no fue solo tecnología — fue la <em>fundación operacional</em> que sostuvo a Casacor por años y que, en 2026, viabilizó el mejor exit del Grupo Abril con la adquisición por el Grupo Globo.',
    author: 'André Secchin',
    role: 'CEO · CASACOR',
  },
  cta: {
    eyebrow: '07 · HABLEMOS',
    h2: 'Si la IA es el tema de la década, el ',
    h2Accent: 'resultado',
    sub: 'Agenda una llamada de 30 minutos. Sin deck genérico, sin propuesta-modelo. Escuchamos, devolvemos claridad y — si tiene sentido para ambos — empezamos a construir.',
    primary: 'Agendar llamada',
    secondary: 'Ver productos',
    or: 'O directo por email',
    email: 'leandro@wdtgroup.com',
  },
  footer: {
    tagline: 'La agencia digital del WDT Group. Tecnología que se vuelve capital — desde 2006.',
    mapTitle: 'MAPA DEL SITIO',
    contactTitle: 'CONTACTO',
    contactItems: ['leandro@wdtgroup.com', 'Brasil → Estados Unidos', 'WDT GROUP · Desde 2006'],
    rights: '© WDT AGENCIA DIGITAL · TODOS LOS DERECHOS RESERVADOS',
    values: 'claridad · performance · proporcionalidad',
  },
}

export const content: Record<Locale, AgenciaContent> = { pt, en, es }
