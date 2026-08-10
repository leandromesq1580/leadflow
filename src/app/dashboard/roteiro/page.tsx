import { RoteiroClient } from './roteiro-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Roteiro de Ligação — Lead4Pro' }

/** Editor do roteiro de venda + opt-in do apoio durante a ligação (Fase 1). */
export default function RoteiroPage() {
  return <RoteiroClient />
}
