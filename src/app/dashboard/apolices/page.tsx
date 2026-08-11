import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { PoliciesClient } from './policies-client'
import { acessoApolices } from '@/lib/policies-access'
import { getLocale } from '@/lib/locale'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const locale = await getLocale()
  const title = locale === 'en' ? 'Policy Management — Lead4Pro' : locale === 'es' ? 'Gestión de Pólizas — Lead4Pro' : 'Gestão de Apólices — Lead4Pro'
  return { title }
}

/** Pós-venda: gestão das apólices vendidas (buckets de ação, pendências e risco). */
export default async function ApolicesPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers').select('id').eq('auth_user_id', user.id).single()
  if (!buyer) redirect('/login')
  // quem não foi liberado (nem conectou a própria seguradora) não entra nem pela URL
  const acesso = await acessoApolices(db, buyer.id)
  if (!acesso.pode) redirect('/dashboard')
  return <PoliciesClient buyerId={acesso.bookDe} />
}
