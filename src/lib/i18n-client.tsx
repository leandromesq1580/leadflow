'use client'

import { createContext, useContext, ReactNode } from 'react'
import { messages, type Locale, type Messages, DEFAULT_LOCALE } from './i18n'

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

/** Hook pra client components — retorna o objeto de traducoes + locale atual */
export function useT(): Messages & { _locale: Locale } {
  const locale = useContext(LocaleContext)
  const t = (messages[locale] || messages[DEFAULT_LOCALE]) as unknown as Messages
  return Object.assign({ _locale: locale } as { _locale: Locale }, t) as Messages & { _locale: Locale }
}

/** So retorna o locale ativo */
export function useLocale(): Locale {
  return useContext(LocaleContext)
}
