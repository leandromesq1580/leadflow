import React from 'react'
import { createRoot } from 'react-dom/client'
import SequencesPage from '../src/app/dashboard/sequences/page'
import { I18nProvider } from '../src/lib/i18n-client'

// Deliberately ignore AbortSignal in this fixture transport to prove stale responses
// cannot win even when the network adapter cannot cancel an in-flight request.
const nativeFetch = window.fetch.bind(window)
window.fetch = (input, init) => nativeFetch(input, { ...init, signal: undefined })

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><I18nProvider locale="pt"><main style={{ padding: 24 }}><SequencesPage /></main></I18nProvider></React.StrictMode>,
)
