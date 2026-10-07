import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import type { AtorPipeline } from '../src/lib/pipeline-guard'

test('detail-only delegation does not change the actor or shared board authorization', async () => {
  const actor: AtorPipeline = { buyerId: 'self', memberId: null, isAdmin: false, authUserId: 'auth' }
  const rows: Record<string, Record<string, unknown>[]> = {
    buyers: [{ id: 'self', auth_user_id: 'auth' }, { id: 'owner', auth_user_id: 'owner-auth' }],
    leads: [{ id: 'lead', assigned_to: 'owner', assigned_to_member: 'member' }],
    team_members: [{ id: 'member', buyer_id: 'agency', auth_user_id: 'auth', is_active: true }],
  }
  const db = { from(table: string) {
    const filters: Record<string, unknown> = {}
    const matches = () => rows[table].filter(row => Object.entries(filters).every(([key, value]) => row[key] === value))
    const q = {
      select: () => q, eq: (key: string, value: unknown) => { filters[key] = value; return q },
      maybeSingle: async () => ({ data: matches()[0] || null, error: null }),
      then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: matches(), error: null }).then(resolve),
    }
    return q
  } }
  function load<T>(file: string): T {
    const m = { exports: {} }
    new Function('require', 'module', 'exports', ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(() => ({
      createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'auth' } } }) } }),
    }), m, m.exports)
    return m.exports as T
  }
  const guard = load<{ atorDaSessao: (db: unknown) => Promise<AtorPipeline>; podeOperarQuadro: (db: unknown, actor: AtorPipeline, id: string) => Promise<boolean> }>('src/lib/pipeline-guard.ts')
  const detail = load<{ leadDetailScope: (db: unknown, actor: AtorPipeline, id: string) => Promise<unknown> }>('src/lib/lead-detail-access.ts')
  assert.deepEqual(await guard.atorDaSessao(db), actor, 'buyer still takes precedence globally')
  assert.equal(await guard.podeOperarQuadro(db, actor, 'owner'), false)
  assert.deepEqual(await detail.leadDetailScope(db, actor, 'lead'), { ownerId: 'owner', memberId: 'member' })
  assert.deepEqual(actor, { buyerId: 'self', memberId: null, isAdmin: false, authUserId: 'auth' }, 'read helper must not mutate the actor')
  assert.equal(await guard.podeOperarQuadro(db, actor, 'owner'), false)
  assert.equal(await detail.leadDetailScope(db, { ...actor, memberId: 'wrong-member' }, 'lead'), null)
})
