import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Proxy (Next.js 16 — renamed from middleware) handles cross-domain
// routing for the WDT GROUP institutional site:
//
//   1. On the canonical domain wdtusa.group, internally rewrite the
//      root paths to the existing /wdtgroup routes so visitors see
//      the WDT site at https://wdtusa.group/ instead of
//      https://wdtusa.group/wdtgroup.
//
//   2. On the legacy host lead4producers.com, issue 301 redirects
//      from /wdtgroup (and locales) to the new domain.

const WDT_HOSTS = new Set([
  'wdtusa.group',
  'www.wdtusa.group',
])

const LEGACY_HOSTS = new Set([
  'lead4producers.com',
  'www.lead4producers.com',
])

const LOCALE_SEGMENTS = new Set(['en', 'es'])

export function proxy(request: NextRequest) {
  const host = (request.headers.get('host') || '').toLowerCase()
  const { pathname, search } = request.nextUrl

  // ─────────────────────────────────────────────────────────────
  // 1) wdtusa.group — rewrite "/" → "/wdtgroup" (transparent)
  // ─────────────────────────────────────────────────────────────
  if (WDT_HOSTS.has(host)) {
    // Already targeting /wdtgroup — leave it alone.
    if (pathname === '/wdtgroup' || pathname.startsWith('/wdtgroup/')) {
      return NextResponse.next()
    }

    // Root → PT-BR page.
    if (pathname === '/' || pathname === '') {
      const url = request.nextUrl.clone()
      url.pathname = '/wdtgroup'
      return NextResponse.rewrite(url)
    }

    // Locale shortcut: /en, /en/, /es, /es/ → /wdtgroup/<locale>
    const segments = pathname.split('/').filter(Boolean)
    if (segments.length === 1 && LOCALE_SEGMENTS.has(segments[0])) {
      const url = request.nextUrl.clone()
      url.pathname = `/wdtgroup/${segments[0]}`
      return NextResponse.rewrite(url)
    }

    // Everything else on this host falls through unchanged
    // (lets Next.js handle assets, _next, favicon, etc.).
    return NextResponse.next()
  }

  // ─────────────────────────────────────────────────────────────
  // 2) lead4producers.com/wdtgroup* → 301 → wdtusa.group/*
  // ─────────────────────────────────────────────────────────────
  if (
    LEGACY_HOSTS.has(host) &&
    (pathname === '/wdtgroup' || pathname.startsWith('/wdtgroup/'))
  ) {
    // Strip the /wdtgroup prefix; keep locale or any trailing path.
    const rest = pathname.replace(/^\/wdtgroup/, '') || '/'
    const target = new URL(`https://wdtusa.group${rest}${search}`)
    return NextResponse.redirect(target, 301)
  }

  return NextResponse.next()
}

export const config = {
  // Match all paths except Next.js internals and common static files,
  // so the proxy is cheap and never intercepts asset delivery.
  matcher: [
    '/((?!_next/static|_next/image|_next/data|api|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)',
  ],
}
