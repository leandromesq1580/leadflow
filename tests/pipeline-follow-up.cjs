/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS VM harness used by node:test. */
// Local-only diagnostic: no application imports, environment files or network.
const fs = require('node:fs'); const vm = require('node:vm'); const assert = require('node:assert/strict');
const { createRequire } = require('node:module'); const { test } = require('node:test');
const root = require('node:path').resolve(__dirname, '..');
const req = createRequire(root + '/package.json'); const ts = req('typescript');
const React = req('react'); const { renderToStaticMarkup } = req('react-dom/server');
function load(file, mocks, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(root + '/' + file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, console, URL, Response,
    fetch: () => { throw Error('NETWORK FORBIDDEN'); }, ...globals,
    require: name => { if (Object.hasOwn(mocks, name)) return mocks[name]; if (['@/lib/pipeline-follow-ups', '@/components/follow-up-badge'].includes(name)) return load('src/' + name.slice(2) + (name.includes('components') ? '.tsx' : '.ts'), mocks); if (name === 'react/jsx-runtime') return req(name); throw Error('Unmocked import: ' + name); }
  }, { filename: file }); return loadedModule.exports;
}
const fu = { type: 'call', scheduled_at: null, created_at: '2026-09-14T14:35:00Z' };
const lead = { id: 'synthetic-lead', name: 'Synthetic Test', phone: '', city: '', state: '', status: 'new', interest: '', created_at: '2026-09-14T13:00:00Z', contract_closed: false };
const pl = { id: 'synthetic-pl', stage_id: 'synthetic-stage', lead, last_follow_up: fu };
const stage = { id: pl.stage_id, name: 'Synthetic Stage', color: '#000', position: 0 };
const t = { _locale: 'pt', sidebar: { pipeline: 'Pipeline' }, card: {} };
const common = { '@/lib/i18n-client': { useT: () => t }, '@/components/lead-language-badge': { LeadLanguageBadge: () => null } };
const { LeadCard } = load('src/app/dashboard/pipeline/lead-card.tsx', { ...common,
  '@dnd-kit/sortable': { useSortable: () => ({ attributes: {}, listeners: {} }) },
  '@dnd-kit/utilities': { CSS: { Transform: { toString: () => undefined } } },
  '@/lib/stale-leads': { getStaleness: () => ({ level: 'fresh' }) },
  './card-assign-menu': { CardAssignMenu: () => null }, '@/lib/privacy-mode': { usePrivacy: () => ({ mask: s => s }) }
});
function desktop(lastFollowUp) { return renderToStaticMarkup(React.createElement(LeadCard, { pipelineLeadId: pl.id, lead, lastFollowUp, onClick() {} })); }
function mobile() {
  const state = ['synthetic-buyer', { id: 'synthetic-pipe', stages: [stage] }, [pl], stage.id, null, false, false, false]; let i = 0;
  const { default: Mobile } = load('src/app/m/pipeline/page.tsx', { ...common,
    react: { useState: () => [state[i++], () => {}], useEffect() {}, useMemo: fn => fn() },
    'next/link': { default: ({ children }) => React.createElement('a', null, children) },
    '@/components/mobile/icons': { MIcon: () => null }, '@/components/mobile/stage-sheet': { StageSheet: () => null },
    '@/lib/utils': { getInitials: () => 'ST', timeAgo: () => '1h' }
  }); return renderToStaticMarkup(React.createElement(Mobile));
}
async function api(fail) {
  const db = { from(table) {
    const result = table === 'pipelines' ? { data: { buyer_id: 'synthetic-buyer' } } : table === 'pipeline_leads' ? { data: [pl], error: null } : fail ? { data: null, error: { code: 'SYNTHETIC_QUERY_FAILURE', message: 'Injected diagnostic failure' } } : { data: [{ lead_id: lead.id, ...fu }], error: null };
    const chain = { then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); } };
    for (const name of ['select', 'eq', 'maybeSingle', 'order', 'in', 'range']) chain[name] = () => chain;
    return chain;
  } };
  const { GET } = load('src/app/api/pipelines/[id]/leads/route.ts', {
    'next/server': { NextResponse: Response }, '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/sequence-engine': {}, '@/lib/pipeline-guard': { atorDaSessao: async () => ({ id: 'synthetic-buyer' }), podeOperarQuadro: async () => true }
  }); const res = await GET({}, { params: Promise.resolve({ id: 'synthetic-pipe' }) }); return { status: res.status, body: await res.json() };
}
test('desktop renders last follow-up when provided', () => { const html = desktop(fu); assert.match(html, /Ligação/); assert.match(html, /14\/09 10:35 AM/); });
test('mobile must render last follow-up supplied by API (regression assertion)', () => { const html = mobile(); assert.match(html, /Synthetic Test/); assert.ok(html.includes('Ligação'), 'Mobile contains lead but drops supplied follow-up label and date'); });
test('healthy API preserves last follow-up', async () => { const r = await api(false); assert.equal(r.status, 200); assert.equal(r.body.leads[0].last_follow_up.type, 'call'); });
test('API must not disguise follow-up query failure as success (regression assertion)', async () => { const r = await api(true); assert.notEqual(r.status, 200, 'Query error is silently reported as successful empty follow-up'); });
// Query boundary fake: evaluates filters/order/ranges; no application DB imports.
function database(tables, failFollowUp = false) {
  const calls = [];
  return { calls, from(table) {
    const q = { table, eqs: [], orders: [], ids: null, start: 0, end: Infinity };
    const chain = {
      select() { return chain }, eq(k,v) { q.eqs.push([k,v]); return chain },
      in(k,ids) { q.ids = ids; return chain },
      order(k,o = {}) { q.orders.push([k,o.ascending !== false,o.nullsFirst !== false]); return chain },
      range(a,b) { q.start=a; q.end=b; return chain }, limit(n) { q.end=n-1; return chain },
      single() { q.single=true; return chain }, maybeSingle() { q.single=true; return chain },
      then(resolve,reject) {
        calls.push(q);
        if (table === 'follow_ups' && (failFollowUp || q.ids.length > 50)) return Promise.resolve({data:null,error:{message:'PRIVATE_DB_DETAIL'}}).then(resolve,reject);
        let rows = (tables[table] || []).filter(r => q.eqs.every(([k,v]) => k.includes('.') || r[k] === v));
        if (q.ids) rows = rows.filter(r => q.ids.includes(r.lead_id));
        rows.sort((a,b) => { for (const [k,asc,nullsFirst] of q.orders) { if (a[k] !== b[k]) { if (a[k] == null) return nullsFirst ? -1 : 1; if (b[k] == null) return nullsFirst ? 1 : -1; return (a[k] > b[k] ? 1 : -1)*(asc ? 1 : -1) } } return 0 });
        rows = rows.slice(q.start,q.end+1);
        return Promise.resolve({data:q.single ? rows[0] || null : rows,error:null}).then(resolve,reject);
      }
    }; return chain;
  }};
}
async function memberApi(db, caller = {id:'agency-a'}) {
  const { GET } = load('src/app/api/team/member-pipeline/route.ts', {
    'next/server': {NextResponse:Response}, '@/lib/supabase/admin': {createAdminClient:()=>db},
    '@/lib/locale': {getLocale:async()=> 'pt'}, '@/lib/pipeline-i18n':{localizePipeline:x=>x},
    '@/lib/api-auth': {callerBuyer:async()=>caller}, '@/lib/team-reclaim':{canReclaimTeamLead:()=>false}
  });
  const r=await GET({url:'http://local.invalid/api/team/member-pipeline?member_id=member-a'});
  return {status:r.status,body:await r.json()};
}
function memberTables(own = true) {
  return {
    team_members:[{id:'member-a',buyer_id:'agency-a',auth_user_id:own?'auth-a':null}],
    buyers:own?[{id:'buyer-a',auth_user_id:'auth-a'}]:[],
    pipelines:[{id:'pipe-a',buyer_id:'buyer-a',is_default:true,stages:[]}],
    pipeline_leads:[{...pl,pipeline_id:'pipe-a',lead:{...lead,assigned_to:'buyer-a'}}, {id:'foreign-pl',pipeline_id:'pipe-a',lead:{id:'foreign',assigned_to:'buyer-b'}}],
    leads:[{...lead,assigned_to_member:'member-a'},{id:'foreign',assigned_to_member:'member-b'}],
    follow_ups:[{id:'fu-a',lead_id:lead.id,...fu},{id:'fu-b',lead_id:'foreign',type:'PRIVATE',created_at:fu.created_at}]
  };
}
for (const own of [true,false]) {
  test(`member pipeline own=${own} returns sanitized error, not partial cards`,async()=>{
    const r=await memberApi(database(memberTables(own),true));
    assert.equal(r.status,503); assert.equal(r.body.code,'FOLLOW_UP_LOAD_FAILED'); assert.ok(!JSON.stringify(r).includes('PRIVATE_DB_DETAIL')); assert.equal(r.body.leads,undefined);
  });
  test(`member pipeline own=${own} queries only authorized leads`,async()=>{
    const db=database(memberTables(own)); const r=await memberApi(db);
    assert.equal(r.status,200); assert.equal(r.body.leads.length,1); assert.equal(r.body.leads[0].last_follow_up.type,'call');
    assert.deepEqual(db.calls.filter(q=>q.table==='follow_ups').flatMap(q=>Array.from(q.ids)),[lead.id]);
  });
}
test('unauthorized agency cannot read another member or follow-ups',async()=>{
  const db=database(memberTables()); const r=await memberApi(db,{id:'agency-b'});
  assert.equal(r.status,403); assert.ok(!db.calls.some(q=>q.table==='follow_ups'));
});
test('batches 121 leads, paginates dense history and chooses newest created activity',async()=>{
  const {latestPipelineFollowUps}=load('src/lib/pipeline-follow-ups.ts',{});
  const ids=Array.from({length:121},(_,i)=>`00000000-0000-0000-0000-${String(i).padStart(12,'0')}`);
  const rows=Array.from({length:1001},(_,i)=>({id:`dense-${i}`,lead_id:ids[0],...fu}));
  rows.push(...ids.slice(1).map((id,i)=>({id:`other-${i}`,lead_id:id,type:'note',created_at:'2026-01-01',scheduled_at:null})));
  rows.push({id:'old-scheduled',lead_id:ids[0],type:'meeting',created_at:'2025-01-01',scheduled_at:'2027-01-01'});
  const db=database({follow_ups:rows}); const result=await latestPipelineFollowUps(db,ids);
  assert.equal(Object.keys(result).length,121); assert.equal(result[ids[0]].type,'call');
  assert.ok(db.calls.every(q=>q.ids.length<=50)); assert.ok(db.calls.some(q=>q.start===1000));
  const empty=await latestPipelineFollowUps(database({follow_ups:rows}),['no-follow-up']); assert.equal(Object.keys(empty).length,0);
});

// Execute the real nested loader, replacing only browser IO and React setters.
function loader(file, name, context) {
  const source = fs.readFileSync(root+'/'+file,'utf8');
  const ast = ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let found;
  function visit(n) { if(ts.isFunctionDeclaration(n) && n.name?.text===name) found=n; ts.forEachChild(n,visit) }
  visit(ast); assert.ok(found,`loader ${name} exists`);
  const code=ts.transpileModule(found.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
  return vm.runInNewContext(code+';'+name,context);
}
for (const file of ['src/app/m/pipeline/page.tsx','src/app/dashboard/pipeline/page.tsx']) {
  for (const failure of ['http','network','malformed']) test(`${file} preserves previous cards on ${failure} and recovers`, async()=>{
    let cards=[pl],error=false,failed=true;
    const fn=loader(file,'loadLeads',{
      fetch:async()=>{if(failed&&failure==='network') throw Error('offline');return {ok:!failed||failure!=='http',json:async()=>failed?{error:'failed'}:{leads:[pl]}}},
      committedPipelineId:{current:'pipe-a'},setPendingPipelineId(){},pipelineRequest:{current:null},setBoard:x=>{cards=x.leads},setCards:x=>{cards=x},setLeads:x=>{cards=x},setErr:x=>{error=x},setLoadError:x=>{error=x}
    });
    const target = file.includes('/dashboard/') ? {id:'pipe-a'} : 'pipe-a';
    await fn(target); assert.equal(cards[0],pl); assert.equal(error,true);
    failed=false; await fn(target); assert.equal(cards[0],pl); assert.equal(error,false);
  });
}
test('member refresh failure preserves cards and selected identity',async()=>{
  let selected='member-a',cards=[pl],error=false;
  const fn=loader('src/app/dashboard/pipeline/page.tsx','loadMemberPipeline',{
    fetch:async()=>({ok:false,json:async()=>({error:'failed'})}),
    setLoadingMember(){},setSelectedMemberId:x=>{selected=x},setMemberPipeline(){},
    setMemberLeads:x=>{cards=x},setMemberHasOwn(){},setLoadError:x=>{error=x},memberRequest:{current:0}
  });
  await fn('member-b');assert.equal(selected,'member-a');assert.equal(cards[0],pl);assert.equal(error,true);
});

test('drag overlay forwards last follow-up to the rendered card',()=>{
  const file='src/app/dashboard/pipeline/page.tsx',source=fs.readFileSync(root+'/'+file,'utf8');
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let node;
  function visit(n){if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='LeadCard'&&n.getText(ast).includes('activeCard'))node=n;ts.forEachChild(n,visit)}visit(ast);assert.ok(node);
  const code=ts.transpileModule('const output = '+node.getText(ast),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS}}).outputText;
  const el=vm.runInNewContext(code+';output',{React,LeadCard,activeCard:pl});
  assert.match(renderToStaticMarkup(el),/Ligação/);
});

async function pipelineApi(db, allowed = true, actor = {id:'buyer-a'}) {
  const {GET}=load('src/app/api/pipelines/[id]/leads/route.ts',{
    'next/server':{NextResponse:Response},'@/lib/supabase/admin':{createAdminClient:()=>db},
    '@/lib/sequence-engine':{},'@/lib/pipeline-guard':{atorDaSessao:async()=>actor,podeOperarQuadro:async()=>allowed}
  });const r=await GET({}, {params:Promise.resolve({id:'pipe-a'})});return {status:r.status,body:await r.json()};
}
test('regular pipeline batches all visible leads, preserves order and excludes other clients',async()=>{
  const tables=memberTables();
  tables.pipeline_leads=Array.from({length:121},(_,i)=>({...pl,id:`pl-${i}`,pipeline_id:'pipe-a',lead:{...lead,id:`lead-${i}`}}));
  tables.pipeline_leads.push({...pl,id:'other-pl',pipeline_id:'pipe-b',lead:{...lead,id:'foreign'}});
  tables.follow_ups=tables.pipeline_leads.map((p,i)=>({id:`fu-${i}`,lead_id:p.lead.id,...fu}));
  const db=database(tables),r=await pipelineApi(db);
  assert.equal(r.status,200);assert.equal(r.body.leads.length,121);
  assert.deepEqual(r.body.leads.map(p=>p.id),tables.pipeline_leads.slice(0,121).map(p=>p.id));
  assert.ok(r.body.leads.every(p=>p.last_follow_up.type==='call'));
  assert.ok(db.calls.filter(q=>q.table==='follow_ups').every(q=>q.ids.length<=50&&!q.ids.includes('foreign')));
});
for (const [actor,allowed,status] of [[null,true,401],[{id:'buyer-b'},false,403]]) test(`regular pipeline denies unauthorized caller (${status}) before follow-ups`,async()=>{
  const db=database(memberTables());const r=await pipelineApi(db,allowed,actor);
  assert.equal(r.status,status);assert.ok(!db.calls.some(q=>q.table==='follow_ups'));
});
test('follow-up failure after a full first page rejects the entire result',async()=>{
  const tables=memberTables();tables.pipeline_leads.push({...pl,id:'second',pipeline_id:'pipe-a',lead:{...lead,id:'second-lead'}});
  const base=database(tables),db={from(table){
    if(table!=='follow_ups')return base.from(table);
    let offset=0;const chain={select(){return chain},in(){return chain},order(){return chain},range(n){offset=n;return chain},then(resolve,reject){
      return Promise.resolve(offset?{data:null,error:{message:'PRIVATE_DETAIL'}}:{data:Array.from({length:1000},(_,i)=>({id:`fu-${i}`,lead_id:lead.id,...fu})),error:null}).then(resolve,reject)
    }};return chain;
  }};
  const r=await pipelineApi(db);assert.equal(r.status,503);assert.equal(r.body.leads,undefined);assert.ok(!JSON.stringify(r).includes('PRIVATE_DETAIL'));
});
test('empty follow-ups are genuine nulls, not errors',async()=>{
  const tables=memberTables();tables.follow_ups=[];
  const r=await pipelineApi(database(tables));assert.equal(r.status,200);assert.ok(r.body.leads.every(p=>p.last_follow_up===null));
});
test('member responses finishing out of order cannot replace the latest selected identity',async()=>{
  const pending={},selected=[];
  const fn=loader('src/app/dashboard/pipeline/page.tsx','loadMemberPipeline',{
    fetch:url=>new Promise(resolve=>{pending[url.split('=')[1]]=resolve}),
    setLoadingMember(){},setSelectedMemberId:x=>selected.push(x),setMemberPipeline(){},setMemberLeads(){},setMemberHasOwn(){},setLoadError(){},memberRequest:{current:0}
  });
  const a=fn('member-a'),b=fn('member-b');
  pending['member-b']({ok:true,json:async()=>({pipeline:{id:'pipe-b'},leads:[]})});await b;
  pending['member-a']({ok:true,json:async()=>({pipeline:{id:'pipe-a'},leads:[pl]})});await a;
  assert.deepEqual(selected,['member-b']);
});
for(const [locale,label] of [['pt','Ligação'],['en','Call'],['es','Llamada']])test(`badge locale ${locale}, Eastern time, scheduled date and absent activity`,()=>{
  const {FollowUpBadge}=load('src/components/follow-up-badge.tsx',{});
  const render=value=>renderToStaticMarkup(React.createElement(FollowUpBadge,{lastFollowUp:value,locale}));
  assert.match(render(fu),new RegExp(label));assert.match(render(fu),/10:35 AM/);
  assert.match(render({...fu,scheduled_at:'2026-09-15T16:00:00Z'}),/12:00 PM/);
  assert.equal(render(null),'');
});

for(const own of [true,false])test(`member own=${own} lead-query error cannot empty pipeline`,async()=>{
  const base=database(memberTables(own));const db={from(table){
    if(table!==(own?'pipeline_leads':'leads'))return base.from(table);
    const chain={select(){return chain},eq(){return chain},order(){return chain},limit(){return chain},then(resolve,reject){return Promise.resolve({data:null,error:{message:'PRIVATE_DETAIL'}}).then(resolve,reject)}};return chain;
  }};
  const r=await memberApi(db);assert.equal(r.status,503);assert.equal(r.body.leads,undefined);assert.ok(!JSON.stringify(r).includes('PRIVATE_DETAIL'));
});

test('pseudo pipeline preserves its scheduled-first follow-up ordering',async()=>{
  const tables=memberTables(false);
  tables.follow_ups.push({id:'scheduled',lead_id:lead.id,type:'meeting',created_at:'2025-01-01',scheduled_at:'2027-01-01'});
  const r=await memberApi(database(tables));assert.equal(r.status,200);assert.equal(r.body.leads[0].last_follow_up.type,'meeting');
});

// Stateful composition harness: execute the whole page, its selector and loaders,
// then inspect the actual rendered columns/items (not setter call expectations).
function pipelinePage() {
  const file = 'src/app/dashboard/pipeline/page.tsx';
  const source = fs.readFileSync(root + '/' + file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = [];
  function visit(n) {
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isCallExpression(n.initializer) && n.initializer.expression.getText(ast) === 'useState') names.push(n.name.elements[0].getText(ast));
    ts.forEachChild(n, visit);
  }
  visit(ast);
  const pipes = ['a', 'b', 'c'].map(id => ({ id, name: `Pipeline ${id}`, stages: [{ ...stage, id: `stage-${id}`, name: `Stage ${id}` }] }));
  const card = id => ({ ...pl, id: `card-${id}`, stage_id: `stage-${id}`, lead: { ...lead, id: `lead-${id}`, name: `Lead ${id}` } });
  const state = { pipelines: pipes, activePipeline: pipes[0], leads: [card('a')], board: { pipeline: pipes[0], leads: [card('a')] }, loading: false, buyerId: 'buyer-a' };
  const refs = [], requests = [], realtime = [];
  let si = 0, ri = 0;
  const Column = () => null;
  const { default: Page } = load(file, {
    ...common, '@/lib/i18n-client': { useT: () => ({ ...t, pipeline: {} }) },
    react: {
      useState(initial) { const name = names[si++]; if (!Object.hasOwn(state, name)) state[name] = initial; return [state[name], value => { state[name] = typeof value === 'function' ? value(state[name]) : value; }]; },
      useRef(initial) { const i = ri++; return refs[i] ||= { current: initial }; },
      useEffect() {}, useCallback: fn => fn,
    },
    '@dnd-kit/core': { DndContext: () => null, DragOverlay: () => null, useSensor() {}, useSensors() {} },
    './kanban-column': { KanbanColumn: Column }, './lead-card': { LeadCard }, './lead-modal': { LeadModal: () => null },
    '@/lib/use-realtime': { useRealtime: (...args) => realtime.push(args) }, '@/lib/stale-leads': { isStale: () => false },
    'next/link': { default: () => null },
  }, { fetch: url => new Promise(resolve => requests.push({ url, resolve })) });
  function render() {
    si = 0; ri = 0; realtime.length = 0;
    const nodes = [];
    function walk(n) { if (Array.isArray(n)) return n.forEach(walk); if (!n || typeof n !== 'object') return; nodes.push(n); walk(n.props?.children); }
    walk(Page());
    const columns = nodes.filter(n => n.type === Column);
    return { columns, visible: columns.flatMap(n => Array.from(n.props.items, item => item.lead.name)),
      stages: columns.map(n => n.props.stage.id), alert: nodes.some(n => n.props?.role === 'alert'),
      retry: nodes.find(n => n.type === 'button' && n.props.children === 'Tentar novamente'),
      selector: nodes.find(n => n.type === 'select' && n.props.children?.length === pipes.length) };
  }
  return { render, requests, card, state,
    select(id) { render().selector.props.onChange({ target: { value: id } }); },
    refresh() { render(); realtime[0][3](); },
    async respond(index, id, ok = true, name) { requests[index].resolve({ ok, json: async () => ok ? { leads: [{ ...card(id), lead: { ...card(id).lead, name: name || `Lead ${id}` } }] } : { code: 'FOLLOW_UP_LOAD_FAILED' } }); await new Promise(resolve => setImmediate(resolve)); },
  };
}
test('first-load failure with one pipeline can retry without an active board or selector', async () => {
  const page = pipelinePage();
  page.state.board = { pipeline: null, leads: [] };
  page.state.pipelines = [page.state.pipelines[0]];
  page.state.loadError = true;
  assert.deepEqual(page.render().visible, []);
  assert.ok(page.render().retry, 'failed initial request needs a recovery action');
  page.render().retry.props.onClick();
  await page.respond(0, 'a');
  assert.deepEqual(page.render().stages, ['stage-a']);
  assert.deepEqual(page.render().visible, ['Lead a']);
  assert.equal(page.render().alert, false);
});
test('pipeline selector A -> B HTTP 503 keeps A columns and cards visible', async () => {
  const page = pipelinePage();
  assert.deepEqual(page.render().visible, ['Lead a']);
  page.select('b');
  await page.respond(0, 'b', false);
  const rendered = page.render();
  assert.deepEqual(rendered.stages, ['stage-a']);
  assert.deepEqual(rendered.visible, ['Lead a']);
  assert.equal(rendered.selector.props.value, 'a');
  assert.equal(rendered.alert, true);
});
test('pipeline selection ignores out-of-order success and changes columns/cards together', async () => {
  const page = pipelinePage();
  page.select('b');
  assert.deepEqual(page.render().stages, ['stage-a']);
  assert.deepEqual(page.render().visible, ['Lead a']);
  page.select('c');
  await page.respond(1, 'c');
  assert.deepEqual(page.render().stages, ['stage-c']);
  assert.deepEqual(page.render().visible, ['Lead c']);
  await page.respond(0, 'b');
  assert.deepEqual(page.render().stages, ['stage-c']);
  assert.deepEqual(page.render().visible, ['Lead c']);
  assert.equal(page.render().selector.props.value, 'c');
});
test('background refresh of A cannot cancel a pending explicit selection of B', async () => {
  const page = pipelinePage();
  page.select('b');
  page.refresh();
  await page.respond(0, 'b');
  assert.deepEqual(page.render().stages, ['stage-b']);
  assert.deepEqual(page.render().visible, ['Lead b']);
});
test('pending selector can return to A and late B cannot replace the visible board', async () => {
  const page = pipelinePage();
  page.select('b');
  assert.equal(page.render().selector.props.value, 'b', 'pending option must differ so selecting A fires change');
  page.select('a');
  await page.respond(1, 'a');
  await page.respond(0, 'b');
  assert.deepEqual(page.render().stages, ['stage-a']);
  assert.deepEqual(page.render().visible, ['Lead a']);
  assert.equal(page.render().selector.props.value, 'a');
});

test('A -> B success after failure commits both columns/cards and clears error without resetting filters', async () => {
  const page = pipelinePage();
  page.state.search = 'Lead';
  page.select('b');
  await page.respond(0, 'b', false);
  page.select('b');
  assert.deepEqual(page.render().visible, ['Lead a']);
  await page.respond(1, 'b');
  assert.deepEqual(page.render().stages, ['stage-b']);
  assert.deepEqual(page.render().visible, ['Lead b']);
  assert.equal(page.render().alert, false);
  assert.equal(page.state.search, 'Lead');
  page.state.search = 'Lead a';
  assert.deepEqual(page.render().visible, []);
});
for (const oldSuccess of [true, false]) test(`A -> B -> A -> B ignores old same-ID response (success=${oldSuccess})`, async () => {
  const page = pipelinePage();
  page.select('b'); page.select('a'); page.select('b');
  await page.respond(2, 'b', true, 'Lead b latest');
  await page.respond(0, 'b', oldSuccess, 'Lead b obsolete');
  await page.respond(1, 'a');
  assert.deepEqual(page.render().stages, ['stage-b']);
  assert.deepEqual(page.render().visible, ['Lead b latest']);
  assert.equal(page.render().alert, false);
});
test('latest selection failure cannot be erased by an older successful response', async () => {
  const page = pipelinePage();
  page.select('b'); page.select('c');
  await page.respond(1, 'c', false);
  await page.respond(0, 'b');
  assert.deepEqual(page.render().stages, ['stage-a']);
  assert.deepEqual(page.render().visible, ['Lead a']);
  assert.equal(page.render().selector.props.value, 'a');
  assert.equal(page.render().alert, true);
  page.refresh();
  await page.respond(2, 'a', true, 'Lead a refreshed');
  assert.deepEqual(page.render().visible, ['Lead a refreshed']);
  assert.equal(page.render().alert, false);
});
test('callbacks from the old board cannot switch back after B commits; current callbacks still refresh', async () => {
  const page = pipelinePage();
  const oldColumn = page.render().columns[0];
  page.select('b'); await page.respond(0, 'b');
  oldColumn.props.onAssigned();
  oldColumn.props.onArchived();
  page.render().columns[0].props.onArchived();
  assert.equal(page.requests[1].url, '/api/pipelines/b/leads');
  await page.respond(1, 'b', true, 'Lead b refreshed');
  assert.deepEqual(page.render().stages, ['stage-b']);
  assert.deepEqual(page.render().visible, ['Lead b refreshed']);
});
