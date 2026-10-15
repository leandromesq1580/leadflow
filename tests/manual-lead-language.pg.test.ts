import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

test('manual contact languages include English without changing historical rows or sale languages', async () => {
  const db=new PGlite()
  try {
    await db.exec(`CREATE TABLE leads(id int PRIMARY KEY, lead_language text DEFAULT 'pt' CHECK(lead_language IN ('pt','es')));
      CREATE TABLE credits(lead_language text CHECK(lead_language IN ('pt','es')));
      CREATE TABLE payments(lead_language text CHECK(lead_language IN ('pt','es')));
      INSERT INTO leads VALUES(1,'pt'),(2,'es'),(3,null);`)
    const migration='supabase/migrations/069_manual_lead_language_en.sql'
    if(existsSync(migration)) { const sql=readFileSync(migration,'utf8'); await db.exec(sql); await db.exec(sql) }
    await db.exec("INSERT INTO leads VALUES(4,'en')")
    assert.deepEqual((await db.query('SELECT lead_language FROM leads ORDER BY id')).rows,[{lead_language:'pt'},{lead_language:'es'},{lead_language:null},{lead_language:'en'}])
    await assert.rejects(db.exec("INSERT INTO leads VALUES(5,'fr')"))
    await assert.rejects(db.exec("INSERT INTO credits VALUES('en')"))
    await assert.rejects(db.exec("INSERT INTO payments VALUES('en')"))
    await db.exec('INSERT INTO leads(id) VALUES(6)')
    assert.deepEqual((await db.query('SELECT lead_language FROM leads WHERE id=6')).rows,[{lead_language:'pt'}])
  } finally {await db.close()}
})
