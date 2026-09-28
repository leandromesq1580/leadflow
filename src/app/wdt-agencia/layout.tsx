import type { Metadata, Viewport } from 'next'
// Fontes embutidas (28/09/2026) — next/font/google quebrava o build (vercel/next.js#99114).
import localFont from 'next/font/local'

const inter = localFont({
  src: '../../fonts/inter-latin.woff2',
  weight: '100 900',
  variable: '--font-inter',
  display: 'swap',
  fallback: ['system-ui', 'arial'],
})

const mono = localFont({
  src: '../../fonts/jetbrains-mono-latin.woff2',
  weight: '100 800',
  variable: '--font-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'monospace'],
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

export const metadata: Metadata = {
  title: 'WDT Agência Digital — Inteligência que faz negócio acontecer',
  description:
    'Agência digital do WDT Group. Sistemas, IA, automação e marketing — feitos por quem desenvolve há 20+ anos. Para empresas que cansaram de assistir de camarote.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0A0A0A',
}

export default function WdtAgenciaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable} ${mono.variable} ${playfair.variable}`}>
      {children}
    </div>
  )
}
