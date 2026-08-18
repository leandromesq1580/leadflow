'use client'

import { useMemo, useState } from 'react'
import { money, type Policy } from '@/lib/insurance-policies'
import type {
  PolicyPortalSnapshot,
  PortalClientIntelligenceEvent,
  PortalNewBusinessCase,
} from '@/lib/policy-portal'
import { useT } from '@/lib/i18n-client'

type PortalView = 'new_business' | 'client_intelligence'
type NbFilter = 'all' | 'pending' | 'at_risk' | 'requirements' | 'edelivery'

const CI_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  all: { label: 'Todos', icon: '📋', color: '#0369a1' },
  commission_impact: { label: 'Impacto na comissão', icon: '💸', color: '#b91c1c' },
  conservation: { label: 'Conservação', icon: '🤲', color: '#c2410c' },
  claims: { label: 'Sinistros', icon: '🛡️', color: '#64748b' },
  client_service: { label: 'Atendimento ao cliente', icon: '⚙️', color: '#b45309' },
  disbursements: { label: 'Desembolsos', icon: '🧾', color: '#64748b' },
  life_event: { label: 'Eventos de vida', icon: '📅', color: '#4d7c0f' },
  new_business: { label: 'New Business', icon: '📄', color: '#64748b' },
  payments: { label: 'Pagamentos', icon: '💲', color: '#1e3a5f' },
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map(row => row.map(csvCell).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function PolicyPortalCenter({
  snapshot,
  policies,
  view,
  search,
  onEdit,
  onToggleDone,
}: {
  snapshot: PolicyPortalSnapshot | null
  policies: Policy[]
  view: PortalView
  search: string
  onEdit: (policy: Policy) => void
  onToggleDone: (policy: Policy) => void
}) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const policyById = useMemo(() => new Map(policies.map(policy => [policy.id, policy])), [policies])

  if (!snapshot) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px dashed var(--border)' }}>
        <p className="text-[14px] font-bold" style={{ color: 'var(--fg)' }}>{L('Preparando os dados completos do portal…', 'Preparing complete portal data…', 'Preparando los datos completos del portal…')}</p>
        <p className="text-[12px] mt-1" style={{ color: 'var(--fg-muted)' }}>{L('Clique em Atualizar do portal se esta mensagem continuar aparecendo.', 'Click Refresh from portal if this message remains.', 'Haz clic en Actualizar del portal si este mensaje continúa.')}</p>
      </div>
    )
  }

  if (view === 'new_business') {
    return <NewBusinessPanel snapshot={snapshot} policyById={policyById} search={search} onEdit={onEdit} onToggleDone={onToggleDone} />
  }
  return <ClientIntelligencePanel snapshot={snapshot} policyById={policyById} search={search} onEdit={onEdit} />
}

function NewBusinessPanel({
  snapshot,
  policyById,
  search,
  onEdit,
  onToggleDone,
}: {
  snapshot: PolicyPortalSnapshot
  policyById: Map<string, Policy>
  search: string
  onEdit: (policy: Policy) => void
  onToggleDone: (policy: Policy) => void
}) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [filter, setFilter] = useState<NbFilter>('all')
  const [open, setOpen] = useState<string | null>(null)
  const metrics = snapshot.new_business.metrics
  const cards: Array<{ key: NbFilter | 'eft' | 'messages'; label: string; value: number; icon: string; color: string }> = [
    { key: 'all', label: L('Todos os casos', 'All cases', 'Todos los casos'), value: metrics.all, icon: '📋', color: '#0369a1' },
    { key: 'pending', label: L('Pending New Business', 'Pending New Business', 'New Business pendiente'), value: metrics.pending, icon: '🕘', color: '#0369a1' },
    { key: 'at_risk', label: L('Risco de chargeback', 'At risk of chargeback', 'Riesgo de chargeback'), value: metrics.at_risk_chargeback, icon: '⚠️', color: '#b91c1c' },
    { key: 'requirements', label: L('Requisitos pendentes', 'Pending requirements', 'Requisitos pendientes'), value: metrics.pending_requirements, icon: '📨', color: '#b45309' },
    { key: 'edelivery', label: L('eDelivery pendente', 'Outstanding eDelivery', 'eDelivery pendiente'), value: metrics.outstanding_edelivery, icon: '✍️', color: '#7c3aed' },
    { key: 'eft', label: L('EFT pendente', 'Pending EFT', 'EFT pendiente'), value: metrics.pending_eft, icon: '💳', color: '#64748b' },
    { key: 'messages', label: L('Mensagens não lidas', 'Unread messages', 'Mensajes no leídos'), value: metrics.unread_messages, icon: '💬', color: '#64748b' },
  ]

  const cases = useMemo(() => {
    const query = search.trim().toLowerCase()
    return snapshot.new_business.cases.filter(item => {
      if (query && !`${item.client_name} ${item.owner || ''} ${item.policy_number || ''} ${item.product || ''} ${item.case_manager || ''}`.toLowerCase().includes(query)) return false
      if (filter === 'pending') return /pending/i.test(item.portal_status || '')
      if (filter === 'at_risk') return item.at_risk_chargeback
      if (filter === 'requirements') return item.requirements.length > 0
      if (filter === 'edelivery') return /edelivery/i.test(item.delivery_status || '') && !/completed|locked/i.test(item.delivery_status || '')
      return true
    })
  }, [filter, search, snapshot.new_business.cases])

  const exportCases = () => downloadCsv('lead4pro-new-business.csv', [
    ['Cliente', 'Apólice', 'Status', 'Produto', 'Prêmio anual', 'Prêmio modal', 'Entrega', 'Case manager', 'Pendências'],
    ...cases.map(item => [item.client_name, item.policy_number || '', item.portal_status || '', item.product || '', item.annual_premium_cents ? money(item.annual_premium_cents) : '', item.modal_premium_cents ? money(item.modal_premium_cents) : '', item.delivery_status || '', item.case_manager || '', item.requirements.map(req => req.name).join('; ')]),
  ])

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-[19px] font-extrabold" style={{ color: 'var(--fg)' }}>New Business</h2>
          <p className="text-[12px]" style={{ color: 'var(--fg-muted)' }}>{L('Casos, entrega, underwriting e comunicações importados da National Life.', 'Cases, delivery, underwriting and communications imported from National Life.', 'Casos, entrega, underwriting y comunicaciones importados de National Life.')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCases} className="px-3 py-2 rounded-lg text-[12px] font-bold" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: '#0f766e' }}>⬇️ {L('Baixar CSV', 'Download CSV', 'Descargar CSV')}</button>
          <a href="https://www.nationallife.com/agent/book-of-business/new-business/all-new-business-cases" target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg text-[12px] font-bold" style={{ background: 'var(--bg-soft)', color: 'var(--fg-secondary)' }}>↗ {L('Abrir portal', 'Open portal', 'Abrir portal')}</a>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        {cards.map(card => {
          const clickable = ['all', 'pending', 'at_risk', 'requirements', 'edelivery'].includes(card.key)
          const active = filter === card.key
          return (
            <button key={card.key} disabled={!clickable} onClick={() => clickable && setFilter(card.key as NbFilter)}
              className="rounded-xl px-4 py-3 text-left disabled:cursor-default" style={{ background: active ? '#ecfeff' : 'var(--bg-card)', border: `1px solid ${active ? '#67e8f9' : 'var(--border)'}` }}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] font-semibold" style={{ color: 'var(--fg-secondary)' }}>{card.icon} {card.label}</span>
                <strong className="text-[24px]" style={{ color: card.color }}>{card.value}</strong>
              </div>
            </button>
          )
        })}
      </div>

      <div className="rounded-xl p-4 mb-4 flex items-center justify-between gap-4 flex-wrap" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <p className="text-[13px]" style={{ color: 'var(--fg-secondary)' }}>{L('Prêmio anual antecipado', 'Anticipated annual premium', 'Prima anual anticipada')} <strong style={{ color: 'var(--fg)' }}>{money(metrics.anticipated_annual_premium_cents)}</strong></p>
        <p className="text-[13px]" style={{ color: 'var(--fg-secondary)' }}>{L('Prêmio modal', 'Modal premium', 'Prima modal')} <strong style={{ color: 'var(--fg)' }}>{money(metrics.modal_premium_cents)}</strong></p>
        {!metrics.exact_portal_totals && <span className="text-[10px] px-2 py-1 rounded-md" style={{ color: '#92400e', background: '#fffbeb' }}>{L('totais calculados das linhas; o próximo acesso autenticado confirmará os cards do portal', 'totals calculated from rows; the next authenticated read will confirm portal cards', 'totales calculados de las filas; la próxima lectura autenticada confirmará las tarjetas')}</span>}
      </div>

      <p className="text-[12px] font-bold mb-2" style={{ color: 'var(--fg-muted)' }}>{cases.length} {L('caso(s) exibido(s)', 'case(s) shown', 'caso(s) mostrado(s)')}</p>
      <div className="space-y-3">
        {cases.map(item => <NewBusinessCaseCard key={`${item.policy_number}-${item.client_name}`} item={item} policy={item.policy_id ? policyById.get(item.policy_id) : undefined} open={open === `${item.policy_number}-${item.client_name}`} onOpen={() => setOpen(open === `${item.policy_number}-${item.client_name}` ? null : `${item.policy_number}-${item.client_name}`)} onEdit={onEdit} onToggleDone={onToggleDone} />)}
      </div>
    </div>
  )
}

function NewBusinessCaseCard({ item, policy, open, onOpen, onEdit, onToggleDone }: {
  item: PortalNewBusinessCase
  policy?: Policy
  open: boolean
  onOpen: () => void
  onEdit: (policy: Policy) => void
  onToggleDone: (policy: Policy) => void
}) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const phone = policy?.client_phone?.replace(/\D/g, '') || ''
  const urgent = item.at_risk_chargeback || item.requirements.length > 0
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: `4px solid ${item.at_risk_chargeback ? '#dc2626' : item.requirements.length ? '#d97706' : '#0ea5e9'}`, opacity: policy?.done_at ? .6 : 1 }}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <strong className="text-[14px]" style={{ color: 'var(--fg)' }}>{item.client_name}</strong>
            {item.portal_status && <span className="px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ background: urgent ? '#fff7ed' : '#eff6ff', color: urgent ? '#c2410c' : '#1d4ed8' }}>{item.portal_status}</span>}
            {item.at_risk_chargeback && <span className="px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ background: '#fef2f2', color: '#b91c1c' }}>⚠️ Chargeback</span>}
          </div>
          <p className="text-[11.5px] mt-1" style={{ color: 'var(--fg-muted)' }}>{[item.policy_number, item.product, item.modal_premium_cents ? `${money(item.modal_premium_cents)}/mês` : null, item.case_manager ? `Case manager: ${item.case_manager}` : null].filter(Boolean).join(' · ')}</p>
          <div className="flex gap-1.5 flex-wrap mt-2">
            {item.requirements.map(requirement => <span key={`${requirement.received_at}-${requirement.name}`} className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold" style={{ background: '#fffbeb', color: '#b45309' }}>⏳ {requirement.name}{requirement.received_at ? ` · ${requirement.received_at}` : ''}</span>)}
            {item.delivery_status && item.delivery_status !== '-' && <span className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold" style={{ background: '#f5f3ff', color: '#6d28d9' }}>📦 {item.delivery_status}</span>}
          </div>
        </div>
        <button onClick={onOpen} className="px-3 py-1.5 rounded-lg text-[11px] font-bold" style={{ background: 'var(--bg-soft)', color: 'var(--fg-secondary)' }}>{open ? L('Ocultar', 'Hide', 'Ocultar') : L('Ver tudo', 'View all', 'Ver todo')}</button>
      </div>

      <div className="flex gap-2 flex-wrap mt-3">
        {phone && <a href={`tel:${phone}`} className="px-3 py-1.5 rounded-lg text-[11px] font-bold" style={{ background: '#ecfdf5', color: '#047857' }}>📞 {L('Ligar', 'Call', 'Llamar')}</a>}
        {phone && <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg text-[11px] font-bold" style={{ background: '#dcfce7', color: '#15803d' }}>💬 WhatsApp</a>}
        {policy?.client_email && <a href={`mailto:${policy.client_email}`} className="px-3 py-1.5 rounded-lg text-[11px] font-bold" style={{ background: '#eef2ff', color: '#4f46e5' }}>✉️ E-mail</a>}
        {policy && <button onClick={() => onEdit(policy)} className="px-3 py-1.5 rounded-lg text-[11px] font-bold" style={{ background: 'var(--bg-soft)', color: 'var(--fg-secondary)' }}>✏️ {L('Editar ação/notas', 'Edit action/notes', 'Editar acción/notas')}</button>}
        {policy && <button onClick={() => onToggleDone(policy)} className="px-3 py-1.5 rounded-lg text-[11px] font-bold" style={{ background: policy.done_at ? '#f1f5f9' : '#ecfdf5', color: policy.done_at ? '#475569' : '#047857' }}>{policy.done_at ? L('↻ Reabrir ação', '↻ Reopen action', '↻ Reabrir acción') : L('✓ Concluir ação', '✓ Complete action', '✓ Completar acción')}</button>}
        {item.policy_number && <button onClick={() => navigator.clipboard.writeText(item.policy_number || '')} className="px-3 py-1.5 rounded-lg text-[11px] font-bold" style={{ background: 'var(--bg-soft)', color: 'var(--fg-secondary)' }}>⧉ {L('Copiar apólice', 'Copy policy', 'Copiar póliza')}</button>}
      </div>

      {open && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              [L('Enviada', 'Submitted', 'Enviada'), item.submitted_at],
              [L('Emitida/enviada', 'Issued/sent', 'Emitida/enviada'), item.sent_at],
              [L('Prêmio anual', 'Annual premium', 'Prima anual'), item.annual_premium_cents ? money(item.annual_premium_cents) : null],
              [L('Prêmio modal', 'Modal premium', 'Prima modal'), item.modal_premium_cents ? money(item.modal_premium_cents) : null],
              ['Underwriter', item.underwriter],
              [L('Progresso underwriting', 'Underwriting progress', 'Progreso underwriting'), item.underwriting_tracker],
              [L('Titular', 'Owner', 'Titular'), item.owner],
              ['Case manager', item.case_manager],
            ].filter(([, value]) => value).map(([label, value]) => <div key={String(label)}><p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>{label}</p><p className="text-[12px] font-semibold" style={{ color: 'var(--fg)' }}>{value}</p></div>)}
          </div>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--fg-muted)' }}>{L('Comunicação do caso', 'Case communication', 'Comunicación del caso')}</p>
          {item.communications.length ? <div className="space-y-2">{item.communications.map((communication, index) => <div key={`${communication.author}-${index}`} className="rounded-xl p-3" style={{ background: 'var(--bg-soft)' }}><p className="text-[10.5px] font-bold" style={{ color: '#4f46e5' }}>{communication.author || 'National Life'}{communication.sent_at ? ` · ${communication.sent_at}` : ''}</p><p className="text-[12px] mt-1 whitespace-pre-wrap" style={{ color: 'var(--fg-secondary)' }}>{communication.text}</p></div>)}</div> : <p className="text-[12px]" style={{ color: 'var(--fg-muted)' }}>{L('Nenhuma comunicação importada para este caso.', 'No communication imported for this case.', 'No se importó ninguna comunicación para este caso.')}</p>}
        </div>
      )}
    </div>
  )
}

function ClientIntelligencePanel({ snapshot, policyById, search, onEdit }: {
  snapshot: PolicyPortalSnapshot
  policyById: Map<string, Policy>
  search: string
  onEdit: (policy: Policy) => void
}) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const ci = snapshot.client_intelligence
  const [category, setCategory] = useState('all')
  const [showColumns, setShowColumns] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState<string[]>(ci.columns)
  const events = useMemo(() => {
    const query = search.trim().toLowerCase()
    return ci.events.filter(event => (category === 'all' || event.category === category || event.flags?.includes(category)) && (!query || `${event.client_name || ''} ${event.policy_number || ''} ${Object.values(event.columns).join(' ')}`.toLowerCase().includes(query)))
  }, [category, ci.events, search])

  const exportEvents = () => downloadCsv('lead4pro-client-intelligence.csv', [
    ['Categoria', 'Cliente', 'Apólice', ...visibleColumns],
    ...events.map(event => [[event.category, ...(event.flags || [])].join(' | '), event.client_name || '', event.policy_number || '', ...visibleColumns.map(column => event.columns[column] || '')]),
  ])

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div><h2 className="text-[19px] font-extrabold" style={{ color: 'var(--fg)' }}>Client Intelligence</h2><p className="text-[12px]" style={{ color: 'var(--fg-muted)' }}>{L('Eventos de comissão, conservação, atendimento, vida e pagamentos.', 'Commission, conservation, service, life and payment events.', 'Eventos de comisión, conservación, atención, vida y pagos.')}</p></div>
        <div className="flex gap-2 relative">
          <button onClick={exportEvents} disabled={!events.length} className="px-3 py-2 rounded-lg text-[12px] font-bold disabled:opacity-40" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: '#0f766e' }}>⬇️ {L('Download', 'Download', 'Descargar')}</button>
          <button onClick={() => setShowColumns(value => !value)} className="px-3 py-2 rounded-lg text-[12px] font-bold" style={{ background: 'var(--bg-soft)', color: 'var(--fg-secondary)' }}>▥ {L('Colunas', 'Columns', 'Columnas')}</button>
          {showColumns && <div className="absolute right-0 top-11 z-20 rounded-xl p-3 w-64" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 12px 30px rgba(15,23,42,.16)' }}>{ci.columns.map(column => <label key={column} className="flex items-center gap-2 py-1 text-[11px]" style={{ color: 'var(--fg-secondary)' }}><input type="checkbox" checked={visibleColumns.includes(column)} onChange={() => setVisibleColumns(current => current.includes(column) ? current.filter(item => item !== column) : [...current, column])} />{column}</label>)}</div>}
          {ci.portal_url && <a href={ci.portal_url} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg text-[12px] font-bold" style={{ background: 'var(--bg-soft)', color: 'var(--fg-secondary)' }}>↗ Portal</a>}
        </div>
      </div>

      {!ci.available && <div className="rounded-xl p-4 mb-4" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}><p className="text-[13px] font-bold" style={{ color: '#92400e' }}>⚠️ {L('Client Intelligence aguardando a próxima leitura autenticada do portal.', 'Client Intelligence is waiting for the next authenticated portal read.', 'Client Intelligence espera la próxima lectura autenticada del portal.')}</p><p className="text-[11px] mt-1" style={{ color: '#a16207' }}>{ci.error || L('Os cards e eventos aparecerão aqui automaticamente após a verificação por e-mail.', 'Cards and events will appear automatically after email verification.', 'Las tarjetas y eventos aparecerán aquí automáticamente después de la verificación por correo.')}</p></div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        {Object.entries(ci.metrics).map(([key, value]) => {
          const meta = CI_LABELS[key] || { label: key.replace(/_/g, ' '), icon: '📌', color: '#475569' }
          const active = category === key
          return <button key={key} onClick={() => setCategory(key)} className="rounded-xl p-4 text-left" style={{ background: active ? '#ecfeff' : 'var(--bg-card)', border: `1px solid ${active ? '#67e8f9' : 'var(--border)'}` }}><div className="flex items-center justify-between"><span className="text-[12px] font-semibold" style={{ color: 'var(--fg-secondary)' }}>{meta.icon} {meta.label}</span><strong className="text-[24px]" style={{ color: meta.color }}>{value}</strong></div></button>
        })}
      </div>

      {events.length > 0 ? <div className="rounded-2xl overflow-x-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}><table className="w-full text-left"><thead><tr style={{ background: 'var(--bg-soft)' }}><th className="p-3 text-[10px] uppercase" style={{ color: 'var(--fg-muted)' }}>{L('Categoria', 'Category', 'Categoría')}</th><th className="p-3 text-[10px] uppercase" style={{ color: 'var(--fg-muted)' }}>{L('Cliente/apólice', 'Client/policy', 'Cliente/póliza')}</th>{visibleColumns.map(column => <th key={column} className="p-3 text-[10px] uppercase whitespace-nowrap" style={{ color: 'var(--fg-muted)' }}>{column}</th>)}<th /></tr></thead><tbody>{events.map(event => <ClientEventRow key={event.id} event={event} policy={event.policy_id ? policyById.get(event.policy_id) : undefined} columns={visibleColumns} onEdit={onEdit} />)}</tbody></table></div> : ci.available && <p className="text-[13px]" style={{ color: 'var(--fg-muted)' }}>{L('Nenhum evento neste filtro.', 'No events in this filter.', 'No hay eventos en este filtro.')}</p>}
    </div>
  )
}

function ClientEventRow({ event, policy, columns, onEdit }: { event: PortalClientIntelligenceEvent; policy?: Policy; columns: string[]; onEdit: (policy: Policy) => void }) {
  const meta = CI_LABELS[event.category] || { label: event.category.replace(/_/g, ' '), icon: '📌', color: '#475569' }
  return <tr style={{ borderTop: '1px solid var(--border)' }}><td className="p-3 text-[11px] font-bold whitespace-nowrap" style={{ color: meta.color }}>{meta.icon} {meta.label}{event.flags?.includes('commission_impact') && <span className="block mt-1 text-[9px]" style={{ color: '#dc2626' }}>💲 Impacto na comissão</span>}</td><td className="p-3"><p className="text-[12px] font-bold" style={{ color: 'var(--fg)' }}>{event.client_name || '—'}</p><p className="text-[10.5px]" style={{ color: 'var(--fg-muted)' }}>{event.policy_number || '—'}</p></td>{columns.map(column => <td key={column} className="p-3 text-[11px] min-w-36" style={{ color: 'var(--fg-secondary)' }}>{event.columns[column] || '—'}</td>)}<td className="p-3 whitespace-nowrap">{policy && <button onClick={() => onEdit(policy)} className="px-2.5 py-1.5 rounded-lg text-[10.5px] font-bold" style={{ background: 'var(--bg-soft)', color: 'var(--fg-secondary)' }}>✏️ Ação</button>}</td></tr>
}
