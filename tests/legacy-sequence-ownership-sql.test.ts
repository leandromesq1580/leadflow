import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, uuid } from './admin-new-lead-assignment-fixture'

// Regressão: desde a 052 (29/09) o guard de dono parava TODA sequência comum (legacy) cujo lead
// pertencesse a outra conta da empresa ou estivesse delegado a um membro do time. 56 inscrições
// pararam em 14 dias sem enviar nada. Sequência de IA continua estrita.
const SALES = uuid(3) // conta admin de vendas (dona da sequência)
const ADMIN = uuid(1) // conta admin dona do lead
const CUSTOMER = uuid(2) // comprador comum

async function setup(mode: 'legacy' | 'ai_until_reply', owner = SALES) {
  const { db, q } = await fixture()
  await q(`insert into buyers(id,name,email,is_admin) values($1,'Sales','sales@example.test',true)`, [SALES])
  await q(`insert into pipelines(id,buyer_id,name,is_default) values($1,$2,'Sales',true)`, [uuid(23), SALES])
  await q(`insert into pipeline_stages(id,pipeline_id,name,position) values($1,$2,'Nao Atendeu',0)`, [uuid(34), uuid(23)])
  await q(`insert into sequences(id,buyer_id,name,enabled,mode) values($1,$2,'Nao Atendeu',true,$3)`, [uuid(61), owner, mode])
  await q(`insert into pipeline_leads(lead_id,pipeline_id,stage_id) values($1,$2,$3)`, [uuid(41), uuid(23), uuid(34)])
  await q(`update leads set assigned_to_member=$1 where id=$2`, [uuid(70), uuid(41)])
  const block = async (buyer = owner) => (await q('select ai_sequence_block($1,$2,$3) r', [buyer, uuid(41), uuid(61)]))[0].r
  return { db, q, block }
}

test('legacy: lead de outra conta admin delegado a membro, no quadro da dona da sequência, NÃO para', async () => {
  const { db, block } = await setup('legacy')
  try { assert.equal(await block(), null) } finally { await db.close() }
})

test('legacy: lead da própria dona delegado a membro NÃO para', async () => {
  const { db, q, block } = await setup('legacy')
  try {
    await q('update leads set assigned_to=$1', [SALES])
    assert.equal(await block(), null)
  } finally { await db.close() }
})

test('legacy: lead de comprador comum continua parando por troca de dono', async () => {
  const { db, q, block } = await setup('legacy')
  try {
    await q('update leads set assigned_to=$1', [CUSTOMER])
    assert.equal(await block(), 'ownership_changed')
  } finally { await db.close() }
})

test('legacy: sequência de comprador comum em lead de admin continua parando', async () => {
  const { db, q, block } = await setup('legacy', CUSTOMER)
  try {
    await q(`insert into pipelines(id,buyer_id,name,is_default) values($1,$2,'Cust',false)`, [uuid(24), CUSTOMER])
    await q(`insert into pipeline_stages(id,pipeline_id,name,position) values($1,$2,'S',0)`, [uuid(35), uuid(24)])
    await q(`insert into pipeline_leads(lead_id,pipeline_id,stage_id) values($1,$2,$3)`, [uuid(41), uuid(24), uuid(35)])
    assert.equal(await block(), 'ownership_changed')
  } finally { await db.close() }
})

test('legacy: lead de outra conta admin FORA do quadro da dona da sequência continua parando', async () => {
  const { db, q, block } = await setup('legacy')
  try {
    await q('delete from pipeline_leads where pipeline_id=$1', [uuid(23)])
    assert.equal(await block(), 'ownership_changed')
  } finally { await db.close() }
})

test('legacy: STOP, arquivado, vendido e resposta continuam parando', async () => {
  for (const [sql, reason] of [
    ['update leads set sms_opted_out=true', 'optout'],
    ['update leads set archived=true', 'archived'],
    ['update leads set contract_closed=true', 'sold'],
  ] as const) {
    const { db, q, block } = await setup('legacy')
    try { await q(sql); assert.equal(await block(), reason) } finally { await db.close() }
  }
})

test('IA (ai_until_reply): regra estrita de dono não muda', async () => {
  const { db, q, block } = await setup('ai_until_reply')
  try {
    assert.equal(await block(), 'ownership_changed', 'lead de outra conta')
    await q('update leads set assigned_to=$1', [SALES])
    assert.equal(await block(), 'ownership_changed', 'própria dona mas com membro')
    await q('update leads set assigned_to_member=null')
    assert.equal(await block(), null)
  } finally { await db.close() }
})
