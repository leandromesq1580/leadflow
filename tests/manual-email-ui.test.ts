import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { createElement, act } from 'react'
import { readFileSync } from 'node:fs'

const leadId = '00000000-0000-4000-8000-000000000001'

test('composer selects own leads, previews safely, requires confirmation and preserves request key on retry', async t => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://example.invalid' })
  const originals = new Map<string, PropertyDescriptor | undefined>()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  const { createRoot } = await import('react-dom/client')
  const { ManualEmailComposer } = await import('../src/components/manual-email-composer')
  const host = dom.window.document.getElementById('root')!
  const root = createRoot(host)
  t.after(async () => {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [key, value] of originals) { if (value) Object.defineProperty(globalThis, key, value); else Reflect.deleteProperty(globalThis, key) }
  })
  const calls: Record<string, unknown>[] = []
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, init?: RequestInit) => {
    assert.ok(init?.signal, 'browser request must have a timeout and remain safely retryable')
    const payload = JSON.parse(String(init?.body)); calls.push(payload)
    if (payload.preview) return Response.json({ preview: true, previewHash: 'mock-hash', subject: payload.subject, body: payload.body, footer: 'Postal address + link individual', from: 'mail@example.invalid', recipients: [{ leadId, name: 'Maria', email: 'maria@example.invalid', status: 'ready' }] })
    if (calls.length === 2) throw new Error('mock network failure')
    return Response.json({ results: [{ leadId, status: 'accepted' }], replayed: false })
  })
  await act(async () => root.render(createElement(ManualEmailComposer, { leads: [{ id: leadId, name: 'Maria', email: 'maria@example.invalid' }] })))
  const click = async (selector: string) => { const el = host.querySelector<HTMLElement>(selector); assert.ok(el, selector); await act(async () => el.click()) }
  await click('button[data-action="open-email"]')
  await click('input[data-lead-id]')
  const fill = async (selector: string, value: string) => {
    const el = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!
    const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype
    await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
  }
  await fill('input[name="subject"]', 'Contato')
  await fill('textarea[name="body"]', '<img src=x onerror=alert(1)>')
  await click('button[data-action="preview"]')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].buyer_id, undefined)
  assert.deepEqual(calls[0].leadIds, [leadId])
  assert.equal(host.querySelector('img'), null, 'preview must render text, never HTML')
  assert.ok(host.querySelector<HTMLButtonElement>('button[data-action="send"]')!.disabled)
  await click('input[name="consent"]')
  await click('button[data-action="send"]')
  assert.equal(calls.length, 2)
  assert.match(host.textContent!, /mesmo identificador/i)
  assert.ok(host.querySelector<HTMLInputElement>('input[name="subject"]')!.disabled)
  await click('button[data-action="send"]')
  assert.equal(calls.length, 3)
  assert.equal(calls[1].requestId, calls[2].requestId)
  assert.equal(calls[1].consentConfirmed, true)
  assert.match(host.textContent!, /Aceito pelo provedor/)
  assert.match(host.textContent!, /não confirma entrega/i)
  assert.ok(host.querySelector<HTMLButtonElement>('button[data-action="send"]')!.disabled)
  assert.match(readFileSync(new URL('../src/app/dashboard/leads/leads-list.tsx', import.meta.url), 'utf8'), /<ManualEmailComposer leads=\{filtered\}/)
})
