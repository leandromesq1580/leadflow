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
 return <><button onClick={()=>setPipeline(pipeline==='11111111-1111-1111-1111-111111111111'?'22222222-2222-2222-2222-222222222222':'11111111-1111-1111-1111-111111111111')}>Switch fixture</button><KanbanColumn stage={{id:'stage',name:'Novo lead',color:'#6366f1',position:0}} items={[]} onLeadClick={()=>{}} actions={actions} returnTo="/m/pipeline" /></>
}
const Page=location.pathname==='/m/automacoes'?LegacyMobileAutomationsPage:location.pathname==='/dashboard/pipeline'?DashboardPipelinePage:location.pathname==='/m/sequences'?MobileSequencesPage:location.pathname==='/m/automations'?MobileAutomationsPage:location.pathname==='/m/pipeline'?MobilePipelinePage:location.pathname.includes('sequences')?SequencesPage:location.pathname.includes('automations')?AutomationsPage:Board
createRoot(document.getElementById('root')!).render(<React.StrictMode><I18nProvider locale="pt"><main style={{padding:12}}><Page/></main></I18nProvider></React.StrictMode>)
