import type { Locale } from './i18n'

type TemplateCopy = {
  name: string
  subject: string | null
  body: string
}

type SystemTemplateLike = {
  id?: string | null
  name: string
  subject?: string | null
  body: string
  is_system?: boolean | null
}

type SystemTemplateKey =
  | 'first_contact'
  | 'follow_up_24h'
  | 'schedule_meeting'
  | 'sending_proposal'
  | 'follow_up_3_days'
  | 'thank_you_close'
  | 'welcome_email'

/**
 * Templates do sistema existem como uma unica linha no banco. A interface,
 * os envios manuais, as automacoes e as sequences passam por este catalogo
 * para entregar a mesma copia em PT, EN ou ES sem alterar templates criados
 * pelo proprio cliente.
 */
const COPY: Record<SystemTemplateKey, Record<Locale, TemplateCopy>> = {
  first_contact: {
    pt: {
      name: 'Primeiro contato',
      subject: null,
      body: 'Oi {primeiro_nome}! Aqui é {agente}. Você preencheu um formulário sobre seguro de vida no Facebook/Instagram. Está disponível para conversar agora?',
    },
    en: {
      name: 'First contact',
      subject: null,
      body: 'Hi {primeiro_nome}! This is {agente}. You filled out a life insurance form on Facebook/Instagram. Are you available to talk now?',
    },
    es: {
      name: 'Primer contacto',
      subject: null,
      body: '¡Hola {primeiro_nome}! Soy {agente}. Completaste un formulario sobre seguro de vida en Facebook/Instagram. ¿Estás disponible para hablar ahora?',
    },
  },
  follow_up_24h: {
    pt: {
      name: 'Follow-up de 24h',
      subject: null,
      body: 'Oi {primeiro_nome}! Não consegui falar com você ontem. Ainda tem interesse em saber sobre seguro de vida? Posso ligar em um horário melhor?',
    },
    en: {
      name: '24-hour follow-up',
      subject: null,
      body: "Hi {primeiro_nome}! I couldn't reach you yesterday. Are you still interested in learning about life insurance? Can I call at a better time?",
    },
    es: {
      name: 'Seguimiento de 24 h',
      subject: null,
      body: '¡Hola {primeiro_nome}! No pude contactarte ayer. ¿Todavía te interesa conocer más sobre seguros de vida? ¿Puedo llamarte en un horario más conveniente?',
    },
  },
  schedule_meeting: {
    pt: {
      name: 'Agendar reunião',
      subject: null,
      body: 'Oi {primeiro_nome}! Vou enviar um link para agendar 30 minutos comigo. Vamos ver o melhor plano para você e sua família. Qual dia funciona melhor nesta semana?',
    },
    en: {
      name: 'Schedule a meeting',
      subject: null,
      body: "Hi {primeiro_nome}! I'll send you a link to schedule a 30-minute meeting with me. We'll review the best plan for you and your family. Which day works best this week?",
    },
    es: {
      name: 'Agendar una reunión',
      subject: null,
      body: '¡Hola {primeiro_nome}! Te enviaré un enlace para agendar una reunión de 30 minutos conmigo. Veremos el mejor plan para ti y tu familia. ¿Qué día te conviene más esta semana?',
    },
  },
  sending_proposal: {
    pt: {
      name: 'Envio de proposta',
      subject: null,
      body: 'Oi {primeiro_nome}! Acabei de enviar por e-mail a proposta personalizada que conversamos. Avise quando revisar para eu esclarecer qualquer dúvida!',
    },
    en: {
      name: 'Proposal sent',
      subject: null,
      body: 'Hi {primeiro_nome}! I just emailed you the personalized proposal we discussed. Let me know once you review it so I can answer any questions!',
    },
    es: {
      name: 'Propuesta enviada',
      subject: null,
      body: '¡Hola {primeiro_nome}! Acabo de enviarte por correo electrónico la propuesta personalizada que conversamos. Avísame cuando la revises para aclarar cualquier duda.',
    },
  },
  follow_up_3_days: {
    pt: {
      name: 'Follow-up de 3 dias',
      subject: null,
      body: 'Oi {primeiro_nome}, tudo bem? Só para lembrar que estou à disposição para esclarecer qualquer dúvida sobre o seguro. Posso ajudar com algo?',
    },
    en: {
      name: '3-day follow-up',
      subject: null,
      body: "Hi {primeiro_nome}, how are you? Just a reminder that I'm available to answer any questions about the insurance. Is there anything I can help you with?",
    },
    es: {
      name: 'Seguimiento de 3 días',
      subject: null,
      body: 'Hola {primeiro_nome}, ¿cómo estás? Solo quería recordarte que estoy disponible para aclarar cualquier duda sobre el seguro. ¿Puedo ayudarte con algo?',
    },
  },
  thank_you_close: {
    pt: {
      name: 'Agradecimento pelo fechamento',
      subject: null,
      body: 'Obrigado pela confiança, {primeiro_nome}! Sua apólice será emitida em breve. Se tiver qualquer dúvida, pode falar comigo a qualquer momento. 🙌',
    },
    en: {
      name: 'Thank you for choosing us',
      subject: null,
      body: 'Thank you for your trust, {primeiro_nome}! Your policy will be issued soon. If you have any questions, feel free to reach out at any time. 🙌',
    },
    es: {
      name: 'Gracias por elegirnos',
      subject: null,
      body: '¡Gracias por tu confianza, {primeiro_nome}! Tu póliza será emitida pronto. Si tienes alguna duda, puedes escribirme en cualquier momento. 🙌',
    },
  },
  welcome_email: {
    pt: {
      name: 'E-mail de boas-vindas',
      subject: 'Vamos conversar sobre seu seguro de vida',
      body: 'Prezado(a) {nome},\n\nObrigado pelo interesse em seguro de vida. Sou {agente}, produtor(a) de seguros, e serei seu contato direto.\n\nGostaria de agendar uma conversa de 30 minutos para entender suas necessidades e recomendar o melhor plano para você e sua família.\n\nAtenciosamente,\n{agente}',
    },
    en: {
      name: 'Welcome email',
      subject: "Let's discuss your life insurance needs",
      body: 'Dear {nome},\n\nThank you for your interest in life insurance. My name is {agente}, and I will be your direct insurance producer.\n\nI would like to schedule a 30-minute conversation to understand your needs and recommend the best plan for you and your family.\n\nSincerely,\n{agente}',
    },
    es: {
      name: 'Correo de bienvenida',
      subject: 'Hablemos sobre tus necesidades de seguro de vida',
      body: 'Estimado(a) {nome}:\n\nGracias por tu interés en un seguro de vida. Soy {agente}, productor(a) de seguros, y seré tu contacto directo.\n\nMe gustaría agendar una conversación de 30 minutos para entender tus necesidades y recomendar el mejor plan para ti y tu familia.\n\nAtentamente,\n{agente}',
    },
  },
}

const IDS: Partial<Record<string, SystemTemplateKey>> = {
  '09623d9a-ec4a-453a-8c11-c0a5e41ca2ff': 'first_contact',
  'd74521ea-9f92-4c12-a24a-e8fa5f54eb5e': 'follow_up_24h',
  'dc1fc9a7-3e58-4dcf-a8a7-23e5dca3d857': 'schedule_meeting',
  'ddea7e67-6493-48de-8003-81af04acae34': 'sending_proposal',
  '5298b035-6dcc-4e70-9bc3-fbcb13d42883': 'follow_up_3_days',
  'c66281df-f432-494b-9e41-34e90f05141d': 'thank_you_close',
  'b525b260-6b83-4a21-bcae-745064d019bf': 'welcome_email',
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

const NAME_KEYS = Object.entries(COPY).reduce<Record<string, SystemTemplateKey>>((out, [key, locales]) => {
  for (const copy of Object.values(locales)) out[normalize(copy.name)] = key as SystemTemplateKey
  return out
}, {
  'follow-up 24h': 'follow_up_24h',
  'agendar reuniao': 'schedule_meeting',
  'enviando proposta': 'sending_proposal',
  'follow-up 3 dias': 'follow_up_3_days',
  'obrigado fechamento': 'thank_you_close',
  'email boas-vindas': 'welcome_email',
})

export function systemTemplateKey(template: SystemTemplateLike): SystemTemplateKey | null {
  return (template.id && IDS[template.id]) || NAME_KEYS[normalize(template.name)] || null
}

export function localizeSystemTemplate<T extends SystemTemplateLike>(template: T, locale: Locale): T {
  if (!template.is_system) return template
  const key = systemTemplateKey(template)
  if (!key) return template
  return { ...template, ...COPY[key][locale] }
}

export function localizeSystemTemplates<T extends SystemTemplateLike>(templates: T[], locale: Locale): T[] {
  return templates.map(template => localizeSystemTemplate(template, locale))
}

export function systemTemplateNames(template: SystemTemplateLike): string[] {
  const key = systemTemplateKey(template)
  return key ? [...new Set(Object.values(COPY[key]).map(copy => copy.name))] : [template.name]
}

export const SYSTEM_TEMPLATE_COUNT = Object.keys(COPY).length
