import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ModuleKind, transpileModule } from 'typescript'
import { leadMessageLocale } from '../src/lib/lead-message-locale'

type Row = Record<string, unknown>
function fixture(opts: { signedIn?: boolean; buyer?: boolean; failInsert?: boolean } = {}) {
  const inserted: {table: string; row: Row}[] = []
  const db = { from(table: string) {
    let row: Row = {}
    const q = {
      select() { return q }, eq() { return q },
      insert(value: Row) { row = value; inserted.push({table, row}); return q },
      async single() {
        if (table === 'buyers') return {data: opts.buyer === false ? null : {id: 'owner'}, error: null}
        if (table === 'leads') return opts.failInsert ? {data: null, error: {message:'insert unavailable'}} : {data: {id:'synthetic-lead', ...row}, error: null}
        return {data: null, error: null}
      },
    }
    return q
  } }
  const deps: Record<string, unknown> = {
    'next/server': {NextResponse: {json: (data: unknown, init?: ResponseInit) => Response.json(data, init)}},
    '@/lib/supabase/server': {createServerSupabase: async () => ({auth: {getUser: async () => ({data: {user: opts.signedIn === false ? null : {id:'user'}}})}})},
    '@/lib/supabase/admin': {createAdminClient: () => db},
    '@/lib/us-area-codes': {stateFromPhone: () => 'FL'},
  }
  const code = transpileModule(readFileSync('src/app/api/leads/manual/route.ts','utf8'), {compilerOptions:{module: ModuleKind.CommonJS}}).outputText
  const mod = {exports: {} as {POST: (request: Request) => Promise<Response>}}
  new Function('require','module','exports',code)((name: string) => {assert.ok(name in deps, name); return deps[name]},mod,mod.exports)
  const post = (extra: Row = {}) => mod.exports.POST(new Request('https://local.invalid/api/leads/manual', {method:'POST', body: JSON.stringify({name:'Synthetic lead',email:'fixture@example.invalid', ...extra})}))
  return {post, inserted}
}
for (const locale of ['pt','es','en']) test(`manual lead persists explicit ${locale}, preserves owner and resolves contact language`, async () => {
  const f = fixture()
  const response = await f.post({lead_language: locale, assigned_to:'forged-owner', state:'FL'})
  assert.equal(response.status,200)
  const {lead} = await response.json()
  assert.equal(lead.lead_language,locale)
  assert.equal(f.inserted[0].row.lead_language,locale)
  assert.equal(lead.assigned_to,'owner')
  assert.equal(lead.form_name,'manual_entry')
  assert.equal(leadMessageLocale(lead),locale)
})
for (const locale of ['',null,'fr','PT','en-US',[],{},42]) test(`reject invalid explicit language ${JSON.stringify(locale)} before insert`, async () => {
  const f=fixture()
  assert.equal((await f.post({lead_language:locale})).status,400)
  assert.equal(f.inserted.length,0)
})
test('legacy client omitting language keeps Portuguese default',async()=>{
  const f=fixture(); const response=await f.post()
  assert.equal(response.status,200)
  assert.equal((await response.json()).lead.lead_language,'pt')
})
test('authentication and buyer lookup remain required',async()=>{
  for (const [opts,status] of [[{signedIn:false},401],[{buyer:false},404]] as const) {
    const f=fixture(opts); assert.equal((await f.post({lead_language:'en'})).status,status); assert.equal(f.inserted.length,0)
  }
})
test('database failure remains an error instead of a false saved lead',async()=>{
  assert.equal((await fixture({failInsert:true}).post({lead_language:'en'})).status,500)
})
