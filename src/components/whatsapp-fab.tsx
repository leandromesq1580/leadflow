interface Props {
  phone: string // sem +, ex: '17867442126'
  message?: string
  label?: string
}

/**
 * Floating Action Button — WhatsApp.
 * Botao fixo no canto inferior direito que abre WhatsApp no numero indicado.
 * Server component (sem useState/effects).
 */
export function WhatsAppFab({ phone, message = 'Olá! Gostaria de saber mais sobre o Lead4Pro.', label = 'Fale Conosco!' }: Props) {
  const cleanPhone = phone.replace(/\D/g, '')
  const href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`WhatsApp — ${label}`}
      className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-[60] flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-2.5 sm:py-3 rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-transform group"
      style={{
        background: '#25D366',
        color: '#fff',
        boxShadow: '0 10px 30px rgba(37,211,102,0.45), 0 0 0 4px rgba(37,211,102,0.15)',
        textDecoration: 'none',
      }}
    >
      <span
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background: 'rgba(37,211,102,0.35)',
          animation: 'wa-pulse 2s ease-out infinite',
        }}
      />
      <svg
        viewBox="0 0 32 32"
        className="w-6 h-6 sm:w-7 sm:h-7 relative"
        fill="currentColor"
        aria-hidden
      >
        <path d="M16.003 0C7.171 0 .005 7.16.005 15.987c0 2.818.738 5.567 2.14 7.992L0 32l8.265-2.164a15.96 15.96 0 0 0 7.738 1.972h.007C24.84 31.808 32 24.648 32 15.82 32 11.535 30.337 7.514 27.31 4.488A15.86 15.86 0 0 0 16.003 0Zm0 29.13h-.006a13.27 13.27 0 0 1-6.762-1.852l-.485-.288-5.024 1.318 1.344-4.9-.317-.503a13.21 13.21 0 0 1-2.025-7.018c0-7.31 5.953-13.26 13.275-13.26 3.544 0 6.876 1.382 9.382 3.89a13.18 13.18 0 0 1 3.882 9.378c.001 7.31-5.953 13.235-13.264 13.235Zm7.275-9.917c-.398-.2-2.36-1.165-2.726-1.298-.365-.133-.631-.2-.897.2-.266.398-1.03 1.297-1.262 1.563-.232.266-.465.3-.864.1-.398-.2-1.685-.62-3.21-1.98-1.187-1.06-1.99-2.37-2.22-2.768-.232-.398-.025-.614.174-.812.18-.179.398-.465.598-.698.2-.232.266-.398.4-.664.132-.266.066-.499-.033-.698-.1-.2-.897-2.165-1.229-2.964-.323-.778-.652-.672-.897-.685a16.85 16.85 0 0 0-.764-.014c-.266 0-.698.1-1.064.499-.365.398-1.396 1.364-1.396 3.328 0 1.965 1.43 3.864 1.628 4.13.2.266 2.81 4.29 6.81 6.018.951.41 1.694.654 2.273.838.955.305 1.823.262 2.51.16.766-.115 2.36-.964 2.692-1.895.332-.93.332-1.728.232-1.895-.1-.166-.365-.266-.764-.465Z"/>
      </svg>
      <span className="text-[13px] sm:text-[14px] font-bold whitespace-nowrap relative">{label}</span>

      <style>{`
        @keyframes wa-pulse {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.35); opacity: 0; }
        }
      `}</style>
    </a>
  )
}
