'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n-client'
import { MIcon } from '@/components/mobile/icons'
import { AssignSheet } from '@/components/mobile/assign-sheet'
import { getInitials, statusLabel, timeAgo } from '@/lib/utils'

interface Lead {
  id: string; name: string; email: string; phone: string; city: string; state: string
  status: string; interest: string; type: string; campaign_name: string; created_at: string
  assigned_to_member?: string | null
  activities?: Array<{ id: string; action: string; notes?: string; created_at: string }>
}

function avatarBg(name: string) {
  const h = ((name?.charCodeAt(0) || 65) * 37) % 360
  return `linear-gradient(135deg, hsl(${h}, 62%, 52%), hsl(${(h + 40) % 360}, 62%, 46%))`
}

export default function MobileLeadDetail() {
  const t = useT()
  const loc = t._locale
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string
  const [lead, setLead] = useState<Lead | null>(null)
  const [err, setErr] = useState(false)
  const [isAgency, setIsAgency] = useState(false)
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    if (!id) return
    fetch(`/api/leads/${id}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setLead(d.lead))
      .catch(() => setErr(true))
    fetch('/api/m/team-context', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) { setIsAgency(!!d.is_agency); setMembers(d.members || []) } })
      .catch(() => {})
  }, [id])

  const phoneDigits = (lead?.phone || '').replace(/\D/g, '')
  const L = (pt: string, en: string, es: string) => (loc === 'en' ? en : loc === 'es' ? es : pt)

  return (
    <div>
      <div className="m-pad" style={{ paddingTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 44 }}>
        <button onClick={() => router.back()} className="m-tap" style={{ background: 'none', border: 'none', color: 'var(--m-text)', display: 'flex', cursor: 'pointer', padding: 0 }}>
          <MIcon name="arrowLeft" size={24} />
        </button>
        <span className="m-muted" style={{ fontSize: 13, fontWeight: 600 }}>Lead</span>
        <span style={{ width: 24 }} />
      </div>

      {!lead && !err && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 100 }}><div className="m-spin" /></div>}
      {err && <p className="m-muted" style={{ textAlign: 'center', paddingTop: 80 }}>{L('Lead não encontrado.', 'Lead not found.', 'Lead no encontrado.')}</p>}

      {lead && (
        <div className="m-pad">
          {/* Cabeçalho */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div className="m-av" style={{ width: 74, height: 74, fontSize: 24, margin: '0 auto 12px', background: avatarBg(lead.name), boxShadow: '0 14px 34px -12px rgba(99,102,241,0.7)' }}>{getInitials(lead.name)}</div>
            <p style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>{lead.name}</p>
            <p className="m-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{lead.phone || lead.email || '—'}</p>
            <div style={{ display: 'flex', gap: 7, justifyContent: 'center', marginTop: 13, flexWrap: 'wrap' }}>
              {lead.state && <span className="m-chip">{lead.state}</span>}
              {lead.interest && <span className="m-chip">{lead.interest}</span>}
              <span className="m-chip on">{statusLabel(lead.status)}</span>
            </div>
          </div>

          {/* Ações */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
            <a href={phoneDigits ? `tel:${phoneDigits}` : undefined} className="m-link m-tap" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', padding: '13px 0', borderRadius: 15, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 12, fontWeight: 600, opacity: phoneDigits ? 1 : 0.4 }}>
              <span style={{ color: '#a5b4fc', display: 'flex' }}><MIcon name="phone" size={20} /></span>{L('Ligar', 'Call', 'Llamar')}
            </a>
            <a href={phoneDigits ? `https://wa.me/${phoneDigits}` : undefined} target="_blank" rel="noreferrer" className="m-link m-tap" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', padding: '13px 0', borderRadius: 15, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', fontSize: 12, fontWeight: 600, opacity: phoneDigits ? 1 : 0.4 }}>
              <span style={{ color: '#34d399', display: 'flex' }}><MIcon name="whatsapp" size={20} /></span>WhatsApp
            </a>
            <a href={lead.email ? `mailto:${lead.email}` : undefined} className="m-link m-tap" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', padding: '13px 0', borderRadius: 15, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 12, fontWeight: 600, opacity: lead.email ? 1 : 0.4 }}>
              <span style={{ color: '#c084fc', display: 'flex' }}><MIcon name="message" size={20} /></span>Email
            </a>
          </div>

          {/* Redirecionar pra membro do time (paridade com o AssignButton do desktop) */}
          {isAgency && members.length > 0 && (
            <button onClick={() => setSheetOpen(true)} className="m-tap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '13px 16px', borderRadius: 15, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: 'var(--m-text)', cursor: 'pointer', marginBottom: 22 }}>
              <span style={{ color: '#a5b4fc', display: 'flex' }}><MIcon name="userPlus" size={18} /></span>
              <span style={{ flex: 1, textAlign: 'left', fontSize: 14, fontWeight: 600 }}>{L('Redirecionar pra…', 'Reassign to…', 'Redirigir a…')}</span>
              <span className="m-muted" style={{ fontSize: 13, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{members.find(m => m.id === lead.assigned_to_member)?.name || L('ninguém', 'no one', 'nadie')}</span>
              <span className="m-faint" style={{ display: 'flex' }}><MIcon name="chevron" size={16} /></span>
            </button>
          )}

          {/* Detalhes */}
          <div className="m-card" style={{ padding: '3px 16px', marginBottom: 18 }}>
            {[
              [L('Telefone', 'Phone', 'Teléfono'), lead.phone || '—'],
              [L('E-mail', 'Email', 'Correo'), lead.email || '—'],
              [L('Cidade', 'City', 'Ciudad'), [lead.city, lead.state].filter(Boolean).join(', ') || '—'],
              [L('Interesse', 'Interest', 'Interés'), lead.interest || '—'],
              [L('Origem', 'Source', 'Origen'), lead.campaign_name || '—'],
              [L('Recebido', 'Received', 'Recibido'), timeAgo(lead.created_at)],
            ].map(([k, v], i, arr) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                <span className="m-muted" style={{ fontSize: 13 }}>{k}</span>
                <span style={{ fontSize: 13, fontWeight: 500, maxWidth: '60%', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Atividades */}
          {!!lead.activities?.length && (
            <>
              <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 11px' }} className="m-muted">{L('Histórico', 'History', 'Historial')}</p>
              {lead.activities.slice(0, 8).map(a => (
                <div key={a.id} className="m-card" style={{ padding: 13, marginBottom: 9, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="m-icb"><MIcon name="clock" size={16} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{statusLabel(a.action)}</p>
                    {a.notes && <p className="m-muted" style={{ margin: '2px 0 0', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.notes}</p>}
                  </div>
                  <span className="m-faint" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{timeAgo(a.created_at)}</span>
                </div>
              ))}
            </>
          )}

          {sheetOpen && (
            <AssignSheet
              leadId={lead.id}
              leadName={lead.name}
              members={members}
              currentMemberId={lead.assigned_to_member}
              locale={loc}
              onClose={() => setSheetOpen(false)}
              onDone={(mid) => setLead(prev => prev ? { ...prev, assigned_to_member: mid } : prev)}
            />
          )}
        </div>
      )}
    </div>
  )
}
