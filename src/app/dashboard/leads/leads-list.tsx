'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { timeAgo, getInitials } from '@/lib/utils'
import { AssignButton } from './assign-button'

interface Lead {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  city?: string | null
  state?: string | null
  interest?: string | null
  status: string
  created_at: string
  assigned_to_member?: string | null
  member?: { id: string; name: string } | null
}

interface Props {
  leads: Lead[]
  isAgency: boolean
  teamMembers: { id: string; name: string }[]
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function digits(s: string) {
  return s.replace(/\D/g, '')
}

export function LeadsList({ leads, isAgency, teamMembers }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return leads
    const qn = normalize(q)
    const qd = digits(q)
    return leads.filter(l => {
      if (normalize(l.name).includes(qn)) return true
      if (l.email && normalize(l.email).includes(qn)) return true
      if (qd && l.phone && digits(l.phone).includes(qd)) return true
      return false
    })
  }, [leads, query])

  return (
    <>
      <div className="mb-4 relative">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#94a3b8' }}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome, telefone ou email..."
          className="w-full pl-11 pr-10 py-3 rounded-xl text-[13px] font-medium"
          style={{ background: '#fff', border: '1px solid #e8ecf4', color: '#1a1a2e' }}
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Limpar busca"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-slate-100"
            style={{ color: '#64748b' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
        {query && (
          <p className="mt-2 text-[12px]" style={{ color: '#64748b' }}>
            {filtered.length} resultado{filtered.length === 1 ? '' : 's'} para "{query}"
          </p>
        )}
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        {filtered.length > 0 ? (
          <div>
            {filtered.map((lead, i) => {
              const memberName = lead.member?.name || null
              return (
                <div
                  key={lead.id}
                  className="flex items-center gap-4 px-6 py-4"
                  style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                >
                  <Link href={`/dashboard/leads/${lead.id}`} className="flex items-center gap-4 flex-1 min-w-0 group">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
                      style={{ background: `hsl(${(lead.name.charCodeAt(0) * 37) % 360}, 65%, 55%)` }}>
                      {getInitials(lead.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold group-hover:text-indigo-600" style={{ color: '#1a1a2e' }}>{lead.name}</p>
                      <p className="text-[12px]" style={{ color: '#94a3b8' }}>{lead.city}{lead.state ? `, ${lead.state}` : ''} · {lead.interest}</p>
                    </div>
                    <div className="hidden sm:block">
                      <span className="text-[13px] font-semibold" style={{ color: '#6366f1' }}>{lead.phone}</span>
                    </div>
                  </Link>

                  {isAgency && teamMembers.length > 0 && (
                    <div className="w-[140px] flex-shrink-0">
                      <AssignButton leadId={lead.id} members={teamMembers} currentMember={memberName} />
                    </div>
                  )}

                  <Badge status={lead.status} />
                  <span className="text-[12px] whitespace-nowrap hidden md:block" style={{ color: '#94a3b8' }}>{timeAgo(lead.created_at)}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: '#f1f5f9' }}>
              <span className="text-3xl">🔍</span>
            </div>
            <p className="text-[15px] font-semibold" style={{ color: '#1a1a2e' }}>
              {query ? 'Nenhum lead encontrado' : 'Nenhum lead ainda'}
            </p>
            <p className="text-[13px] mt-1" style={{ color: '#94a3b8' }}>
              {query ? `Tente outro termo — nome, telefone ou email` : 'Leads aparecem aqui quando sao distribuidos pra voce'}
            </p>
          </div>
        )}
      </div>
    </>
  )
}
