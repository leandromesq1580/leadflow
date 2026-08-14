'use client'

/**
 * CTA "Comprar" dos PACOTES na landing. Em vez de abrir o WhatsApp, agora:
 *  1) dispara o evento `Lead` no Meta Pixel (a campanha otimiza por ele — mantido),
 *  2) guarda o pacote escolhido em localStorage (`l4p_buy`),
 *  3) manda pro cadastro.
 * Depois que a pessoa loga (pós onboarding / confirmação de email), o
 * <ResumeCheckout/> montado no dashboard retoma e abre o checkout do Stripe
 * daquele pacote automaticamente.
 */
interface Props {
  packageId: string
  label: string
  block?: boolean
}

export function BuyCheckoutCta({ packageId, label, block }: Props) {
  function go() {
    try { (window as unknown as { fbq?: (a: string, b: string) => void }).fbq?.('track', 'Lead') } catch {}
    try { localStorage.setItem('l4p_buy', packageId) } catch {}
    window.location.href = '/register'
  }
  return (
    <button
      onClick={go}
      className={`${block ? 'flex w-full' : 'inline-flex'} items-center justify-center gap-2 rounded-xl font-bold text-white text-center px-6 py-2.5 text-[13px]`}
      style={{ background: 'linear-gradient(135deg, var(--accent), #8b5cf6)', boxShadow: '0 4px 20px rgba(124,58,237,0.35)' }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
      {label}
    </button>
  )
}
