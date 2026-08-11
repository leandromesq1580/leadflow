/**
 * 🎓 Conteúdo do Treinamento — curso organizado por TEMAS (módulos), em ordem de trilha.
 * Cada vídeo: id = fileId do Google Drive (pasta "Vídeos Plataforma", link liberado), title = nome limpo da aula.
 * Vídeo novo na pasta que ainda não estiver aqui aparece sozinho na seção "Novas aulas".
 */

// media 'drive' (padrão): id = fileId do Google Drive. media 'storage': id = path no bucket
// lead-attachments (community/training/...), com poster opcional — servidos via /api/training/media.
export type TrainingVideo = { id: string; title: string; media?: 'drive' | 'storage'; poster?: string }
export type TrainingModule = { key: string; icon: string; title: string; desc: string; videos: TrainingVideo[] }

/** Módulos com títulos/descrições no locale pedido (default 'pt' — retrocompatível). */
export function getTrainingModules(locale: 'pt' | 'en' | 'es' = 'pt'): TrainingModule[] {
  const L = (pt: string, en: string, es: string) => (locale === 'en' ? en : locale === 'es' ? es : pt)
  return [
    {
      key: 'primeiros-passos',
      icon: '🚀',
      title: L('Primeiros passos', 'Getting started', 'Primeros pasos'),
      desc: L(
        'Conheça o painel e deixe sua conta redonda antes de atacar os leads.',
        'Get to know the dashboard and get your account in shape before going after leads.',
        'Conoce el panel y deja tu cuenta lista antes de atacar los leads.',
      ),
      videos: [
        { id: 'community/training/conheca-treinamento-zoe.mp4', title: L('Conheça o Treinamento e a Zoe', 'Meet the Training and Zoe', 'Conoce el Entrenamiento y a Zoe'), media: 'storage', poster: 'community/training/conheca-treinamento-zoe.jpg' },
        { id: '1ItLCqmg3g9tppkFNEfiwdhmdVT9nA60c', title: L('Visão geral da plataforma', 'Platform overview', 'Visión general de la plataforma') },
        { id: '1cOCg0zl3KLmkhE73CdNGTVmY0qI_19Gr', title: L('Configurações da sua conta', 'Your account settings', 'Configuración de tu cuenta') },
        { id: '14JX3vzeN6Mem5hwBp4LHfgj6ZOLThYD6', title: L('Avisos e lembretes', 'Alerts and reminders', 'Avisos y recordatorios') },
      ],
    },
    {
      key: 'leads',
      icon: '🎯',
      title: L('Trabalhando seus leads', 'Working your leads', 'Trabajando tus leads'),
      desc: L(
        'Da chegada do lead ao acompanhamento da sua performance.',
        'From the moment the lead arrives to tracking your performance.',
        'Desde la llegada del lead hasta el seguimiento de tu performance.',
      ),
      videos: [
        { id: '1Gc_4Dv14PS8VXLS1CDrY-mW-UgnpbasR', title: L('Meus Leads — sua carteira', 'My Leads — your book of business', 'Mis Leads — tu cartera') },
        { id: '1vgTxq02tH2OQ3vrHanQ76bNhWKtR6eNL', title: L('Pipeline — o quadro de vendas', 'Pipeline — the sales board', 'Pipeline — el tablero de ventas') },
        { id: '1OzJS_eILIuyNPyXc2ksVTy8H_mFHLlTT', title: L('Leads dentro da pipeline', 'Leads inside the pipeline', 'Leads dentro del pipeline') },
        { id: '1mQBJcAOKiW4b2oUQuc5W0uc0cOdtd8LK', title: L('Performance — seus números', 'Performance — your numbers', 'Performance — tus números') },
      ],
    },
    {
      key: 'conversas',
      icon: '💬',
      title: L('Conversas & follow-up', 'Conversations & follow-up', 'Conversaciones & follow-up'),
      desc: L(
        'Fale com o lead na hora certa — é aqui que a venda acontece.',
        'Talk to the lead at the right time — this is where the sale happens.',
        'Habla con el lead en el momento justo — aquí es donde pasa la venta.',
      ),
      videos: [
        { id: '1AFNo3Rnt5KFcQbAQ6m-BQLc5G3BWEDCC', title: L('Conversas e WhatsApp', 'Conversations and WhatsApp', 'Conversaciones y WhatsApp') },
        { id: '1M9PUE602Y7wGFkaaS37aKZTnE6yNb_OB', title: L('Templates de mensagem', 'Message templates', 'Plantillas de mensaje') },
        { id: '1xWVTCcnkmMFcPPhUXMzvdD95GEtpxSLh', title: L('Follow-ups que fecham', 'Follow-ups that close deals', 'Follow-ups que cierran ventas') },
        { id: '1Idm4qXK0QQIrLk3eQdHj1ffSUpYVHu8Y', title: L('Appointments — agendamentos', 'Appointments — scheduling', 'Appointments — citas') },
      ],
    },
    {
      key: 'automacao',
      icon: '⚡',
      title: L('Automação & IA', 'Automation & AI', 'Automatización & IA'),
      desc: L(
        'Coloque a plataforma pra trabalhar por você.',
        'Put the platform to work for you.',
        'Pon la plataforma a trabajar por ti.',
      ),
      videos: [
        { id: '1bYS7NFiY3lVfdIVvTbb6wOelPnNx7xbU', title: L('Automações', 'Automations', 'Automatizaciones') },
        { id: '1kez3uxx8TmNXferItOcr53vvglgYC59A', title: L('Sequences — cadências automáticas', 'Sequences — automatic cadences', 'Sequences — cadencias automáticas') },
        { id: '19Nsna-8duFQcGJsXkhy3anHSCGZfGf0m', title: L('Especialista de IA', 'AI Specialist', 'Especialista de IA') },
      ],
    },
    {
      key: 'recursos',
      icon: '🧰',
      title: L('Recursos extras', 'Extra resources', 'Recursos extra'),
      desc: L(
        'Ferramentas que completam o seu dia a dia.',
        'Tools that round out your day-to-day.',
        'Herramientas que completan tu día a día.',
      ),
      videos: [
        { id: '1jTNayhMlGZKnGnt1nnytJIJmIZmDHoFm', title: L('Anexos e formulários', 'Attachments and forms', 'Adjuntos y formularios') },
        { id: '1xsdLRpj46NmLxXVcytSoMsV6sPOJyljt', title: L('Notas', 'Notes', 'Notas') },
        { id: '1RcszYTriWQ_j5wjSknZffI44pgpJ5r77', title: L('Comunidade Lead4Pro', 'Lead4Pro Community', 'Comunidad Lead4Pro') },
        // Aula 'Indicações — ganhe créditos' REMOVIDA em 2026-07-30: ensinava a regra antiga
        // ($25 mensal / $100 anual, sem carência e sem uso do crédito). O programa mudou
        // (10% CRM / 5% leads, carência 14d, desconto até 50%). Regravar antes de repor —
        // vídeo antigo era: 1sQlCCHx_Ype4kwTc_dRsvCYzg8bHkudz
      ],
    },
  ]
}

/** Retrocompatível: módulos em PT (default). Prefira getTrainingModules(locale). */
export const TRAINING_MODULES: TrainingModule[] = getTrainingModules()
