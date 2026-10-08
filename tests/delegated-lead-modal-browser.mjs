// Real mounted LeadModal, local synthetic API only; no auth or external services.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import { createRequire } from 'node:module'
const repo = process.cwd(), out = process.env.UI_RESULTS_DIR
assert.ok(out?.includes('/scratch/'))
await mkdir(out, { recursive: true })
const require = createRequire(path.join(repo, 'package.json'))
const { build } = require('esbuild')
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const mocks = {
  '@/components/send-message-modal': 'export const SendMessageModal=()=>null',
  '@/components/tag-picker': 'export const TagPicker=()=>null',
  '@/components/whatsapp-inbox': 'export const WhatsAppInbox=()=>null', '@/components/voice/softphone': 'export const callLead=()=>{}',
  '@/components/ai-score-badge': 'export const AiScoreBadge=()=>null', '@/components/time-picker': 'export const TimePicker=()=>null',
  '@/lib/privacy-mode': 'export const usePrivacy=()=>({enabled:false,mask:v=>v})', './lead-forms-tab': 'export const LeadFormsTab=()=>null',
  '@/lib/i18n-client': 'export const useT=()=>({_locale:"pt"})', '@/components/lead-language-badge': 'export const LeadLanguageBadge=()=>null',
  '@/lib/lead-message-locale': 'export const leadMessageLocale=()=>"pt"',
  '@/components/add-existing-lead-to-pipeline': 'export const AddExistingLeadToPipeline=()=>null',
}
await build({ entryPoints: [path.join(repo, 'tests/delegated-lead-modal-entry.tsx')], bundle: true, outfile: path.join(out, 'ui.js'), platform: 'browser', jsx: 'automatic', alias: { '@': path.join(repo, 'src') }, nodePaths: [path.join(repo, 'node_modules')], plugins: [{ name: 'unrelated-components-only', setup(b) { b.onResolve({ filter: /.*/ }, a => Object.hasOwn(mocks, a.path) ? { path: a.path, namespace: 'mock' } : undefined); b.onLoad({ filter: /.*/, namespace: 'mock' }, a => ({ contents: mocks[a.path] })) } }] })
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', req.url === '/ui.js' ? 'text/javascript' : 'text/html')
  res.end(req.url === '/ui.js' ? await readFile(path.join(out, 'ui.js')) : '<!doctype html><html><body><div id="root"></div><script src="/ui.js"></script></body></html>')
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ headless: true })
const results = [], failures = []
async function fixture(mode, width) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } })
  page.setDefaultTimeout(1500)
  // Local bundle loading is setup, not the symptom/assertion deadline.
  page.setDefaultNavigationTimeout(15000)
  const errors = [], writes = []
  let gets = 0, external = 0
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/*', async route => {
    const req = route.request(), u = new URL(req.url())
    if (u.origin !== base) { external++; return route.abort() }
    if (!u.pathname.startsWith('/api/')) return route.continue()
    if (req.method() !== 'GET') writes.push(req.method() + ' ' + u.pathname)
    if (/\/api\/leads\/[^/]+$/.test(u.pathname)) {
      gets++
      if (gets === 1) {
        if (typeof mode === 'number') return route.fulfill({ status: mode, body: 'not JSON' })
        if (mode === 'network') return route.abort()
        if (mode === 'invalid') return route.fulfill({ json: { error: 'empty lead' } })
        if (mode === 'wrong-id') return route.fulfill({ json: { lead: { id: 'another-lead', name: 'Wrong lead' } } })
      }
      return route.fulfill({ json: { lead: { id: u.pathname.split('/').pop(), name: 'Lead recuperado', phone: '', activities: [] } } })
    }
    if (mode === 'aux-network') return route.abort()
    return route.fulfill({ json: { followUps: [], attachments: [], pipelines: [], pipelineLead: null } })
  })
  if (mode === 'controlled') await page.addInitScript(() => {
    const realFetch = window.fetch
    window.pendingDetails = []
    window.fetch = (url, init) => {
      if (!/^\/api\/leads\/[^/]+$/.test(String(url))) return realFetch(url, init)
      return new Promise((resolve, reject) => {
        const item = { url, aborted: false, resolve: name => resolve(Response.json({ lead: { id: String(url).split('/').pop(), name, phone: '', activities: [] } })), reject: () => reject(Error('Late network failure')) }
        // Intentionally IGNORE cancellation: late responses must also be ignored.
        init?.signal?.addEventListener('abort', () => { item.aborted = true })
        window.pendingDetails.push(item)
      })
    }
  })
  await page.goto(base)
  return { page, counts: () => ({ gets, external, errors, writes }) }
}
async function check(name, mode, width, run) {
  const f = await fixture(mode, width)
  try {
    await run(f.page, f.counts)
    assert.deepEqual(f.counts().errors, []); assert.deepEqual(f.counts().writes, []); assert.equal(f.counts().external, 0)
    results.push({ name, ...f.counts() }); console.log('PASS', name)
  } catch (e) { failures.push({ name, error: e.message }); console.log('FAIL', name, e.message) }
  finally { await f.page.close() }
}
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
try {
  for (const width of [1440, 390]) {
    for (const mode of [401, 403, 404, 500, 'network', 'invalid', 'wrong-id']) await check(`${width} ${mode}: explicit error and retry`, mode, width, async (page, counts) => {
      await page.getByRole('alert').waitFor()
      assert.equal(await page.locator('.animate-spin').count(), 0)
      assert.equal(await page.getByRole('button', { name: 'Fechar', exact: true }).count(), 1)
      await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click()
      await page.getByRole('heading', { name: 'Lead recuperado', exact: true }).waitFor()
      assert.equal(counts().gets, 2); assert.equal(await page.getByRole('alert').count(), 0)
    })
    await check(`${width} auxiliaries cannot create unhandled rejections`, 'aux-network', width, async page => {
      await page.getByRole('heading', { name: 'Lead recuperado', exact: true }).waitFor()
      await settle(page)
    })
    await check(`${width} old lead hidden immediately while new selection loads`, 'controlled', width, async page => {
      await page.waitForFunction(() => window.pendingDetails.length === 1)
      await page.evaluate(() => window.pendingDetails[0].resolve('Lead anterior'))
      await page.getByRole('heading', { name: 'Lead anterior', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Selecionar B', exact: true }).click()
      await page.waitForFunction(() => window.pendingDetails.length === 2)
      assert.equal(await page.getByRole('heading', { name: 'Lead anterior', exact: true }).count(), 0)
      await page.evaluate(() => window.pendingDetails[1].resolve('Lead atual'))
      await page.getByRole('heading', { name: 'Lead atual', exact: true }).waitFor()
    })
    for (const late of ['resolve', 'reject']) await check(`${width} late ${late} cannot replace new lead`, 'controlled', width, async page => {
      await page.waitForFunction(() => window.pendingDetails.length === 1)
      await page.getByRole('button', { name: 'Selecionar B', exact: true }).click()
      await page.waitForFunction(() => window.pendingDetails.length === 2)
      assert.equal(await page.evaluate(() => window.pendingDetails[0].aborted), true)
      await page.evaluate(() => window.pendingDetails[1].resolve('Lead atual'))
      await page.getByRole('heading', { name: 'Lead atual', exact: true }).waitFor()
      await page.evaluate(late => window.pendingDetails[0][late]('Lead anterior'), late)
      await settle(page)
      assert.equal(await page.getByRole('heading', { name: 'Lead atual', exact: true }).count(), 1)
      assert.equal(await page.getByRole('alert').count(), 0)
    })
    for (const action of ['Desmontar', 'Trocar comprador']) await check(`${width} ${action} cancels pending details`, 'controlled', width, async page => {
      await page.waitForFunction(() => window.pendingDetails.length === 1)
      await page.getByRole('button', { name: action, exact: true }).click()
      assert.equal(await page.evaluate(() => window.pendingDetails[0].aborted), true)
      await page.evaluate(() => window.pendingDetails[0].resolve('Lead anterior'))
      await settle(page)
      assert.equal(await page.getByRole('heading', { name: 'Lead anterior', exact: true }).count(), 0)
    })
  }
} finally {
  await browser.close(); await new Promise(r => server.close(r))
  await writeFile(path.join(out, 'ui-results.json'), JSON.stringify({ results, failures }, null, 2))
}
assert.deepEqual(failures, [])
console.log(`${results.length} mounted browser tests passed`)
