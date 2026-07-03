/**
 * 🎓 Conteúdo do Treinamento — curso organizado por TEMAS (módulos).
 * Cada vídeo: id = fileId do Google Drive (arquivo com link liberado), title = nome limpo da aula.
 * Pra adicionar aula: solta o vídeo na pasta do Drive e inclui aqui no módulo certo.
 */

export type TrainingVideo = { id: string; title: string }
export type TrainingModule = { key: string; icon: string; title: string; desc: string; videos: TrainingVideo[] }

export const TRAINING_MODULES: TrainingModule[] = [
  // Preenchido a partir da pasta do Drive (aguardando acesso à lista de vídeos).
  // Exemplo do formato:
  // {
  //   key: 'primeiros-passos', icon: '🚀', title: 'Primeiros passos',
  //   desc: 'Do login ao primeiro lead: o essencial pra começar.',
  //   videos: [
  //     { id: '1AbC...', title: 'Conhecendo o painel' },
  //     { id: '1DeF...', title: 'Recebendo seu primeiro lead' },
  //   ],
  // },
]
