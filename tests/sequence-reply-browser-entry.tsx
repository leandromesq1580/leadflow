import React from 'react'
import { createRoot } from 'react-dom/client'
import SequencesPage from '../src/app/dashboard/sequences/page'
import { I18nProvider } from '../src/lib/i18n-client'
const locale = new URLSearchParams(location.search).get('locale')
createRoot(document.getElementById('root')!).render(
 <React.StrictMode><I18nProvider locale={locale === 'en' || locale === 'es' ? locale : 'pt'}><main style={{padding:16}}><SequencesPage/></main></I18nProvider></React.StrictMode>,
)
