import { PolicyCheck } from '@/components/policy-check'
import { CrmPlansGrid } from './crm-plans-grid'

export const metadata = { title: 'Planos CRM Pro — Lead4Producers' }

export default function PlanosPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8 text-center">
        <h1 className="text-[26px] font-extrabold" style={{ color: '#1a1a2e' }}>Escolha seu plano CRM Pro</h1>
        <p className="text-[14px] mt-2 max-w-2xl mx-auto" style={{ color: '#64748b' }}>
          Quanto mais longo o compromisso, menor o valor por mês. Todos incluem o CRM Pro completo.
          Pagamento à vista, renovação automática — cancele quando quiser.
        </p>
      </div>
      <PolicyCheck context="checkout_crm" />
      <CrmPlansGrid />
    </div>
  )
}
