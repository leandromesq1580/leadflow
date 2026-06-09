import type { Metadata, Viewport } from 'next'
import WDTSite from '@/components/wdt/WDTSite'
import { content } from '@/components/wdt/content'

export const metadata: Metadata = {
  title: 'WDT USA GROUP — Technology into Capital. Since 2006.',
  description:
    "We're not an AI company. We're a business company — that uses AI. Over two decades turning technology into capital: systems, automation, intelligent agents, operations and scale.",
  icons: {
    icon: [
      { url: '/wdt/wdt-icon-mockup.jpg', type: 'image/png' },
    ],
    apple: '/wdt/wdt-icon-mockup.jpg',
  },
  openGraph: {
    title: 'WDT USA GROUP — Technology into Capital',
    description: 'Over two decades turning technology into capital.',
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

export default function WdtPageEn() {
  return <WDTSite t={content.en} locale="en" />
}
