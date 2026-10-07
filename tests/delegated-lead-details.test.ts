/* eslint-disable @typescript-eslint/no-explicit-any */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
const native = createRequire(import.meta.url)
function load(file: string, deps: Record<string, unknown>) {
  const m = { exports: {} as any }
  new Function('require', 'module', 'exports', ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText)((name: string) => name in deps ? deps[name] : native(name), m, m.exports)
  return m.exports
}
function fixture() {
  const state = {
    user: 'auth' as string | null,
    buyers: [{ id: 'self', auth_user_id: 'auth', is_admin: false, email: 'self@example.test' }, { id: 'owner', auth_user_id: 'owner-auth', is_admin: false, email: 'owner@example.test' }],
    members: [{ id: 'delegate', buyer_id: 'agency', auth_user_id: 'auth', is_active: true, email: 'self@example.test' }],
    lead: { id: 'lead', assigned_to: 'owner', assigned_to_member: 'delegate' as string | null, name: 'Synthetic lead', activities: [] },
    fail: '' as string,
    throwAt: '' as string,
    beforeFull: () => {},
    afterFull: () => {},
  }
  const queries: { table: string; selection: string; filters: Record<string, unknown> }[] = []
  const db = { from(table: string) {
    const q = { table, selection: '', filters: {} as Record<string, unknown> }
    const run = async (single = false) => {
      queries.push(q)
      const full = table === 'leads' && q.selection.includes('*')
      const phase = full ? 'full' : table
      if (state.throwAt === phase) throw Error('Synthetic DB failure')
      if (full) state.beforeFull()
      const rows = table === 'leads' ? [state.lead] : table === 'buyers' ? state.buyers : table === 'team_members' ? state.members : []
      const matches = rows.filter(row => Object.entries(q.filters).every(([key, value]) => (row as any)[key] === value))
      // Deliberately return data AND error to prove that errors fail closed.
      const result = { data: single ? matches[0] ? { ...matches[0] } : null : matches, error: state.fail === phase ? { message: 'Synthetic DB failure' } : null }
      if (full) state.afterFull()
      return result
    }
    const builder = {
      select(selection: string) { q.selection = selection; return builder },
      eq(key: string, value: unknown) { q.filters[key] = value; return builder },
      limit() { return builder }, order() { return builder },
      maybeSingle: () => run(true), single: () => run(true),
      then(resolve: any, reject: any) { return run().then(resolve, reject) },
    }
    return builder
  } }
  const deps: Record<string, unknown> = {
    '@/lib/supabase/server': { createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: state.user ? { id: state.user } : null } }) } }) },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/lead-ownership': {},
    '@/lib/locale': { getLocale: async () => 'pt' },
    '@/lib/florida-time': { formatFloridaDateTime: () => '' },
    '@/lib/utils': { getInitials: () => 'SL' },
    '@/components/ui/badge': { Badge: () => null },
    '@/components/lead-language-badge': { LeadLanguageBadge: () => null },
    '@/components/add-existing-lead-to-pipeline': { AddExistingLeadToPipeline: () => null },
    'next/link': { default: () => null },
    'next/navigation': { notFound: () => { throw Error('not-found') }, redirect: () => { throw Error('redirect') } },
  }
  deps['@/lib/pipeline-guard'] = load('src/lib/pipeline-guard.ts', deps)
  deps['@/lib/lead-detail-access'] = load('src/lib/lead-detail-access.ts', deps)
  const get = load('src/app/api/leads/[id]/route.ts', deps).GET
  const page = load('src/app/dashboard/leads/[id]/page.tsx', deps).default
  return { state, queries, get: () => get(new Request('http://localhost/api/leads/lead'), { params: Promise.resolve({ id: 'lead' }) }), page: () => page({ params: Promise.resolve({ id: 'lead' }) }) }
}
for (const entrypoint of ['get', 'page'] as const) {
  test(`${entrypoint}: own buyer + explicitly assigned active member in a different agency can read`, async () => {
    const f = fixture()
    const response = await f[entrypoint]()
    if (entrypoint === 'get') { assert.equal(response.status, 200); assert.equal((await response.json()).lead.name, 'Synthetic lead') }
    else assert.ok(response)
    const full = f.queries.find(q => q.table === 'leads' && q.selection.includes('*'))!
    assert.deepEqual(full.filters, { id: 'lead', assigned_to: 'owner', assigned_to_member: 'delegate' })
    const checks = f.queries.filter(q => q.table === 'team_members' && q.filters.id === 'delegate')
    assert.ok(checks.length >= 2, 'revalidate the exact active identity after the final read')
    for (const check of checks) assert.deepEqual(check.filters, { id: 'delegate', auth_user_id: 'auth', is_active: true })
  })
  for (const scenario of ['unrelated-buyer', 'unrelated-member', 'inactive', 'wrong-auth', 'email-only', 'no-member', 'missing-owner', 'preflight-error', 'member-error', 'member-throw', 'owner-reassignment', 'member-reassignment', 'revalidation-inactive', 'revalidation-identity', 'revalidation-error', 'read-error', 'read-throw']) {
    test(`${entrypoint}: denies ${scenario}`, async () => {
      const f = fixture()
      switch (scenario) {
        case 'unrelated-buyer': f.state.members = []; break
        case 'unrelated-member': f.state.members[0].id = 'other-member'; break
        case 'inactive': f.state.members[0].is_active = false; break
        case 'wrong-auth': f.state.members[0].auth_user_id = 'someone-else'; break
        case 'email-only': f.state.members[0].auth_user_id = ''; break
        case 'no-member': f.state.lead.assigned_to_member = null; break
        case 'missing-owner': f.state.lead.assigned_to = ''; break
        case 'preflight-error': f.state.fail = 'leads'; break
        case 'member-error': f.state.fail = 'team_members'; break
        case 'member-throw': f.state.throwAt = 'team_members'; break
        case 'owner-reassignment': f.state.beforeFull = () => { f.state.lead.assigned_to = 'new-owner' }; break
        case 'member-reassignment': f.state.beforeFull = () => { f.state.lead.assigned_to_member = 'new-member' }; break
        case 'revalidation-inactive': f.state.afterFull = () => { f.state.members[0].is_active = false }; break
        case 'revalidation-identity': f.state.afterFull = () => { f.state.members[0].auth_user_id = 'new-auth' }; break
        case 'revalidation-error': f.state.afterFull = () => { f.state.fail = 'team_members' }; break
        case 'read-error': f.state.fail = 'full'; break
        case 'read-throw': f.state.throwAt = 'full'; break
      }
      if (entrypoint === 'get') { const r = await f.get(); assert.equal(r.status, 404); assert.deepEqual(await r.json(), { error: 'Lead not found' }) }
      else await assert.rejects(f.page(), /not-found/)
      if (!scenario.startsWith('revalidation') && !scenario.endsWith('reassignment') && !scenario.startsWith('read-')) assert.equal(f.queries.filter(q => q.selection.includes('*')).length, 0, 'deny before PII')
    })
  }
}
for (const grant of ['owner', 'admin', 'agency-auth', 'agency-email', 'member-only']) {
  test(`preserves ${grant} read permission`, async () => {
    const f = fixture()
    if (grant === 'owner') f.state.lead.assigned_to = 'self'
    if (grant === 'admin') f.state.buyers[0].is_admin = true
    if (grant.startsWith('agency')) { f.state.members[0] = { id: 'agency-link', buyer_id: 'self', auth_user_id: grant === 'agency-auth' ? 'owner-auth' : '', email: ' OWNER@EXAMPLE.TEST ', is_active: true } }
    if (grant === 'member-only') f.state.buyers.shift()
    const r = await f.get(); assert.equal(r.status, 200)
  })
}
for (const table of ['buyers', 'team_members']) {
  test(`agency lookup ${table} error fails closed even with matching data`, async () => {
    const f = fixture()
    f.state.members[0] = { id: 'agency-link', buyer_id: 'self', auth_user_id: 'owner-auth', email: 'owner@example.test', is_active: true }
    f.state.fail = table
    assert.equal((await f.get()).status, 404)
  })
}
test('unauthenticated GET remains 401 without database reads', async () => {
  const f = fixture(); f.state.user = null
  assert.equal((await f.get()).status, 401); assert.equal(f.queries.length, 0)
})
