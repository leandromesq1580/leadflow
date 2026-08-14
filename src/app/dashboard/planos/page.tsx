import { PolicyCheck } from '@/components/policy-check'
import { CrmPlansGrid } from './crm-plans-grid'
import { getLocale } from '@/lib/locale'

export async function generateMetadata() {
  const locale = await getLocale()
  const title = locale === 'en' ? 'CRM Pro Plans — Lead4Producers' : locale === 'es' ? 'Planes CRM Pro — Lead4Producers' : 'Planos CRM Pro — Lead4Producers'
  return { title }
}

export default async function PlanosPage() {
  const locale = await getLocale()
  const L = (pt: string, en: string, es: string) => locale === 'en' ? en : locale === 'es' ? es : pt
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8 text-center">
        <h1 className="text-[26px] font-extrabold" style={{ color: 'var(--fg)' }}>{L('Escolha seu plano CRM Pro', 'Choose your CRM Pro plan', 'Elige tu plan CRM Pro')}</h1>
        <p className="text-[14px] mt-2 max-w-2xl mx-auto" style={{ color: 'var(--fg-secondary)' }}>
          {L(
            'Quanto mais longo o compromisso, menor o valor por mês. Todos incluem o CRM Pro completo. Pagamento à vista, renovação automática — cancele quando quiser.',
            'The longer the commitment, the lower your monthly price. All plans include the full CRM Pro. Paid upfront, auto-renews — cancel anytime.',
            'Mientras más largo el compromiso, menor el precio por mes. Todos incluyen el CRM Pro completo. Pago por adelantado, renovación automática — cancela cuando quieras.'
          )}
        </p>
      </div>
      <PolicyCheck context="checkout_crm" />
      <CrmPlansGrid />
    </div>
  )
}
