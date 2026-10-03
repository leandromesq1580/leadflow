import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync,readFileSync } from 'node:fs'
import ts from 'typescript'
test('lead detail refuses foreign IDs before PII read, allows real agency and assigned active member scope',async()=>{
 const path='src/lib/lead-detail-access.ts';assert.ok(existsSync(path),'detail authorization exists')
 const m={exports:{} as {leadDetailOwner:(db:unknown,actor:unknown,id:string)=>Promise<string|null>}}
 let agency=false;const db={from:()=>query};const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{assigned_to:'owner',assigned_to_member:'member'}})}
 new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)((name:string)=>{assert.equal(name,'@/lib/pipeline-guard');return {podeOperarQuadro:async()=>agency}},m,m.exports)
 const scope=m.exports.leadDetailOwner
 const actor={buyerId:'other',memberId:null,isAdmin:false,authUserId:'auth'}
 assert.equal(await scope(db,actor,'lead'),null)
 assert.equal(await scope(db,{...actor,buyerId:'owner'},'lead'),'owner')
 assert.equal(await scope(db,{...actor,isAdmin:true},'lead'),'owner')
 agency=true;assert.equal(await scope(db,actor,'lead'),'owner')
 assert.equal(await scope(db,{...actor,buyerId:'owner',memberId:'other-member'},'lead'),null)
 assert.equal(await scope(db,{...actor,buyerId:'owner',memberId:'member'},'lead'),'owner')
})
