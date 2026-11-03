import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLicenseeCsv, validateRange, toUsDate, licenseesToCsv } from '../src/lib/fl-licensees'

const SAMPLE = [
  'License Category : Life & Annuity', 'License Issue Date From : 10/26/2026', 'License Issue Date To : 11/2/2026', '',
  'Export run on: 11/2/2026 8:33:43 PM', '',
  'Licensee Name,License Number,Business Address,"Business City, State, Zip",Business County,Email Address,Business Phone,NPN Number',
  '"ABDELHASSIB, KARIM",G393095,9624 SIMEON DR ,"LAND O LAKES, FL, 34638",Pasco,KARIM.ABDELHASSIB@GMAIL.COM,(813) 447-1388,="22400653"',
  '"ABRAHAMS, AVON",G392966,3217 CONNECTICUT AVE NW 33,"WASHINGTON, DC, 20008",,AVONABRAHAMSJR@LIVE.COM,(202) 270-2314,="22370196"',
  '"SEM EMAIL, JOAO",G111,RUA 1 ,"MIAMI, FL, 33101",Dade,,,="1"',
].join('\r\n')

test('parse do CSV do DFS: ignora cabeçalho de metadados, separa cidade/estado/CEP e limpa o NPN', () => {
  const r = parseLicenseeCsv(SAMPLE)
  assert.equal(r.length, 3)
  assert.deepEqual(r[0], {
    name: 'KARIM ABDELHASSIB', license: 'G393095', address: '9624 SIMEON DR', city: 'LAND O LAKES', state: 'FL', zip: '34638',
    county: 'Pasco', email: 'karim.abdelhassib@gmail.com', phone: '(813) 447-1388', npn: '22400653',
  })
  assert.equal(r[1].state, 'DC')
  assert.equal(r[2].email, '')
  assert.equal(r[2].phone, '')
})
test('CSV sem a linha de colunas vira lista vazia (não quebra)', () => {
  assert.deepEqual(parseLicenseeCsv('No records found'), [])
  assert.deepEqual(parseLicenseeCsv(''), [])
})
test('validateRange: datas ISO, início ≤ fim, máximo de 62 dias, nada no futuro', () => {
  const now = new Date('2026-11-02T20:00:00Z')
  assert.deepEqual(validateRange('2026-10-26', '2026-11-02', now), { ok: true, from: '2026-10-26', to: '2026-11-02' })
  assert.equal(validateRange('2026-11-03', '2026-11-02', now).ok, false)
  assert.equal(validateRange('2026-01-01', '2026-11-02', now).ok, false)
  assert.equal(validateRange('26/10/2026', '2026-11-02', now).ok, false)
  assert.equal(validateRange('2026-02-31', '2026-03-02', now).ok, false)
  assert.equal(validateRange('2026-10-26', '2026-12-01', now).ok, false)
  assert.equal(validateRange(null, '2026-11-02', now).ok, false)
})
test('toUsDate converte para mm/dd/yyyy sem zero extra', () => {
  assert.equal(toUsDate('2026-11-02'), '11/02/2026')
})
test('licenseesToCsv escapa vírgula/aspas e mantém acentos', () => {
  const out = licenseesToCsv([{ name: 'SILVA, "JOÃO"', license: 'G1', address: 'A, B', city: 'C', state: 'FL', zip: '1', county: '', email: 'a@b.c', phone: '(1) 2', npn: '9' }])
  const lines = out.replace(/^\uFEFF/, '').split('\r\n')
  assert.equal(lines[0], 'Nome,Licença,Endereço,Cidade,Estado,CEP,Condado,E-mail,Telefone,NPN')
  assert.equal(lines[1], '"SILVA, ""JOÃO""",G1,"A, B",C,FL,1,,a@b.c,(1) 2,9')
})
