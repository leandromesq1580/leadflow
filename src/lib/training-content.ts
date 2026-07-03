/**
 * 🎓 Conteúdo do Treinamento — curso organizado por TEMAS (módulos), em ordem de trilha.
 * Cada vídeo: id = fileId do Google Drive (pasta "Vídeos Plataforma", link liberado), title = nome limpo da aula.
 * Vídeo novo na pasta que ainda não estiver aqui aparece sozinho na seção "Novas aulas".
 */

export type TrainingVideo = { id: string; title: string }
export type TrainingModule = { key: string; icon: string; title: string; desc: string; videos: TrainingVideo[] }

export const TRAINING_MODULES: TrainingModule[] = [
  {
    key: 'primeiros-passos',
    icon: '🚀',
    title: 'Primeiros passos',
    desc: 'Conheça o painel e deixe sua conta redonda antes de atacar os leads.',
    videos: [
      { id: '1ItLCqmg3g9tppkFNEfiwdhmdVT9nA60c', title: 'Visão geral da plataforma' },
      { id: '1cOCg0zl3KLmkhE73CdNGTVmY0qI_19Gr', title: 'Configurações da sua conta' },
      { id: '14JX3vzeN6Mem5hwBp4LHfgj6ZOLThYD6', title: 'Avisos e lembretes' },
    ],
  },
  {
    key: 'leads',
    icon: '🎯',
    title: 'Trabalhando seus leads',
    desc: 'Da chegada do lead ao acompanhamento da sua performance.',
    videos: [
      { id: '1Gc_4Dv14PS8VXLS1CDrY-mW-UgnpbasR', title: 'Meus Leads — sua carteira' },
      { id: '1vgTxq02tH2OQ3vrHanQ76bNhWKtR6eNL', title: 'Pipeline — o quadro de vendas' },
      { id: '1OzJS_eILIuyNPyXc2ksVTy8H_mFHLlTT', title: 'Leads dentro da pipeline' },
      { id: '1mQBJcAOKiW4b2oUQuc5W0uc0cOdtd8LK', title: 'Performance — seus números' },
    ],
  },
  {
    key: 'conversas',
    icon: '💬',
    title: 'Conversas & follow-up',
    desc: 'Fale com o lead na hora certa — é aqui que a venda acontece.',
    videos: [
      { id: '1AFNo3Rnt5KFcQbAQ6m-BQLc5G3BWEDCC', title: 'Conversas e WhatsApp' },
      { id: '1M9PUE602Y7wGFkaaS37aKZTnE6yNb_OB', title: 'Templates de mensagem' },
      { id: '1xWVTCcnkmMFcPPhUXMzvdD95GEtpxSLh', title: 'Follow-ups que fecham' },
      { id: '1Idm4qXK0QQIrLk3eQdHj1ffSUpYVHu8Y', title: 'Appointments — agendamentos' },
    ],
  },
  {
    key: 'automacao',
    icon: '⚡',
    title: 'Automação & IA',
    desc: 'Coloque a plataforma pra trabalhar por você.',
    videos: [
      { id: '1bYS7NFiY3lVfdIVvTbb6wOelPnNx7xbU', title: 'Automações' },
      { id: '1kez3uxx8TmNXferItOcr53vvglgYC59A', title: 'Sequences — cadências automáticas' },
      { id: '19Nsna-8duFQcGJsXkhy3anHSCGZfGf0m', title: 'Especialista de IA' },
    ],
  },
  {
    key: 'recursos',
    icon: '🧰',
    title: 'Recursos extras',
    desc: 'Ferramentas que completam o seu dia a dia.',
    videos: [
      { id: '1jTNayhMlGZKnGnt1nnytJIJmIZmDHoFm', title: 'Anexos e formulários' },
      { id: '1xsdLRpj46NmLxXVcytSoMsV6sPOJyljt', title: 'Notas' },
      { id: '1RcszYTriWQ_j5wjSknZffI44pgpJ5r77', title: 'Comunidade Lead4Pro' },
      { id: '1sQlCCHx_Ype4kwTc_dRsvCYzg8bHkudz', title: 'Indicações — ganhe créditos' },
    ],
  },
]
