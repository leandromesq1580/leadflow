import { NotasBoard } from './notas-board'
import { getLocale } from '@/lib/locale'

export async function generateMetadata() {
  const locale = await getLocale()
  const title = locale === 'en' ? 'Notes & Checklists — Lead4Pro' : 'Notas & Checklists — Lead4Pro'
  return { title }
}

export default async function NotasPage() {
  const locale = await getLocale()
  const L = (pt: string, en: string, es: string) => locale === 'en' ? en : locale === 'es' ? es : pt
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-[24px] font-extrabold" style={{ color: '#0f172a' }}>🗒️ {L('Notas & Checklists', 'Notes & Checklists', 'Notas & Checklists')}</h1>
        <p className="text-[13px] mt-1 max-w-2xl" style={{ color: '#64748b' }}>
          {L(
            'Acompanhe o progresso de licença de cada pessoa — crie um bloco por pessoa, marque as etapas, adicione/remova itens e anote o que precisar. Salva sozinho.',
            'Track each person\'s license progress — create one block per person, check off the steps, add/remove items and jot down whatever you need. Saves automatically.',
            'Sigue el progreso de licencia de cada persona — crea un bloque por persona, marca las etapas, agrega/quita ítems y anota lo que necesites. Se guarda solo.',
          )}
        </p>
      </div>
      <NotasBoard />
    </div>
  )
}
