import React from 'react'
import { createRoot } from 'react-dom/client'
import { LeadModal } from '@/app/dashboard/pipeline/lead-modal'
import { AddExistingLeadToPipeline } from '@/components/add-existing-lead-to-pipeline'

declare global { interface Window { saved: number } }
window.saved = 0
const id = '00000000-0000-4000-8000-000000000002'
// Keep the modal open to observe its state; the real board's onSaved closes it
// and reloads cards. Counting this callback verifies that invalidation boundary.
createRoot(document.getElementById('root')!).render(location.pathname === '/modal'
  ? <LeadModal leadId={id} buyerId="00000000-0000-4000-8000-000000000001" onClose={() => {}} onSaved={() => { window.saved++ }} />
  : <AddExistingLeadToPipeline key={id} leadId={id} />)
