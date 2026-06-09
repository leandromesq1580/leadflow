import { Cinzel, Playfair_Display } from 'next/font/google'

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-cinzel',
  display: 'swap',
})

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
  display: 'swap',
})

export default function WdtGroupLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${cinzel.variable} ${playfair.variable}`}>{children}</div>
}
