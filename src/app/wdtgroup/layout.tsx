// Fontes embutidas (28/09/2026) — next/font/google quebrava o build (vercel/next.js#99114).
import localFont from 'next/font/local'

const cinzel = localFont({
  src: '../../fonts/cinzel-latin.woff2',
  weight: '400 900',
  variable: '--font-cinzel',
  display: 'swap',
  fallback: ['Georgia', 'serif'],
  adjustFontFallback: 'Times New Roman',
})

const playfair = localFont({
  src: [
    { path: '../../fonts/playfair-display-latin.woff2', weight: '400 900', style: 'normal' },
    { path: '../../fonts/playfair-display-italic-latin.woff2', weight: '400 900', style: 'italic' },
  ],
  variable: '--font-playfair',
  display: 'swap',
  fallback: ['Georgia', 'serif'],
  adjustFontFallback: 'Times New Roman',
})

export default function WdtGroupLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${cinzel.variable} ${playfair.variable}`}>{children}</div>
}
