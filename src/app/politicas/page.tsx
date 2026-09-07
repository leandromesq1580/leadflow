import type { Metadata } from 'next'
import { LocalizedPolicyPage, policyCopy } from '@/components/localized-policy-page'
import { getLocale } from '@/lib/locale'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return { title: `${policyCopy(locale).title} — Lead4Pro` }
}

export default function PoliciesPage() {
  return <LocalizedPolicyPage />
}
