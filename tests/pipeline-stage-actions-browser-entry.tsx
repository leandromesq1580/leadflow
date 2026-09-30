import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import DashboardPipelinePage from '../src/app/dashboard/pipeline/page'
import MobileSequencesPage from '../src/app/m/sequences/page'
import LegacyMobileAutomationsPage from '../src/app/m/automacoes/page'
import MobileAutomationsPage from '../src/app/m/automations/page'
import MobilePipelinePage from '../src/app/m/pipeline/page'
import SequencesPage from '../src/app/dashboard/sequences/page'
import AutomationsPage from '../src/app/dashboard/automations/page'
import { KanbanColumn } from '../src/app/dashboard/pipeline/kanban-column'
import { useStageActions } from '../src/lib/use-stage-actions'
import { I18nProvider } from '../src/lib/i18n-client'
const nativeFetch=window.fetch.bind(window)
window.fetch=(input,init)=>nativeFetch(input,{...init,signal:undefined})
function Board(){
 const [pipeline,setPipeline]=useState('11111111-1111-1111-1111-111111111111')
 const actions=useStageActions(pipeline)
 return <><button onClick={()=>setPipeline(pipeline==='11111111-1111-1111-1111-111111111111'?'22222222-2222-2222-2222-222222222222':'11111111-1111-1111-1111-111111111111')}>Switch fixture</button><div data-fixture-board style={{display:'flex',gap:16,overflow:'auto',height:650}}>{['Novo lead','Sem ações','Só inativas','Contato','Agendado','Proposta','Negociação com um título muito longo para testar truncamento','Fechado'].map((name,i)=><KanbanColumn key={i} stage={{id:['stage','empty','inactive','seq-only','auto-only','mixed','long','won'][i],name,color:['#6366f1','#64748b','#f59e0b','#06b6d4','#a855f7','#f97316','#ec4899','#22c55e'][i],position:i}} items={[{id:'card-'+i,stage_id:'fixture',lead:{id:'lead-'+i,name:'Lead exemplo '+(i+1),phone:'',state:'FL',interest:'Fixture sem dados pessoais',type:'manual',created_at:'2026-09-30T12:00:00Z',contract_closed:false}}]} onLeadClick={()=>{}} actions={actions} returnTo="/m/pipeline" />)}</div></>
}
const Page=location.pathname==='/m/automacoes'?LegacyMobileAutomationsPage:location.pathname==='/dashboard/pipeline'?DashboardPipelinePage:location.pathname==='/m/sequences'?MobileSequencesPage:location.pathname==='/m/automations'?MobileAutomationsPage:location.pathname==='/m/pipeline'?MobilePipelinePage:location.pathname.includes('sequences')?SequencesPage:location.pathname.includes('automations')?AutomationsPage:Board
const locale = new URLSearchParams(location.search).get('locale')
createRoot(document.getElementById('root')!).render(<React.StrictMode><I18nProvider locale={locale === 'en' || locale === 'es' ? locale : 'pt'}><main style={{padding:12}}><Page/></main></I18nProvider></React.StrictMode>)
