import { RoteiroClient } from './roteiro-client'
import { getLocale } from '@/lib/locale'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const locale = await getLocale()
  const title = locale === 'en' ? 'Call Script — Lead4Pro' : locale === 'es' ? 'Guion de Llamada — Lead4Pro' : 'Roteiro de Ligação — Lead4Pro'
  return { title }
}

/** Editor do roteiro de venda + opt-in do apoio durante a ligação (Fase 1). */
export default function RoteiroPage() {
  return <RoteiroClient />
}
