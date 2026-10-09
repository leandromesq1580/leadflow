import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

// 🛑 Risco real deste gatilho: automation_runs tem UNIQUE(automation_id, lead_id) pra
// gatilhos de uma vez só. Aniversário precisa disparar TODO ANO pro mesmo lead — sem uma
// chave de período (period_key), ou (a) o mesmo lead nunca mais recebe depois do 1º ano,
// ou (b) o motor manda de novo a cada rodada do cron no mesmo dia. Este teste prova as
// duas garantias com um "banco" fake em memória (mesmo padrão dos outros testes do motor).
function loadEngine(db: unknown) {
  const source = readFileSync(new URL('../src/lib/automation-engine.ts', import.meta.url), 'utf8')
  const code = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText
  const mod = { exports: {} as { runAutomations: (b?: string[]) => Promise<{ ran: number; failed: number }> } }
  new Function('require', 'module', 'exports', code)(
    (name: string) => name === '@/lib/supabase/admin' ? { createAdminClient: () => db } : { Resend: class {} },
    mod, mod.exports,
  )
  return mod.exports
}

function rowsMatch(row: Record<string, unknown>, filters: { op: string; key: string; value: unknown }[]) {
  return filters.every(f => {
    if (f.op === 'eq') return row[f.key] === f.value
    if (f.op === 'is') return f.value === null ? row[f.key] == null : row[f.key] === f.value
    return true
  })
}

function makeDb(automations: Record<string, unknown>[], runs: Record<string, unknown>[]) {
  return { from(table: string) {
    const rows = table === 'automations' ? automations : table === 'automation_runs' ? runs : []
    const filters: { op: string; key: string; value: unknown }[] = []
    const chain: Record<string, unknown> = {}
    for (const op of ['eq', 'is', 'in', 'gte', 'lte', 'not']) {
      chain[op] = (key: string, value: unknown) => { filters.push({ op, key, value }); return chain }
    }
    chain.select = () => chain
    chain.order = () => chain
    chain.limit = () => chain
    chain.maybeSingle = async () => ({ data: rows.filter(r => rowsMatch(r, filters))[0] || null, error: null })
    chain.single = async () => {
      const r = rows.filter(row => rowsMatch(row, filters))[0]
      return r ? { data: r, error: null } : { data: null, error: { message: 'not found' } }
    }
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: rows.filter(r => rowsMatch(r, filters)) })
    chain.insert = (row: Record<string, unknown>) => {
      const saved = { id: `run-${runs.length + 1}`, created_at: new Date().toISOString(), ...row }
      let inserted = true
      // Simula a UNIQUE(automation_id, lead_id, period_key) partial index: recusa duplicata.
      if (table === 'automation_runs' && runs.some(r =>
        r.automation_id === saved.automation_id && r.lead_id === saved.lead_id
        && (r.meeting_id ?? null) === (saved.meeting_id ?? null) && (r.period_key ?? null) === (saved.period_key ?? null))) {
        inserted = false
      }
      if (inserted) runs.push(saved)
      return { select: () => ({ maybeSingle: async () => inserted
        ? { data: { id: saved.id }, error: null }
        : { data: null, error: { message: 'duplicate key value violates unique constraint' } } }) }
    }
    chain.update = (patch: Record<string, unknown>) => ({ eq: (key: string, value: unknown) => {
      runs.filter(r => r[key] === value).forEach(r => Object.assign(r, patch))
      return Promise.resolve({ error: null })
    } })
    return chain
  } }
}

test('aniversário: mesmo dia não manda duas vezes, mas o ano seguinte volta a disparar', async () => {
  const automations = [{ id: 'auto-1', buyer_id: 'buyer-1', name: 'Aniversário', created_at: '2000-01-01',
    trigger_type: 'birthday', trigger_config: {}, action_type: 'unknown_action_for_test', action_config: {}, enabled: true }]
  const runs: Record<string, unknown>[] = []
  const db = makeDb(automations, runs)
  const originalFrom = db.from.bind(db)
  // leads: um único lead, aniversário hoje — reusa a mesma fonte de verdade de "hoje" do motor.
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const mm = String(hoje.getMonth() + 1).padStart(2, '0'); const dd = String(hoje.getDate()).padStart(2, '0')
  ;(db as any).from = (table: string) => table === 'leads'
    ? { select: () => ({ eq: () => ({ then: (r: (v: unknown) => void) => r({ data: [{ id: 'lead-x', birth_date: `1990-${mm}-${dd}` }] }) }) }) }
    : originalFrom(table)

  const { runAutomations } = loadEngine(db)

  const r1 = await runAutomations(['buyer-1'])
  assert.equal(runs.length, 1, 'primeira rodada do dia cria exatamente uma reserva')
  assert.equal(runs[0].period_key, String(hoje.getFullYear()), 'a reserva carrega o ano corrente como period_key')
  assert.equal(r1.failed, 1, 'action_type desconhecido falha de propósito neste teste (não testamos envio aqui)')

  const r2 = await runAutomations(['buyer-1'])
  assert.equal(runs.length, 1, 'segunda rodada no MESMO dia não cria uma segunda reserva (sem duplo envio)')
  assert.equal(r2.ran + r2.failed, 0, 'nada novo rodou na segunda chamada do mesmo dia')

  // Simula a virada de ano: a reserva registrada é do ano passado.
  runs[0].period_key = String(hoje.getFullYear() - 1)
  const r3 = await runAutomations(['buyer-1'])
  assert.equal(runs.length, 2, 'no ano seguinte o motor cria uma NOVA reserva pro mesmo lead (aniversário se repete)')
  assert.equal(runs[1].period_key, String(hoje.getFullYear()))
})
