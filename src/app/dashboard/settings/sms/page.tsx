import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SmsForm } from './sms-form'
import { getLocale } from '@/lib/locale'

export const dynamic = 'force-dynamic'

export default async function SmsSettingsPage() {
  const locale = await getLocale()
  const L = (pt: string, en: string, es: string) => locale === 'en' ? en : locale === 'es' ? es : pt
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return (
    <div className="max-w-3xl">
      <h1 className="text-[24px] font-extrabold mb-1" style={{ color: 'var(--fg)' }}>📱 {L('SMS pós-ligação', 'Post-call SMS', 'SMS tras la llamada')}</h1>
      <p className="text-[14px] mb-8" style={{ color: 'var(--fg-secondary)' }}>
        {L('O que o sistema manda ao lead quando você liga e ele não atende. Você escolhe o texto, e pode não enviar em ligações específicas.',
           'What the system sends the lead when you call and they do not answer. You pick the text, and can skip it on specific calls.',
           'Lo que el sistema envía al lead cuando llamas y no contesta. Tú eliges el texto y puedes omitirlo en llamadas específicas.')}
      </p>
      <SmsForm />
    </div>
  )
}
