import { NotasBoard } from './notas-board'

export const metadata = { title: 'Notas & Checklists — Lead4Pro' }

export default function NotasPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-[24px] font-extrabold" style={{ color: '#0f172a' }}>🗒️ Notas &amp; Checklists</h1>
        <p className="text-[13px] mt-1 max-w-2xl" style={{ color: '#64748b' }}>
          Acompanhe o progresso de licença de cada pessoa — crie um bloco por pessoa, marque as etapas,
          adicione/remova itens e anote o que precisar. Salva sozinho.
        </p>
      </div>
      <NotasBoard />
    </div>
  )
}
