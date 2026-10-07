import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LeadModal } from '@/app/dashboard/pipeline/lead-modal'
function Fixture() {
  const [selection, select] = useState({ leadId: 'lead-a', buyerId: 'self' })
  const [open, setOpen] = useState(true)
  return <>
    <button onClick={() => select({ leadId: 'lead-b', buyerId: 'self' })}>Selecionar B</button>
    <button onClick={() => select({ leadId: 'lead-a', buyerId: 'other-buyer' })}>Trocar comprador</button>
    <button onClick={() => setOpen(false)}>Desmontar</button>
    {open && <LeadModal {...selection} onClose={() => setOpen(false)} onSaved={() => { throw Error('Read-only fixture cannot save') }} />}
  </>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
