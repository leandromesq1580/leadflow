import type { Metadata, Viewport } from 'next'
import WDTSite from '@/components/wdt/WDTSite'
import { content } from '@/components/wdt/content'

export const metadata: Metadata = {
  title: 'WDT USA GROUP — Technology into Capital. Desde 2006.',
  description:
    'Não somos uma empresa de IA. Somos uma empresa de negócios — que usa IA. Mais de duas décadas transformando tecnologia em capital: sistemas, automação, agentes inteligentes, operação e escala.',
  icons: {
    icon: [
      { url: '/wdt/wdt-icon-mockup.jpg', type: 'image/png' },
    ],
    apple: '/wdt/wdt-icon-mockup.jpg',
  },
  openGraph: {
    title: 'WDT USA GROUP — Technology into Capital',
    description: 'Mais de duas décadas transformando tecnologia em capital.',
    images: ['/wdt/wdt-logo-mockup@4x.png'],
    type: 'website',
  },
  alternates: {
    languages: {
      'pt-BR': '/wdtgroup',
      'en': '/wdtgroup/en',
      'es': '/wdtgroup/es',
    },
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0D0D0D',
}

export default function WdtPage() {
  return <WDTSite t={content.pt} locale="pt" />
}
