/**
 * i18n — Lead4Pro (PT-BR, EN, ES)
 *
 * Arquitetura simples, sem dependencia externa:
 * - Locale resolvido server-side via cookie (ver locale.ts)
 * - Dicionario com todas as strings em tres idiomas
 * - Componente cliente (locale-switcher.tsx) troca cookie + reload
 *
 * Convencao: chaves agrupadas por secao (nav, hero, features, etc).
 * Quando adicionar string nova, adicionar nas TRES linguas pra evitar
 * fallback no runtime.
 */

export type Locale = 'pt' | 'en' | 'es'

export const LOCALES: Locale[] = ['pt', 'en', 'es']
export const DEFAULT_LOCALE: Locale = 'pt'

export const LOCALE_META: Record<Locale, { flag: string; name: string; short: string }> = {
  pt: { flag: '🇧🇷', name: 'Português',  short: 'PT' },
  en: { flag: '🇺🇸', name: 'English',    short: 'EN' },
  es: { flag: '🇪🇸', name: 'Español',    short: 'ES' },
}

export const messages = {
  pt: {
    nav: {
      pricing: 'Preços',
      login: 'Entrar',
      register: 'Criar Conta Grátis',
    },
    hero: {
      badge: 'Para donos de agência e producers independentes',
      titleA: 'Leads exclusivos + CRM feito pra quem',
      titleB: 'vende seguro de vida',
      subtitle: 'Compre leads quentes nos EUA, distribua pro seu time automaticamente, acompanhe cada deal no pipeline e feche mais apólices.',
      ctaStart: 'Começar Grátis — Sem Cartão',
      ctaFeatures: 'Ver Features',
      trialNote: 'dias grátis de CRM Pro',
      trialDetails: '· todas as features liberadas · sem cartão',
    },
    stats: {
      perLead: 'por lead exclusivo',
      delivery: 'entrega WhatsApp',
      exclusive: 'exclusivo (1:1)',
      ai: 'prioriza seus leads',
      crm: 'CRM completo',
    },
    whatsNew: {
      badge: 'Novidades 2026',
      title: 'Superpoderes que fecham negócio sozinho',
      subtitle: 'Plataforma completa: marketplace de leads, CRM com IA, agenda unificada, WhatsApp bidirecional e automações. Tudo num lugar só.',
      cta: 'Testar todas as features grátis →',
      cards: {
        trial: {
          tag: 'GRÁTIS',
          title: '7 dias de CRM Pro grátis',
          desc: 'Ao cadastrar, todas as features premium ficam liberadas por 7 dias. Sem cartão de crédito. Se gostar, $99/mês. Se não, continua no plano grátis.',
        },
        multiWhatsApp: {
          tag: 'PRIVACIDADE',
          title: 'WhatsApp próprio por agente',
          desc: 'Cada vendedor conecta o próprio WhatsApp no sistema escaneando um QR. Mensagens saem do número DELE, não de um número genérico da agência. Thread independente por agente.',
        },
        teamMirror: {
          tag: 'AGÊNCIAS',
          title: 'Espelho do pipeline do time',
          desc: 'Dono da agência vê, em tempo real, o kanban completo de cada vendedor. Mesmas colunas, mesmos cards, mesmos follow-ups. Zero relatório Excel — acompanhe deals do time direto.',
        },
        whatsappInbox: {
          tag: 'COMPLETO',
          title: 'WhatsApp Inbox bidirecional',
          desc: 'Envie e receba dentro do sistema: texto, emoji, fotos, áudios, PDFs e documentos. Histórico completo por lead, badge de não-lidas, push automático.',
        },
        aiScoring: {
          tag: 'AI',
          title: 'Lead Scoring com IA',
          desc: 'Claude analisa cada lead e dá score 0-100 com explicação. Priorize os quentes automaticamente. Rode em lote com 1 clique.',
        },
        sequencesTrigger: {
          tag: 'AUTOMÁTICO',
          title: 'Sequences com gatilho por stage',
          desc: 'Configure: "quando lead cair em Reunião, enrolla ele numa cadência de 7 dias". Dia 1 WhatsApp, dia 3 email, dia 7 ligação. Automático, sem clicar em nada.',
        },
        automations: {
          tag: 'NO-CODE',
          title: 'Automações sem código',
          desc: 'Lead parado 48h? Dispara follow-up. Entrou em "Negociação"? Manda proposta. Configure gatilhos visualmente e esqueça.',
        },
        calendar: {
          tag: 'AGENDA',
          title: 'Agenda unificada',
          desc: 'Calendário Dia/Semana/Mês com Eventos, Tarefas, Appointments e Follow-ups num só lugar. Reagende, delete, marque como concluído direto no calendário.',
        },
        performance: {
          tag: 'ANALYTICS',
          title: 'Performance + Leaderboard',
          desc: 'KPIs de contato, conversão, custo por fechamento, funil do pipeline, ROI por fonte. Leaderboard do time pra agências compararem agentes.',
        },
      },
    },
    agency: {
      badge: 'Pra agências de seguros',
      title: 'Escala seu time sem perder o controle',
      subtitle: 'Agências de seguros tem necessidades diferentes de producer solo. Construímos features específicas pra quem gerencia 3, 5, 20 vendedores — sem planilha do Excel e sem WhatsApp compartilhado caótico.',
      bullets: [
        { title: 'Distribuição automática de leads', desc: 'Compre leads em volume, sistema distribui round-robin pro time, respeitando estado e disponibilidade.' },
        { title: 'Espelho do pipeline de cada agente', desc: 'Veja o kanban completo de cada vendedor em tempo real. Quem tem lead parado? Quem fechou hoje?' },
        { title: 'Cada vendedor com próprio WhatsApp', desc: 'Escaneie QR uma vez e as mensagens saem do número DELE. Zero vazamento de conversas entre agentes.' },
        { title: 'Atribuir lead em 1 clique', desc: 'Menu kebab no card do kanban: transfere pra outro agente e ele recebe push + WhatsApp + email.' },
        { title: 'Leaderboard + KPIs individuais', desc: 'Compare performance: contatos, conversão, deals fechados, tempo médio de resposta. Mostre os melhores.' },
      ],
      cta: 'Testar com minha agência — 7 dias grátis →',
    },
    features: {
      tag: 'Para donos de agência',
      title: 'Monte seu time e escale suas vendas',
      subtitle: 'Cadastre seus agentes, compre leads em volume e distribua automaticamente. Acompanhe o pipeline de cada membro do time em tempo real.',
      items: [
        { title: 'Pipeline por agente', desc: 'Veja em tempo real como cada vendedor tá indo no funil.' },
        { title: 'Distribuição automática', desc: 'Round-robin ponderado por créditos e estado.' },
        { title: 'Meu Time + WhatsApp', desc: 'Cada agente conecta próprio WhatsApp. Zero vazamento.' },
        { title: 'Leaderboard', desc: 'Ranking público interno. Competição sadia puxa resultado.' },
      ],
    },
    crm: {
      title: 'CRM Pro completo — tudo num lugar só',
      subtitle: 'Pipeline Kanban, WhatsApp, sequences, automações, agenda e analytics. Pague só quando quiser escalar.',
      labels: {
        inbox: 'WhatsApp Inbox',
        score: 'AI Scoring',
        sequences: 'Sequences',
        automations: 'Automações',
        team: 'Time + Leaderboard',
        push: 'Push Notifications',
        templates: 'Templates',
        calendar: 'Calendário',
        performance: 'Performance',
        tags: 'Tags + Filtros',
      },
    },
    how: {
      title: 'Como funciona',
      steps: [
        { step: '1', icon: '📝', title: 'Crie sua conta grátis', desc: 'Cadastre-se em 30 segundos. Configure seus estados e dados de contato. Sem cartão.' },
        { step: '2', icon: '💳', title: 'Compre leads ou assine o CRM', desc: 'Pacotes de leads a partir de $220. Ou CRM Pro por $99/mês com 7 dias grátis.' },
        { step: '3', icon: '📞', title: 'Contate em 5 minutos', desc: 'Receba o lead no WhatsApp, email e push. Ligue, feche e atualize o pipeline.' },
        { step: '4', icon: '💰', title: 'Feche apólices e escale', desc: 'Acompanhe conversão, use IA pra priorizar quentes, automatize follow-ups.' },
      ],
    },
    pricing: {
      title: 'Preços diretos',
      subtitle: 'Conta grátis pra sempre. Compre leads avulso. Assine o CRM quando quiser escalar.',
      free: {
        name: 'Grátis',
        price: 'Grátis',
        priceSub: 'pra sempre',
        features: [
          'Cadastro e perfil',
          'Recebe leads do marketplace',
          'Dashboard básico',
          'Sem CRM, pipeline ou automações',
        ],
        cta: 'Criar conta grátis',
      },
      pro: {
        badge: 'MAIS POPULAR',
        name: 'CRM Pro',
        price: '$99',
        priceSub: '/mês',
        trial: '7 dias grátis',
        features: [
          'Tudo do plano grátis',
          'Pipeline Kanban completo',
          'WhatsApp bidirecional',
          'AI Lead Scoring',
          'Sequences + Automações',
          'Agenda + Performance',
          'Meu Time + Leaderboard',
        ],
        cta: 'Começar 7 dias grátis',
      },
      leads: {
        name: 'Pacotes de Leads',
        priceFrom: 'a partir de',
        price: '$18',
        priceSub: 'por lead',
        features: [
          '10 leads por $220',
          '25 leads por $500 ($20/lead)',
          '50 leads por $900 ($18/lead)',
          'Exclusivos (1:1) — só seu',
          'Entrega em 5 minutos',
        ],
        cta: 'Ver pacotes',
      },
    },
    final: {
      title: 'Pare de perder leads. Comece a fechar.',
      subtitle: 'Conta grátis em 30 segundos. Compre leads ou assine o CRM quando estiver pronto. Sem contrato, sem fidelidade.',
      cta: 'Criar Minha Conta Grátis',
    },
    footer: {
      privacy: 'Privacidade',
      login: 'Login',
      register: 'Cadastro',
      copyright: '© 2026 Lead4Pro. Todos os direitos reservados.',
    },
  },
  en: {
    nav: {
      pricing: 'Pricing',
      login: 'Log in',
      register: 'Sign Up Free',
    },
    hero: {
      badge: 'For agency owners and independent producers',
      titleA: 'Exclusive leads + CRM built for',
      titleB: 'life insurance producers',
      subtitle: 'Buy hot leads across the US, auto-distribute to your team, track every deal in the pipeline, and close more policies.',
      ctaStart: 'Start Free — No Credit Card',
      ctaFeatures: 'See Features',
      trialNote: 'days of CRM Pro free',
      trialDetails: '· all features unlocked · no credit card',
    },
    stats: {
      perLead: 'per exclusive lead',
      delivery: 'WhatsApp delivery',
      exclusive: 'exclusive (1:1)',
      ai: 'prioritizes your leads',
      crm: 'complete CRM',
    },
    whatsNew: {
      badge: 'New in 2026',
      title: 'Superpowers that close deals on their own',
      subtitle: 'Complete platform: lead marketplace, AI-powered CRM, unified calendar, two-way WhatsApp, and automations. All in one place.',
      cta: 'Try all features for free →',
      cards: {
        trial: {
          tag: 'FREE',
          title: '7 days of CRM Pro free',
          desc: 'When you sign up, all premium features are unlocked for 7 days. No credit card required. Like it? $99/mo. Don\u2019t? Stay on the free plan.',
        },
        multiWhatsApp: {
          tag: 'PRIVACY',
          title: 'Each agent with their own WhatsApp',
          desc: 'Every salesperson connects their own WhatsApp by scanning a QR code. Messages go out from THEIR number, not a shared agency number. Independent thread per agent.',
        },
        teamMirror: {
          tag: 'AGENCIES',
          title: 'Mirror of your team\u2019s pipeline',
          desc: 'Agency owners see the full kanban of every salesperson in real time. Same columns, same cards, same follow-ups. Zero Excel reports — track deals directly.',
        },
        whatsappInbox: {
          tag: 'COMPLETE',
          title: 'Two-way WhatsApp Inbox',
          desc: 'Send and receive inside the system: text, emoji, photos, audio, PDFs, and documents. Full history per lead, unread badges, automatic push.',
        },
        aiScoring: {
          tag: 'AI',
          title: 'AI Lead Scoring',
          desc: 'Claude analyzes every lead and gives a 0-100 score with explanation. Prioritize the hot ones automatically. Run in bulk with one click.',
        },
        sequencesTrigger: {
          tag: 'AUTO',
          title: 'Sequences with stage triggers',
          desc: 'Set it up: "when a lead hits the Meeting stage, enroll in a 7-day cadence." Day 1 WhatsApp, day 3 email, day 7 call. Automatic, zero clicks.',
        },
        automations: {
          tag: 'NO-CODE',
          title: 'No-code automations',
          desc: 'Lead stale for 48h? Fire a follow-up. Moved to "Negotiation"? Send the proposal. Set triggers visually and forget.',
        },
        calendar: {
          tag: 'CALENDAR',
          title: 'Unified calendar',
          desc: 'Day/Week/Month calendar with Events, Tasks, Appointments, and Follow-ups in one place. Reschedule, delete, mark as done straight from the calendar.',
        },
        performance: {
          tag: 'ANALYTICS',
          title: 'Performance + Leaderboard',
          desc: 'KPIs for contact rate, conversion, cost per close, pipeline funnel, ROI by source. Team leaderboard for agencies to compare agents.',
        },
      },
    },
    agency: {
      badge: 'For insurance agencies',
      title: 'Scale your team without losing control',
      subtitle: 'Agencies have different needs than solo producers. We built specific features for anyone managing 3, 5, or 20 salespeople — no Excel spreadsheets, no chaotic shared WhatsApp.',
      bullets: [
        { title: 'Automatic lead distribution', desc: 'Buy leads in volume, system distributes round-robin to your team, respecting state and availability.' },
        { title: 'Mirror of each agent\u2019s pipeline', desc: 'See the full kanban of every salesperson in real time. Who has stale leads? Who closed today?' },
        { title: 'Every salesperson with own WhatsApp', desc: 'Scan a QR once and messages go from THEIR number. Zero conversation leakage between agents.' },
        { title: 'Assign a lead in one click', desc: 'Kebab menu on kanban card: transfer to another agent and they receive push + WhatsApp + email.' },
        { title: 'Leaderboard + individual KPIs', desc: 'Compare performance: contacts, conversion, deals closed, average response time. Show off the top performers.' },
      ],
      cta: 'Try with my agency — 7 days free →',
    },
    features: {
      tag: 'For agency owners',
      title: 'Build your team and scale your sales',
      subtitle: 'Register your agents, buy leads in bulk, and auto-distribute. Track each team member\u2019s pipeline in real time.',
      items: [
        { title: 'Pipeline per agent', desc: 'See in real time how each salesperson is progressing through the funnel.' },
        { title: 'Automatic distribution', desc: 'Round-robin weighted by credits and state.' },
        { title: 'My Team + WhatsApp', desc: 'Each agent connects their own WhatsApp. Zero leakage.' },
        { title: 'Leaderboard', desc: 'Internal public ranking. Healthy competition drives results.' },
      ],
    },
    crm: {
      title: 'Complete CRM Pro — all in one place',
      subtitle: 'Kanban pipeline, WhatsApp, sequences, automations, calendar, and analytics. Pay only when you want to scale.',
      labels: {
        inbox: 'WhatsApp Inbox',
        score: 'AI Scoring',
        sequences: 'Sequences',
        automations: 'Automations',
        team: 'Team + Leaderboard',
        push: 'Push Notifications',
        templates: 'Templates',
        calendar: 'Calendar',
        performance: 'Performance',
        tags: 'Tags + Filters',
      },
    },
    how: {
      title: 'How it works',
      steps: [
        { step: '1', icon: '📝', title: 'Create your free account', desc: 'Sign up in 30 seconds. Set your states and contact info. No credit card.' },
        { step: '2', icon: '💳', title: 'Buy leads or subscribe to CRM', desc: 'Lead packages starting at $220. Or CRM Pro for $99/mo with 7 days free.' },
        { step: '3', icon: '📞', title: 'Contact in 5 minutes', desc: 'Get the lead on WhatsApp, email, and push. Call, close, update the pipeline.' },
        { step: '4', icon: '💰', title: 'Close policies and scale', desc: 'Track conversion, use AI to prioritize hot leads, automate follow-ups.' },
      ],
    },
    pricing: {
      title: 'Straight pricing',
      subtitle: 'Free account forever. Buy leads à la carte. Subscribe to the CRM when you want to scale.',
      free: {
        name: 'Free',
        price: 'Free',
        priceSub: 'forever',
        features: [
          'Signup and profile',
          'Receive leads from marketplace',
          'Basic dashboard',
          'No CRM, pipeline, or automations',
        ],
        cta: 'Sign up free',
      },
      pro: {
        badge: 'MOST POPULAR',
        name: 'CRM Pro',
        price: '$99',
        priceSub: '/month',
        trial: '7 days free',
        features: [
          'Everything in Free',
          'Full Kanban pipeline',
          'Two-way WhatsApp',
          'AI Lead Scoring',
          'Sequences + Automations',
          'Calendar + Performance',
          'My Team + Leaderboard',
        ],
        cta: 'Start 7 days free',
      },
      leads: {
        name: 'Lead Packages',
        priceFrom: 'starting at',
        price: '$18',
        priceSub: 'per lead',
        features: [
          '10 leads for $220',
          '25 leads for $500 ($20/lead)',
          '50 leads for $900 ($18/lead)',
          'Exclusive (1:1) — yours only',
          'Delivered in 5 minutes',
        ],
        cta: 'See packages',
      },
    },
    final: {
      title: 'Stop losing leads. Start closing.',
      subtitle: 'Free account in 30 seconds. Buy leads or subscribe to the CRM when you\u2019re ready. No contracts, no lock-ins.',
      cta: 'Create My Free Account',
    },
    footer: {
      privacy: 'Privacy',
      login: 'Log in',
      register: 'Sign up',
      copyright: '© 2026 Lead4Pro. All rights reserved.',
    },
  },
  es: {
    nav: {
      pricing: 'Precios',
      login: 'Entrar',
      register: 'Crear Cuenta Gratis',
    },
    hero: {
      badge: 'Para dueños de agencia y productores independientes',
      titleA: 'Leads exclusivos + CRM hecho para quien',
      titleB: 'vende seguro de vida',
      subtitle: 'Compra leads calientes en EE.UU., distribuye a tu equipo automáticamente, sigue cada deal en el pipeline y cierra más pólizas.',
      ctaStart: 'Empezar Gratis — Sin Tarjeta',
      ctaFeatures: 'Ver Features',
      trialNote: 'días de CRM Pro gratis',
      trialDetails: '· todas las features activas · sin tarjeta',
    },
    stats: {
      perLead: 'por lead exclusivo',
      delivery: 'entrega WhatsApp',
      exclusive: 'exclusivo (1:1)',
      ai: 'prioriza tus leads',
      crm: 'CRM completo',
    },
    whatsNew: {
      badge: 'Novedades 2026',
      title: 'Superpoderes que cierran negocios solos',
      subtitle: 'Plataforma completa: marketplace de leads, CRM con IA, calendario unificado, WhatsApp bidireccional y automatizaciones. Todo en un solo lugar.',
      cta: 'Probar todas las features gratis →',
      cards: {
        trial: {
          tag: 'GRATIS',
          title: '7 días de CRM Pro gratis',
          desc: 'Al registrarte, todas las features premium quedan activas por 7 días. Sin tarjeta de crédito. ¿Te gusta? $99/mes. ¿No? Sigues en el plan gratis.',
        },
        multiWhatsApp: {
          tag: 'PRIVACIDAD',
          title: 'WhatsApp propio por agente',
          desc: 'Cada vendedor conecta su propio WhatsApp escaneando un QR. Los mensajes salen de SU número, no de uno genérico de la agencia. Thread independiente por agente.',
        },
        teamMirror: {
          tag: 'AGENCIAS',
          title: 'Espejo del pipeline del equipo',
          desc: 'El dueño de la agencia ve, en tiempo real, el kanban completo de cada vendedor. Mismas columnas, mismas tarjetas, mismos follow-ups. Cero reportes de Excel — sigue los deals directo.',
        },
        whatsappInbox: {
          tag: 'COMPLETO',
          title: 'Bandeja WhatsApp bidireccional',
          desc: 'Envía y recibe dentro del sistema: texto, emoji, fotos, audios, PDFs y documentos. Historial completo por lead, badge de no leídos, push automático.',
        },
        aiScoring: {
          tag: 'IA',
          title: 'Lead Scoring con IA',
          desc: 'Claude analiza cada lead y le da score 0-100 con explicación. Prioriza los calientes automáticamente. Ejecuta en lote con 1 clic.',
        },
        sequencesTrigger: {
          tag: 'AUTO',
          title: 'Sequences con disparador por etapa',
          desc: 'Configura: "cuando un lead caiga en Reunión, inscríbelo en una cadencia de 7 días". Día 1 WhatsApp, día 3 email, día 7 llamada. Automático, sin hacer clic.',
        },
        automations: {
          tag: 'NO-CODE',
          title: 'Automatizaciones sin código',
          desc: '¿Lead parado 48h? Dispara follow-up. ¿Entró en "Negociación"? Envía propuesta. Configura disparadores visualmente y olvídate.',
        },
        calendar: {
          tag: 'AGENDA',
          title: 'Calendario unificado',
          desc: 'Calendario Día/Semana/Mes con Eventos, Tareas, Appointments y Follow-ups en un solo lugar. Reagenda, borra, marca como completado directo desde el calendario.',
        },
        performance: {
          tag: 'ANALYTICS',
          title: 'Performance + Leaderboard',
          desc: 'KPIs de contacto, conversión, costo por cierre, embudo del pipeline, ROI por fuente. Leaderboard del equipo para agencias comparar agentes.',
        },
      },
    },
    agency: {
      badge: 'Para agencias de seguros',
      title: 'Escala tu equipo sin perder el control',
      subtitle: 'Las agencias tienen necesidades distintas a un productor solo. Construimos features específicas para quien gestiona 3, 5, 20 vendedores — sin planillas de Excel ni WhatsApp compartido caótico.',
      bullets: [
        { title: 'Distribución automática de leads', desc: 'Compra leads en volumen, el sistema distribuye round-robin al equipo, respetando estado y disponibilidad.' },
        { title: 'Espejo del pipeline de cada agente', desc: 'Mira el kanban completo de cada vendedor en tiempo real. ¿Quién tiene lead parado? ¿Quién cerró hoy?' },
        { title: 'Cada vendedor con su WhatsApp', desc: 'Escanea el QR una vez y los mensajes salen de SU número. Cero filtración de conversaciones entre agentes.' },
        { title: 'Asignar un lead en 1 clic', desc: 'Menú en la tarjeta del kanban: transfiere a otro agente y recibe push + WhatsApp + email.' },
        { title: 'Leaderboard + KPIs individuales', desc: 'Compara performance: contactos, conversión, deals cerrados, tiempo medio de respuesta. Muestra los mejores.' },
      ],
      cta: 'Probar con mi agencia — 7 días gratis →',
    },
    features: {
      tag: 'Para dueños de agencia',
      title: 'Arma tu equipo y escala tus ventas',
      subtitle: 'Registra a tus agentes, compra leads en volumen y distribuye automáticamente. Sigue el pipeline de cada miembro en tiempo real.',
      items: [
        { title: 'Pipeline por agente', desc: 'Mira en tiempo real cómo avanza cada vendedor en el embudo.' },
        { title: 'Distribución automática', desc: 'Round-robin ponderado por créditos y estado.' },
        { title: 'Mi Equipo + WhatsApp', desc: 'Cada agente conecta su propio WhatsApp. Cero filtración.' },
        { title: 'Leaderboard', desc: 'Ranking público interno. Competencia sana mueve el resultado.' },
      ],
    },
    crm: {
      title: 'CRM Pro completo — todo en un solo lugar',
      subtitle: 'Pipeline Kanban, WhatsApp, sequences, automatizaciones, calendario y analytics. Paga solo cuando quieras escalar.',
      labels: {
        inbox: 'WhatsApp Inbox',
        score: 'AI Scoring',
        sequences: 'Sequences',
        automations: 'Automatizaciones',
        team: 'Equipo + Leaderboard',
        push: 'Push Notifications',
        templates: 'Templates',
        calendar: 'Calendario',
        performance: 'Performance',
        tags: 'Tags + Filtros',
      },
    },
    how: {
      title: 'Cómo funciona',
      steps: [
        { step: '1', icon: '📝', title: 'Crea tu cuenta gratis', desc: 'Regístrate en 30 segundos. Configura tus estados y datos de contacto. Sin tarjeta.' },
        { step: '2', icon: '💳', title: 'Compra leads o suscríbete al CRM', desc: 'Paquetes de leads desde $220. O CRM Pro por $99/mes con 7 días gratis.' },
        { step: '3', icon: '📞', title: 'Contacta en 5 minutos', desc: 'Recibe el lead en WhatsApp, email y push. Llama, cierra y actualiza el pipeline.' },
        { step: '4', icon: '💰', title: 'Cierra pólizas y escala', desc: 'Sigue la conversión, usa IA para priorizar calientes, automatiza follow-ups.' },
      ],
    },
    pricing: {
      title: 'Precios directos',
      subtitle: 'Cuenta gratis para siempre. Compra leads sueltos. Suscríbete al CRM cuando quieras escalar.',
      free: {
        name: 'Gratis',
        price: 'Gratis',
        priceSub: 'para siempre',
        features: [
          'Registro y perfil',
          'Recibe leads del marketplace',
          'Dashboard básico',
          'Sin CRM, pipeline o automatizaciones',
        ],
        cta: 'Crear cuenta gratis',
      },
      pro: {
        badge: 'MÁS POPULAR',
        name: 'CRM Pro',
        price: '$99',
        priceSub: '/mes',
        trial: '7 días gratis',
        features: [
          'Todo del plan Gratis',
          'Pipeline Kanban completo',
          'WhatsApp bidireccional',
          'AI Lead Scoring',
          'Sequences + Automatizaciones',
          'Calendario + Performance',
          'Mi Equipo + Leaderboard',
        ],
        cta: 'Empezar 7 días gratis',
      },
      leads: {
        name: 'Paquetes de Leads',
        priceFrom: 'desde',
        price: '$18',
        priceSub: 'por lead',
        features: [
          '10 leads por $220',
          '25 leads por $500 ($20/lead)',
          '50 leads por $900 ($18/lead)',
          'Exclusivos (1:1) — solo tuyos',
          'Entrega en 5 minutos',
        ],
        cta: 'Ver paquetes',
      },
    },
    final: {
      title: 'Deja de perder leads. Empieza a cerrar.',
      subtitle: 'Cuenta gratis en 30 segundos. Compra leads o suscríbete al CRM cuando estés listo. Sin contratos, sin letra chica.',
      cta: 'Crear Mi Cuenta Gratis',
    },
    footer: {
      privacy: 'Privacidad',
      login: 'Entrar',
      register: 'Registro',
      copyright: '© 2026 Lead4Pro. Todos los derechos reservados.',
    },
  },
} as const

export type Messages = typeof messages.pt

export function getMessages(locale: Locale): Messages {
  return (messages[locale] || messages[DEFAULT_LOCALE]) as Messages
}
