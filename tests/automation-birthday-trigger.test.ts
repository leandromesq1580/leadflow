import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

// Mesmo padrão de tests/sequence-reply-automation.test.ts e manual-pipeline-sql.test.ts:
// transpila o arquivo real e injeta um db falso — sem isso o teste não prova nada sobre
// a lógica real do motor.
function loadEngine(db: unknown) {
  const source = readFileSync(new URL('../src/lib/automation-engine.ts', import.meta.url), 'utf8')
    + '\nexport {findTargets}'
  const code = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText
  const mod = { exports: {} as { findTargets: (a: unknown) => Promise<unknown[]>; runAutomations: (b?: string[]) => Promise<{ran:number;failed:number}> } }
  new Function('require', 'module', 'exports', code)(
    (name: string) => name === '@/lib/supabase/admin' ? { createAdminClient: () => db } : {},
    mod, mod.exports,
  )
  return mod.exports
}

// "Hoje" no fuso de negócio (Flórida) — o próprio motor usa America/New_York pros
// lembretes de reunião; o teste tem que calcular a data-fixture do mesmo jeito,
// senão quebra sempre que rodar num dia diferente.
function hojeNY() { return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })) }

test('gatilho de aniversário encontra só o lead cujo mês/dia de nascimento é hoje, de qualquer ano', async () => {
  const hoje = hojeNY()
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  const dia = String(hoje.getDate()).padStart(2, '0')
  const leads = [
    { id: 'lead-aniversario-antigo', assigned_to: 'buyer-1', birth_date: `1990-${mes}-${dia}` },
    { id: 'lead-outro-dia', assigned_to: 'buyer-1', birth_date: '1990-01-01' },
    { id: 'lead-sem-data', assigned_to: 'buyer-1', birth_date: null },
    { id: 'lead-de-outro-corretor', assigned_to: 'buyer-2', birth_date: `1985-${mes}-${dia}` },
  ]
  const calls: unknown[][] = []
  const db = { from(table: string) {
    const methods: Record<string, unknown> = {}
    for (const key of ['select', 'eq', 'in', 'gte', 'lte', 'is', 'not']) {
      methods[key] = (...args: unknown[]) => { calls.push([table, key, ...args]); return methods }
    }
    methods.then = (resolve: (v: unknown) => void) => resolve({
      data: table === 'leads' ? leads.filter(l => l.assigned_to === 'buyer-1') : [],
    })
    return methods
  } }
  const { findTargets } = loadEngine(db)
  const targets = await findTargets({ buyer_id: 'buyer-1', trigger_type: 'birthday', created_at: '2000-01-01', trigger_config: {} })
  assert.deepEqual(targets, [{ lead_id: 'lead-aniversario-antigo' }])
  assert.ok(calls.some(c => c[0] === 'leads' && c[1] === 'eq' && c[2] === 'assigned_to' && c[3] === 'buyer-1'))
})

test('gatilho de aniversário não dispara pra ninguém quando a conta não tem leads com data de nascimento', async () => {
  const db = { from() {
    const methods: Record<string, unknown> = {}
    for (const key of ['select', 'eq', 'in', 'gte', 'lte', 'is', 'not']) methods[key] = () => methods
    methods.then = (resolve: (v: unknown) => void) => resolve({ data: [] })
    return methods
  } }
  const { findTargets } = loadEngine(db)
  const targets = await findTargets({ buyer_id: 'buyer-1', trigger_type: 'birthday', created_at: '2000-01-01', trigger_config: {} })
  assert.deepEqual(targets, [])
})
