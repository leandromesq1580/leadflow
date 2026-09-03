export function SalesTeamPriceNotice({ cents, locale }: { cents: number; locale: string }) {
  const L = (pt: string, en: string, es: string) => locale === 'en' ? en : locale === 'es' ? es : pt
  return <div className="rounded-xl p-4 mb-4" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46' }}>
    <p className="text-[14px] font-bold">{L('Preço exclusivo da equipe', 'Exclusive team pricing', 'Precio exclusivo del equipo')} · US${(cents / 100).toFixed(2)}/lead</p>
    <p className="text-[12px] mt-1">{L(
      'Seu benefício já está aplicado nos pacotes de leads exclusivos. Não precisa de cupom. CRM e leads frios mantêm os preços normais.',
      'Your benefit is already included in exclusive lead packages. No coupon needed. CRM and cold leads keep their regular prices.',
      'Tu beneficio ya está aplicado a los paquetes de leads exclusivos. No necesitas cupón. CRM y leads fríos mantienen sus precios habituales.',
    )}</p>
  </div>
}
