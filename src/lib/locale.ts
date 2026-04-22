import { cookies, headers } from 'next/headers'
import { DEFAULT_LOCALE, LOCALES, type Locale } from './i18n'

const COOKIE_NAME = 'NEXT_LOCALE'

/** Le o locale ativo do cookie (server-side). Fallback: Accept-Language do browser. */
export async function getLocale(): Promise<Locale> {
  const store = await cookies()
  const fromCookie = store.get(COOKIE_NAME)?.value as Locale | undefined
  if (fromCookie && LOCALES.includes(fromCookie)) return fromCookie

  try {
    const h = await headers()
    const accept = h.get('accept-language') || ''
    const first = accept.toLowerCase().split(',')[0].split('-')[0].trim() as Locale
    if (LOCALES.includes(first as Locale)) return first as Locale
  } catch {}

  return DEFAULT_LOCALE
}

export const LOCALE_COOKIE = COOKIE_NAME
