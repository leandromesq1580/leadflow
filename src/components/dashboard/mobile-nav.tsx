'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'

/**
 * ☰ Menu do dashboard no CELULAR — o sidebar some abaixo de md e o usuário ficava sem navegação.
 * Botão flutuante (inferior-esquerdo, espelhando a Zoe) que abre o menu completo como gaveta.
 */
export function MobileNav(props: { userName?: string; isAgency?: boolean; buyerId?: string; crmPlan?: string; isAdmin?: boolean; podeVerApolices?: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Menu"
          className="md:hidden flex items-center gap-2 px-5 py-3 rounded-full text-[14px] font-bold"
          style={{ position: 'fixed', left: 20, bottom: 24, zIndex: 69, background: '#0f172a', color: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,0.35)', border: 'none', cursor: 'pointer' }}>
          ☰ Menu
        </button>
      )}
      {open && (
        <div className="md:hidden" style={{ position: 'fixed', inset: 0, zIndex: 90 }}>
          <div onClick={() => setOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.55)' }} />
          <div
            onClick={e => { const t = e.target as HTMLElement; if (t.closest('a')) setOpen(false) }}
            style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 272, overflowY: 'auto', background: '#fff', boxShadow: '8px 0 30px rgba(15,23,42,0.25)' }}>
            <Sidebar type="buyer" userName={props.userName} isAgency={props.isAgency} buyerId={props.buyerId} crmPlan={props.crmPlan} isAdmin={props.isAdmin} podeVerApolices={props.podeVerApolices} />
          </div>
          <button onClick={() => setOpen(false)} aria-label="Fechar menu"
            style={{ position: 'absolute', top: 14, left: 284, zIndex: 91, width: 36, height: 36, borderRadius: 999, background: 'rgba(255,255,255,0.92)', border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
            ✕
          </button>
        </div>
      )}
    </>
  )
}
