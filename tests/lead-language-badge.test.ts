import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ModuleKind, JsxEmit, transpileModule } from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as jsx from 'react/jsx-runtime'
import * as language from '../src/lib/lead-message-locale'

test('lead badges show Brazil/Spain flags beside readable language names', () => {
  const code = transpileModule(readFileSync(new URL('../src/components/lead-language-badge.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX },
  }).outputText
  for (const ui of ['pt', 'es', 'en']) {
    const module = { exports: {} as any }
    const dependencies: Record<string, any> = {
      'react/jsx-runtime': jsx,
      '@/lib/i18n-client': { useT: () => ({ _locale: ui }) },
      '@/lib/lead-message-locale': language,
    }
    new Function('require', 'module', 'exports', code)((name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`)
      return dependencies[name]
    }, module, module.exports)
    for (const [locale, flag] of [['pt', '🇧🇷'], ['es', '🇪🇸'], ['en', '🌐'], [null, '🌐']] as const) {
      const html = renderToStaticMarkup(createElement(module.exports.LeadLanguageBadge, { lead: { lead_language: locale } }))
      assert.ok(html.includes(flag))
      assert.ok(html.includes(language.leadMessageLanguageLabel(locale, ui)))
      assert.ok(html.includes(`data-lead-language="${locale || 'unknown'}"`))
      assert.ok(html.includes('aria-hidden="true"'), 'Readable language label remains accessible')
    }
  }
})
