import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transpileModule, ModuleKind, JsxEmit } from 'typescript'

const mod = { exports: {} as { ReplyBadges: ComponentType<{sms?: number; whatsapp?: number}> } }
const code = transpileModule(readFileSync('src/components/reply-badges.tsx', 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText
new Function('require', 'module', 'exports', code)(createRequire(import.meta.url), mod, mod.exports)

test('real React badge renders green SMS label separately from red WhatsApp', () => {
  const html = renderToStaticMarkup(createElement(mod.exports.ReplyBadges, {sms: 2, whatsapp: 1}))
  assert.match(html, /aria-label="SMS: 2"/)
  assert.match(html, /aria-label="WhatsApp: 1"/)
  assert.match(html, /background:#15803d/)
  assert.match(html, /background:#dc2626/)
  assert.match(html, /SMS 2/)
})
test('zero unread has no SMS badge; visual count caps without losing accessible count', () => {
  const empty = renderToStaticMarkup(createElement(mod.exports.ReplyBadges))
  assert.doesNotMatch(empty, /aria-label=/)
  const many = renderToStaticMarkup(createElement(mod.exports.ReplyBadges, {sms: 120}))
  assert.match(many, /SMS 99\+/)
  assert.match(many, /aria-label="SMS: 120"/)
})
