import React from 'react'
import { createRoot } from 'react-dom/client'
import MobileLeadDetail from '@/app/m/leads/[id]/page'
import { AddExistingLeadToPipeline } from '@/components/add-existing-lead-to-pipeline'
createRoot(document.getElementById('root')!).render(location.pathname.startsWith('/m/') ? <MobileLeadDetail /> : <AddExistingLeadToPipeline leadId="00000000-0000-4000-8000-000000000002" />)
