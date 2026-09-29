// Local-only real React page harness. Network is blocked except this fixture server.
// Run: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/ai-sequence-browser.mjs
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

const root = process.cwd()
const output = path.join(process.env.TMPDIR || '/home/hermes/.hermes/profiles/lead4pro/cache/scratch', 'ai-sequence-ui-evidence')
await mkdir(output, { recursive: true })
await build({ entryPoints: ['tests/ai-sequence-browser-entry.tsx'], bundle: true, outfile: path.join(output, 'app.js'), platform: 'browser', jsx: 'automatic', alias: { '@': path.join(root, 'src') }, define: { 'process.env.NODE_ENV': '"development"' } })
const css = await postcss([tailwind({ base: root })]).process(await readFile('src/app/globals.css', 'utf8'), { from: path.join(root, 'src/app/globals.css') })
await writeFile(path.join(output, 'app.css'), css.css)
const fontCSS = '@font-face{font-family:GeistFixture;src:url(/geist.woff2) format("woff2");font-weight:100 900;font-display:swap}'
const html = '<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><style>' + fontCSS + '</style></head><body style="font-family:GeistFixture,Arial,sans-serif"><div id="root"></div><script src="/app.js"></script></body></html>'
const server = http.createServer(async (req, res) => {
  if (req.url === '/geist.woff2') { res.setHeader('Content-Type', 'font/woff2'); res.end(await readFile(path.join(root, 'src/fonts/geist-latin.woff2'))); return }
  if (req.url === '/app.js' || req.url === '/app.css') { res.setHeader('Content-Type', req.url.endsWith('css') ? 'text/css' : 'text/javascript'); res.end(await readFile(path.join(output, req.url.slice(1)))) }
  else { res.setHeader('Content-Type', 'text/html'); res.end(html) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const consoleErrors = []
  page.on('pageerror', error => consoleErrors.push(error.message))
  let previewMode = 'error'
  let previewPayload
  let savePayload
  let saveMode = 'error'
  let stored = []
  let previewCalls = 0
  let externalRequests = 0
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.hostname !== '127.0.0.1') { externalRequests++; return route.abort() }
    if (url.pathname === '/api/sequences/preview') {
      previewPayload = route.request().postDataJSON(); previewCalls++
      if (previewMode === 'slow') { await new Promise(resolve => setTimeout(resolve, 650)); return route.fulfill({ json: { body: 'FIXTURE ANTIGA — não deve aparecer' } }).catch(() => {}) }
      return route.fulfill(previewMode === 'error' ? { status: 503, json: { error: 'Modelo temporariamente indisponível. Tente novamente.' } } : { json: { body: 'Fixture local de teste. Quero ajudar você com sua proteção. Podemos combinar uma ligação?' } })
    }
    if (url.pathname === '/api/sequences') {
      if (route.request().method() === 'POST') { savePayload = route.request().postDataJSON(); if (saveMode === 'error') return route.fulfill({ status: 503, json: { error: 'Falha local simulada ao salvar. Tente novamente.' } }); stored = [{...savePayload, id:'fixture-sequence',enabled:false,sequence_steps:[]}]; return route.fulfill({json:{sequence:stored[0]}}) }
      return route.fulfill({ json: { buyer_id: 'fixture-buyer', sequences: stored, templates: [], pipelines: [] } })
    }
    return route.continue()
  })
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.getByRole('button', { name: '+ Nova sequência' }).click()
  await page.getByLabel('Modo', { exact: true }).selectOption('ai_until_reply')
  await page.screenshot({ path: path.join(output, 'desktop-message.png'), fullPage: true })
  assert.equal(await page.getByRole('dialog').count(), 1, 'accessible modal')
  await page.getByRole('tab', { name: 'Mensagem', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  assert.equal(await page.getByRole('tab', { name: 'Agenda de envio' }).getAttribute('aria-selected'), 'true', 'tabs support arrow-key navigation')
  await page.keyboard.press('ArrowLeft')
  assert.equal(await page.getByRole('tab', { name: 'Mensagem', exact: true }).getAttribute('aria-selected'), 'true')
  await page.getByLabel('Nome da sequência', { exact: true }).fill('Retomada de contato')
  const nameBox = await page.getByLabel('Nome da sequência', { exact: true }).boundingBox()
  const briefBox = await page.getByLabel('Brief da conversa', { exact: true }).boundingBox()
  assert.ok(nameBox.y < briefBox.y, 'name appears before AI settings')
  await page.getByLabel('Brief da conversa', { exact: true }).fill('Apresente proteção familiar. Use um tom acolhedor e sem pressão.')
  const presentation = page.getByLabel('Como você gosta de se apresentar? (opcional)', {exact:true})
  assert.equal(await presentation.inputValue(), '')
  assert.equal(await presentation.getAttribute('maxlength'), '300')
  const opening = 'Oi, sou Ana, agente de life insurance. Tom leve e sem pressão.'
  await presentation.fill(opening)
  const modelOptions = await page.getByLabel('Modelo de IA', { exact: true }).locator('option').evaluateAll(options => options.map(o => o.value))
  assert.ok(modelOptions.length >= 3)
  await page.getByLabel('Modelo de IA', { exact: true }).selectOption(modelOptions[1])
  assert.equal(await page.getByLabel(/URL de agendamento/).count(), 0)
  await page.getByRole('radio', { name: /Combinar reunião/ }).check()
  assert.equal(await page.getByLabel(/URL de agendamento/).count(), 1)
  await page.getByRole('radio', { name: /Obter ligação/ }).check()
  await page.getByRole('tab', { name: 'Agenda de envio' }).click()
  await page.getByLabel('Unidade de intervalo entre envios', { exact: true }).selectOption('days')
  await page.getByLabel('Intervalo entre envios', { exact: true }).fill('2')
  await page.getByLabel('Unidade de intervalo entre envios', { exact: true }).selectOption('hours')
  assert.equal(await page.getByLabel('Intervalo entre envios', { exact: true }).inputValue(), '48')
  await page.getByLabel('Unidade de intervalo entre envios', { exact: true }).selectOption('minutes')
  await page.getByLabel('Intervalo entre envios', { exact: true }).fill('61')
  await page.getByLabel('Unidade de intervalo entre envios', { exact: true }).selectOption('days')
  assert.equal(await page.getByLabel('Intervalo entre envios', { exact: true }).inputValue(), '61/1440')
  await page.getByLabel('Intervalo entre envios', { exact: true }).fill('0.0001')
  assert.equal(await page.getByRole('button', { name: /Criar sequência/ }).isDisabled(), true, 'fractional minute is invalid')
  await page.getByLabel('Intervalo entre envios', { exact: true }).fill('2')
  assert.ok((await page.getByLabel('Prévia e resumo').innerText()).includes('a cada 2 dias'))
  await page.screenshot({ path: path.join(output, 'desktop-schedule.png'), fullPage: true })
  await page.getByRole('button', { name: 'Gerar exemplo (não envia)' }).click()
  await page.getByText('Modelo temporariamente indisponível. Tente novamente.', { exact: true }).waitFor()
  assert.equal(previewPayload.ai_config.presentation, opening)
  assert.equal(await presentation.inputValue(), opening, 'preview failure preserves input')
  assert.equal(previewPayload.ai_config.repeat_minutes, 2880)
  assert.equal(previewPayload.ai_config.model, modelOptions[1])
  await page.screenshot({ path: path.join(output, 'desktop-preview-error.png'), fullPage: true })
  previewMode = 'slow'
  await page.getByRole('button', { name: 'Tentar novamente (não envia)' }).click()
  await page.getByRole('status').waitFor()
  await page.screenshot({ path: path.join(output, 'desktop-preview-loading.png'), fullPage: true })
  await page.getByRole('tab', {name:'Mensagem',exact:true}).click()
  await presentation.fill(opening + ' Sem pressa.')
  assert.equal(await page.getByRole('status').count(), 0, 'editing presentation invalidates in-flight preview')
  await page.getByLabel('Idioma do exemplo', { exact: true }).selectOption('en')
  previewMode = 'success'
  await page.getByRole('button', { name: 'Gerar exemplo (não envia)' }).click()
  await page.getByText('Fixture local de teste.', { exact: false }).waitFor()
  await page.waitForTimeout(750)
  assert.equal(await page.getByText('FIXTURE ANTIGA', { exact: false }).count(), 0, 'old preview cannot replace current response')
  await page.getByRole('tab', { name: 'Mensagem', exact: true }).click()
  await page.screenshot({ path: path.join(output, 'desktop-message.png'), fullPage: true })
  await page.getByRole('button', { name: /Criar sequência/ }).click()
  await page.getByText('Falha local simulada ao salvar. Tente novamente.', { exact: true }).first().waitFor()
  assert.equal(await page.getByLabel('Nome da sequência', { exact: true }).inputValue(), 'Retomada de contato')
  assert.equal(await page.getByLabel('Brief da conversa', { exact: true }).inputValue(), 'Apresente proteção familiar. Use um tom acolhedor e sem pressão.')
  assert.equal(await presentation.inputValue(), opening + ' Sem pressa.', 'save failure preserves input')
  assert.equal(savePayload.ai_config.presentation, opening + ' Sem pressa.')
  assert.equal(savePayload.ai_config.repeat_minutes, 2880)
  assert.equal(savePayload.ai_config.model, modelOptions[1])
  await page.setViewportSize({ width: 390, height: 844 })
  await presentation.scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(output, 'mobile-message.png'), fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow')
  const footer = await page.getByRole('button', { name: /Criar sequência/ }).boundingBox()
  assert.ok(footer.y + footer.height <= 844, 'save remains on screen')
  const headerBeforeScroll = await page.getByRole('dialog').locator('header').boundingBox()
  const footerBeforeScroll = await page.getByRole('dialog').locator('footer').boundingBox()
  await page.getByLabel('Modelo de IA', { exact: true }).scrollIntoViewIfNeeded()
  assert.deepEqual(await page.getByRole('dialog').locator('header').boundingBox(), headerBeforeScroll, 'header stays fixed while content scrolls')
  assert.deepEqual(await page.getByRole('dialog').locator('footer').boundingBox(), footerBeforeScroll, 'footer stays fixed while content scrolls')
  await page.screenshot({ path: path.join(output, 'mobile-model.png'), fullPage: true })
  await page.getByLabel('Prévia e resumo').scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(output, 'mobile-preview.png'), fullPage: true })
  await page.getByRole('tab', { name: 'Agenda de envio' }).click()
  await page.screenshot({ path: path.join(output, 'mobile-schedule.png'), fullPage: true })
  await page.setViewportSize({ width: 320, height: 667 })
  assert.equal(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth), true, '320px dialog has no horizontal overflow')
  await page.getByRole('tab', {name:'Mensagem',exact:true}).click()
  await presentation.scrollIntoViewIfNeeded()
  assert.equal(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth), true, '320px message has no overflow')
  await page.screenshot({ path: path.join(output, 'mobile-small.png'), fullPage: true })
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: path.join(output, 'desktop-dark.png'), fullPage: true })
  assert.equal(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth), true, 'dark desktop no overflow')
  saveMode = 'success'
  await page.getByRole('button', {name:/Criar sequência/}).click()
  await page.getByRole('dialog').waitFor({state:'detached'})
  await page.getByRole('button', {name:'Editar',exact:true}).click()
  assert.equal(await presentation.inputValue(), opening + ' Sem pressa.', 'reopened local fixture retains presentation')
  assert.equal(await page.getByLabel('Modelo de IA', {exact:true}).inputValue(), modelOptions[1])
  await page.screenshot({path:path.join(output,'reopened-fixture.png'),fullPage:true})
  await page.getByRole('button', {name:'Fechar formulário'}).click()
  delete stored[0].ai_config.presentation
  delete stored[0].ai_config.model
  await page.reload()
  await page.getByRole('button', {name:'Editar',exact:true}).click()
  assert.equal(await presentation.inputValue(), '', 'old missing presentation renders empty')
  assert.equal(await page.getByLabel('Modelo de IA', {exact:true}).inputValue(), 'gpt-4o-mini')
  assert.deepEqual(consoleErrors, [])
  assert.equal(externalRequests, 0)
  console.log(JSON.stringify({ result: 'PASS', previewCalls, durationMinutes: savePayload.ai_config.repeat_minutes, model: savePayload.ai_config.model, output, externalRequests }, null, 2))
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
