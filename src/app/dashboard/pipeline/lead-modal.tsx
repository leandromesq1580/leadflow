'use client'

import { useState, useEffect } from 'react'
import { SendMessageModal } from '@/components/send-message-modal'
import { ExchangeBox } from './exchange-box'
import { TagPicker } from '@/components/tag-picker'
import { WhatsAppInbox } from '@/components/whatsapp-inbox'
import { callLead } from '@/components/voice/softphone'
import { AiScoreBadge } from '@/components/ai-score-badge'
import { TimePicker } from '@/components/time-picker'
import { usePrivacy } from '@/lib/privacy-mode'
import { LeadFormsTab } from './lead-forms-tab'
import { useT } from '@/lib/i18n-client'

interface Props {
  leadId: string
  buyerId: string
  onClose: () => void
  onSaved: () => void
}

interface FollowUp {
  id: string; type: string; description: string; scheduled_at: string | null; completed_at: string | null; created_at: string
}

const followUpTypes = (L: (pt: string, en: string, es: string) => string) => [
  { key: 'note', label: L('Nota', 'Note', 'Nota'), icon: '📝' },
  { key: 'call', label: L('Ligacao', 'Call', 'Llamada'), icon: '📞' },
  { key: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { key: 'email', label: 'Email', icon: '📧' },
  { key: 'meeting', label: L('Reuniao', 'Meeting', 'Reunión'), icon: '🤝' },
]

interface Attachment {
  id: string; file_name: string; file_path: string; file_size: number; file_type: string; created_at: string
}

export function LeadModal({ leadId, buyerId, onClose, onSaved }: Props) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const FOLLOW_UP_TYPES = followUpTypes(L)
  const dateLocale = t._locale === 'en' ? 'en-US' : t._locale === 'es' ? 'es-US' : 'pt-BR'
  const privacy = usePrivacy()
  const [tab, setTab] = useState<'details' | 'inbox' | 'followups' | 'attachments' | 'forms'>('details')
  const [lead, setLead] = useState<any>(null)
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showNewFU, setShowNewFU] = useState(false)
  const [editingFU, setEditingFU] = useState<{ id: string; text: string } | null>(null)
  // Default 'call' porque ~96% dos follow-ups da plataforma sao ligacao.
  // Antes era 'note' e users esqueciam de clicar no botao 'Ligacao' antes
  // de salvar, gerando ligacoes salvas como nota (sem badge LIGAÇÃO no card).
  const [fuType, setFuType] = useState('call')
  const [fuDesc, setFuDesc] = useState('')
  const [fuDate, setFuDate] = useState('')
  const [fuTime, setFuTime] = useState('')
  // Reunião: opção de mandar uma confirmação pro lead no WhatsApp com a data/hora.
  const [fuSendConfirm, setFuSendConfirm] = useState(true)
  const [fuConfirmMsg, setFuConfirmMsg] = useState('')
  const [fuConfirmEdited, setFuConfirmEdited] = useState(false)
  const [showSendMsg, setShowSendMsg] = useState(false)
  const [pipelines, setPipelines] = useState<any[]>([])
  const [pipelineLead, setPipelineLead] = useState<any>(null)
  const [pendingStageId, setPendingStageId] = useState<string | null>(null)
  const [pendingPipelineId, setPendingPipelineId] = useState<string | null>(null)

  useEffect(() => {
    // Só troca o lead por uma resposta VÁLIDA: um erro (ou corpo vazio) sobrescrevia o
    // objeto e derrubava o corpo do modal, levando junto o que estava sendo editado.
    fetch(`/api/leads/${leadId}`).then(r => r.json())
      .then(d => { const l = d?.lead || d; if (l?.id) setLead(l) })
      .catch(() => { /* mantém o que já está na tela */ })
    loadFollowUps()
    loadAttachments()
    loadPipelineInfo()
  }, [leadId, buyerId])

  // Reunião: assim que tem data, assume 09:00 como hora padrão se o user nao mexeu no
  // horario. O TimePicker MOSTRA 09:00 mas so seta o estado quando mexem num select —
  // sem isso a hora ficava vazia e a mensagem de confirmacao nunca era montada.
  useEffect(() => {
    if (fuType === 'meeting' && fuDate && !fuTime) setFuTime('09:00')
  }, [fuType, fuDate, fuTime])

  // Monta a mensagem de confirmação da reunião automaticamente (a menos que o user edite).
  useEffect(() => {
    if (fuType !== 'meeting' || !fuSendConfirm || fuConfirmEdited) return
    if (!fuDate || !fuTime) { setFuConfirmMsg(''); return }
    const first = (lead?.name || '').trim().split(' ')[0] || L('tudo bem', 'there', 'qué tal')
    const [y, m, d] = fuDate.split('-')
    const [hh, mm] = fuTime.split(':').map(Number)
    const horaFmt = `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`
    setFuConfirmMsg(L(
      `Oi ${first}! 👋 como combinado deixamos nossa conversa para o dia ${d}/${m}/${y} às ${horaFmt}. Até lá!\nQualquer imprevisto, é só me avisar por aqui. 🙂`,
      `Hi ${first}! 👋 as agreed, our conversation is set for ${m}/${d}/${y} at ${horaFmt}. Talk to you then!\nIf anything comes up, just let me know here. 🙂`,
      `¡Hola ${first}! 👋 como quedamos, dejamos nuestra conversación para el día ${d}/${m}/${y} a las ${horaFmt}. ¡Hasta entonces!\nCualquier imprevisto, avísame por aquí. 🙂`
    ))
  }, [fuType, fuSendConfirm, fuConfirmEdited, fuDate, fuTime, lead?.name])

  async function loadPipelineInfo() {
    if (!buyerId) return
    const [pipesRes, plRes] = await Promise.all([
      fetch(`/api/pipelines?buyer_id=${buyerId}`).then(r => r.json()),
      fetch(`/api/leads/${leadId}/pipeline`).then(r => r.ok ? r.json() : { pipelineLead: null }),
    ])
    let pipes: any[] = pipesRes.pipelines || []
    const pl = plRes.pipelineLead || null

    // Cross-buyer fix: lead pode estar em pipeline de outro buyer (ex: team member
    // vendo lead que ainda está na pipeline da agência). Se a pipeline atual do
    // lead não estiver na lista do buyer logado, busca ela diretamente pra que
    // os stages apareçam no dropdown.
    const currentPipeId = pl?.pipeline?.id
    if (currentPipeId && !pipes.some((p: any) => p.id === currentPipeId)) {
      try {
        const extraRes = await fetch(`/api/pipelines/${currentPipeId}`)
        if (extraRes.ok) {
          const extra = await extraRes.json()
          if (extra?.pipeline) pipes = [...pipes, extra.pipeline]
        }
      } catch {}
    }

    setPipelines(pipes)
    setPipelineLead(pl)
    setPendingStageId(pl?.stage_id || null)
    setPendingPipelineId(pl?.pipeline?.id || null)
  }

  async function loadFollowUps() {
    const r = await fetch(`/api/leads/${leadId}/follow-ups`)
    const d = await r.json()
    setFollowUps(d.followUps || [])
  }

  // Softphone grava follow-up da ligação (Ligou/resultado) → recarrega a lista ao vivo.
  useEffect(() => {
    const h = (ev: Event) => { if ((ev as CustomEvent).detail?.leadId === leadId) loadFollowUps() }
    window.addEventListener('l4p:fu-refresh', h as EventListener)
    return () => window.removeEventListener('l4p:fu-refresh', h as EventListener)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId])

  async function loadAttachments() {
    const r = await fetch(`/api/leads/${leadId}/attachments`)
    const d = await r.json()
    setAttachments(d.attachments || [])
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const MAX = 30 * 1024 * 1024
    if (file.size > MAX) {
      alert(L(
        `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo ${MAX / 1024 / 1024}MB.`,
        `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max ${MAX / 1024 / 1024}MB.`,
        `Archivo demasiado grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo ${MAX / 1024 / 1024}MB.`
      ))
      e.target.value = ''
      return
    }

    setUploading(true)
    try {
      // 1) Pede signed URL pro server (bypassa o limit de 4.5MB do Vercel)
      const urlRes = await fetch(`/api/leads/${leadId}/attachments/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: file.name, file_size: file.size, buyer_id: buyerId }),
      })
      if (!urlRes.ok) {
        const d = await urlRes.json().catch(() => ({}))
        throw new Error(d.error || L(`Falha ao gerar upload URL (HTTP ${urlRes.status})`, `Failed to generate upload URL (HTTP ${urlRes.status})`, `Error al generar la URL de subida (HTTP ${urlRes.status})`))
      }
      const { signedUrl, path } = await urlRes.json()

      // 2) PUT direto no Supabase Storage
      const upRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      })
      if (!upRes.ok) throw new Error(L(`Falha no upload (HTTP ${upRes.status})`, `Upload failed (HTTP ${upRes.status})`, `Error en la subida (HTTP ${upRes.status})`))

      // 3) Registra metadados no DB
      const regRes = await fetch(`/api/leads/${leadId}/attachments/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer_id: buyerId,
          file_name: file.name,
          file_path: path,
          file_size: file.size,
          file_type: file.type,
        }),
      })
      if (!regRes.ok) {
        const d = await regRes.json().catch(() => ({}))
        throw new Error(d.error || L(`Falha ao registrar arquivo (HTTP ${regRes.status})`, `Failed to register file (HTTP ${regRes.status})`, `Error al registrar el archivo (HTTP ${regRes.status})`))
      }

      await loadAttachments()
    } catch (err: any) {
      console.error('[uploadFile] erro:', err)
      const msg = err?.message || L('erro desconhecido', 'unknown error', 'error desconocido')
      alert(L(`Não foi possível anexar: ${msg}`, `Could not attach: ${msg}`, `No se pudo adjuntar: ${msg}`))
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function deleteAttachment(attId: string) {
    if (!confirm(L('Remover este arquivo?', 'Remove this file?', '¿Eliminar este archivo?'))) return
    await fetch(`/api/leads/${leadId}/attachments`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attachment_id: attId }),
    })
    loadAttachments()
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1048576) return `${Math.round(bytes / 1024)}KB`
    return `${(bytes / 1048576).toFixed(1)}MB`
  }

  async function saveLead() {
    setSaving(true)
    // Save lead fields
    const payload = {
      name: lead.name, email: lead.email, phone: lead.phone,
      state: lead.state, city: lead.city, interest: lead.interest,
      platform: lead.platform, reason: lead.reason,
      age_range: lead.age_range, attendant: lead.attendant,
      is_organic: lead.is_organic, contract_closed: lead.contract_closed,
      policy_value: typeof lead.policy_value === 'number' ? lead.policy_value : (lead.policy_value ? parseFloat(lead.policy_value) || 0 : 0),
      observation: lead.observation,
      closed_at: lead.closed_at || null,
    }
    console.log('[saveLead] payload:', payload)
    const res = await fetch(`/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const resBody = await res.json().catch(() => null)
    console.log('[saveLead] response:', res.status, resBody)
    // Mudanca de pipeline/stage
    if (pipelineLead && pendingStageId) {
      const pipeChanged = pendingPipelineId && pendingPipelineId !== pipelineLead.pipeline?.id
      const stageChanged = pendingStageId !== pipelineLead.stage_id
      if (pipeChanged) {
        // Muda de pipeline: deleta entry antiga + cria nova
        await fetch(`/api/pipeline-leads/${pipelineLead.id}`, { method: 'DELETE' })
        await fetch(`/api/pipelines/${pendingPipelineId}/leads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_id: leadId, stage_id: pendingStageId }),
        })
      } else if (stageChanged) {
        await fetch(`/api/pipeline-leads/${pipelineLead.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage_id: pendingStageId }),
        })
      }
    }
    setSaving(false)
    onSaved()
  }

  async function addFollowUp() {
    // Reunião: a substância é a data/hora — descrição é OPCIONAL (default "Reunião").
    // Demais tipos: exigem descrição, mas com AVISO (nunca falha em silêncio).
    if (fuType === 'meeting') {
      if (!fuDate || !fuTime) {
        alert(L('Reunião precisa de data e hora pra aparecer no calendário.', 'A meeting needs a date and time to show on the calendar.', 'La reunión necesita fecha y hora para aparecer en el calendario.'))
        return
      }
    } else if (!fuDesc.trim()) {
      alert(L('Escreva o que aconteceu ou precisa ser feito.', 'Write down what happened or needs to be done.', 'Escribe qué pasó o qué hay que hacer.'))
      return
    }
    const description = fuDesc.trim() || (fuType === 'meeting' ? L('Reunião', 'Meeting', 'Reunión') : '')
    let scheduled_at: string | null = null
    if (fuDate) {
      const time = fuTime || '09:00'
      scheduled_at = new Date(`${fuDate}T${time}:00`).toISOString()
    }
    const res = await fetch(`/api/leads/${leadId}/follow-ups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyer_id: buyerId, type: fuType, description, scheduled_at }),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      alert(L('Não consegui salvar a reunião: ', "Couldn't save the meeting: ", 'No pude guardar la reunión: ') + (e.error || L('erro no servidor', 'server error', 'error del servidor')))
      return
    }
    // ✅ SALVOU no banco. Fecha e atualiza a lista AGORA.
    // BUG QUE ISSO CORRIGE: antes, o envio da confirmação vinha ANTES daqui e SEM
    // timeout. Se a bridge travasse (e /api/templates/send ainda tem retry interno),
    // o `await` nunca voltava → a tela ficava aberta com os dados → parecia que
    // "NÃO SALVOU", mas o follow-up já estava gravado. Envio NUNCA bloqueia a UI.
    const enviarConfirmacao = fuType === 'meeting' && fuSendConfirm && !!fuConfirmMsg.trim() && !!lead?.phone
    const confirmBody = fuConfirmMsg.trim()
    setFuDesc('')
    setFuDate('')
    setFuTime('')
    setFuType('call') // reseta pra ligacao (padrao mais comum) — pra proxima vez
    setFuSendConfirm(true)
    setFuConfirmMsg('')
    setFuConfirmEdited(false)
    setShowNewFU(false)
    loadFollowUps()

    // Confirmação pro lead: best-effort, COM timeout. Falhar/demorar aqui não
    // desfaz nada — a reunião já está salva e visível na lista.
    if (enviarConfirmacao) {
      try {
        const r = await fetch('/api/templates/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ override_body: confirmBody, lead_id: leadId, buyer_id: buyerId }),
          signal: AbortSignal.timeout(20000),
        })
        if (!r.ok) {
          const e = await r.json().catch(() => ({}))
          alert(L('Reunião salva ✅ — mas a confirmação no WhatsApp NÃO foi enviada: ', 'Meeting saved ✅ — but the WhatsApp confirmation was NOT sent: ', 'Reunión guardada ✅ — pero la confirmación por WhatsApp NO fue enviada: ') + (e.error || L('erro ao enviar', 'send error', 'error al enviar')))
        }
      } catch {
        alert(L('Reunião salva ✅ — mas a confirmação no WhatsApp demorou demais. Mande manualmente se precisar.', 'Meeting saved ✅ — but the WhatsApp confirmation took too long. Send it manually if needed.', 'Reunión guardada ✅ — pero la confirmación por WhatsApp tardó demasiado. Envíala manualmente si hace falta.'))
      }
    }
  }

  async function completeFollowUp(fuId: string) {
    await fetch(`/api/follow-ups/${fuId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    })
    loadFollowUps()
  }

  async function updateFollowUp(fuId: string, newDesc: string) {
    await fetch(`/api/follow-ups/${fuId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: newDesc }),
    })
    setEditingFU(null)
    loadFollowUps()
  }

  async function deleteFollowUp(fuId: string) {
    if (!confirm(L('Deletar este follow-up?', 'Delete this follow-up?', '¿Eliminar este seguimiento?'))) return
    await fetch(`/api/follow-ups/${fuId}`, { method: 'DELETE' })
    loadFollowUps()
  }

  if (!lead) return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-[540px] max-h-[90vh] rounded-2xl" style={{ background: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div className="flex items-center justify-center h-[200px]">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        </div>
      </div>
    </>
  )

  const hue = (lead.name?.charCodeAt(0) * 47 + (lead.name?.charCodeAt(1) || 0) * 23) % 360

  const input = (label: string, field: string, type = 'text', icon = '') => {
    const sensitive = field === 'phone' || field === 'email'
    const masked = privacy.enabled && sensitive
    const displayValue = masked
      ? privacy.mask(lead[field] || '', field === 'email' ? 'email' : 'phone')
      : (lead[field] || '')
    return (
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#94a3b8' }}>
          {icon && <span className="mr-1">{icon}</span>}{label}
        </label>
        <input
          type={masked ? 'text' : type}
          value={displayValue}
          readOnly={masked}
          onChange={masked ? undefined : (e => setLead({ ...lead, [field]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
          className="w-full px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all focus:outline-none focus:ring-2 focus:ring-indigo-200"
          style={{ background: masked ? '#f1f5f9' : '#f8f9fc', border: '1px solid #e8ecf4', color: masked ? '#94a3b8' : '#1a1a2e' }}
        />
      </div>
    )
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-[540px] max-h-[90vh] overflow-y-auto rounded-2xl"
        style={{ background: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        {/* Header with gradient */}
        <div className="relative px-7 pt-7 pb-5" style={{ background: `linear-gradient(135deg, hsl(${hue}, 55%, 96%), #fff)` }}>
          <button onClick={onClose} className="absolute top-5 right-5 w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-black/5"
            style={{ color: '#94a3b8' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-[15px] font-extrabold text-white"
              style={{ background: `hsl(${hue}, 55%, 50%)`, boxShadow: `0 4px 12px hsl(${hue}, 55%, 50%, 0.3)` }}>
              {lead.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[20px] font-extrabold truncate" style={{ color: '#1a1a2e' }}>{lead.name}</h2>
              <p className="text-[12px] font-medium" style={{ color: '#94a3b8' }}>
                {privacy.mask(lead.phone, 'phone')} {lead.state && `· ${lead.state}`}
              </p>
            </div>
            {lead.phone && (
              <button onClick={() => callLead(lead.phone, lead.name, leadId)}
                title={L('Ligar pelo navegador com número local (DDD do lead)', "Call from the browser with a local number (lead's area code)", 'Llamar desde el navegador con número local (código de área del lead)')}
                className="px-4 py-2.5 rounded-xl text-[12px] font-bold text-white flex items-center gap-1.5 flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
                📞 {L('Ligar', 'Call', 'Llamar')}
              </button>
            )}
            <button onClick={() => setShowSendMsg(true)}
              className="px-4 py-2.5 rounded-xl text-[12px] font-bold text-white flex items-center gap-1.5 flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 4px 14px rgba(16,185,129,0.3)' }}>
              💬 {L('Enviar Msg', 'Send Msg', 'Enviar Msj')}
            </button>
          </div>
        </div>

        <div className="px-7 pb-7">
          {/* AI Score + Tags */}
          <div className="mb-4 space-y-2">
            <AiScoreBadge
              leadId={leadId}
              score={lead?.ai_score}
              reason={lead?.ai_score_reason}
              onScored={(s, r) => setLead((l: any) => l ? { ...l, ai_score: s, ai_score_reason: r } : l)}
            />
            <TagPicker leadId={leadId} buyerId={buyerId} />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 p-1 rounded-xl overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ background: '#f1f5f9' }}>
            {[
              { key: 'details', label: L('Detalhes', 'Details', 'Detalles'), icon: '📋' },
              { key: 'inbox', label: L('Conversa', 'Chat', 'Conversación'), icon: '💬' },
              { key: 'followups', label: L('Follow-ups', 'Follow-ups', 'Seguimientos'), icon: '📌', count: followUps.length },
              { key: 'attachments', label: L('Anexos', 'Attachments', 'Adjuntos'), icon: '📎', count: attachments.length },
              { key: 'forms', label: 'Forms', icon: '📝' },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key as any)}
                className="flex-1 whitespace-nowrap py-2.5 px-2 rounded-lg text-[11px] font-bold transition-all"
                style={{
                  background: tab === t.key ? '#fff' : 'transparent',
                  color: tab === t.key ? '#6366f1' : '#94a3b8',
                  boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                }}>
                {t.icon} {t.label}{(t as any).count > 0 ? <sup className="ml-0.5 text-[9px] font-extrabold" style={{ color: tab === t.key ? '#6366f1' : '#cbd5e1' }}>{(t as any).count}</sup> : null}
              </button>
            ))}
          </div>

          {tab === 'details' && (
            <div className="space-y-5">
              {/* Contact section */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: '#c0c8d4' }}>{L('Contato', 'Contact', 'Contacto')}</p>
                <div className="grid grid-cols-2 gap-3">
                  {input(L('Nome', 'Name', 'Nombre'), 'name', 'text', '👤')}
                  {input(L('Telefone', 'Phone', 'Teléfono'), 'phone', 'tel', '📞')}
                  {input('Email', 'email', 'email', '📧')}
                  {input(L('Estado', 'State', 'Estado'), 'state', 'text', '📍')}
                </div>
              </div>

              {/* Lead info section */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: '#c0c8d4' }}>{L('Informacoes', 'Information', 'Información')}</p>
                <div className="grid grid-cols-2 gap-3">
                  {input(L('Cidade', 'City', 'Ciudad'), 'city')}
                  {input(L('Interesse', 'Interest', 'Interés'), 'interest')}
                  {input(L('Plataforma', 'Platform', 'Plataforma'), 'platform')}
                  {input(L('Campanha', 'Campaign', 'Campaña'), 'campaign_name')}
                  {input(L('Faixa Etaria', 'Age Range', 'Rango de Edad'), 'age_range')}
                  {input(L('Atendente', 'Rep', 'Agente'), 'attendant')}
                  {input(L('Motivo', 'Reason', 'Motivo'), 'reason')}
                  {input(L('Valor Apolice', 'Policy Value', 'Valor de Póliza'), 'policy_value', 'number', '💰')}
                </div>
              </div>

              {/* Flags */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: '#c0c8d4' }}>Status</p>
                <div className="flex gap-3">
                  <label className="flex-1 flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-all"
                    style={{ background: lead.is_organic ? '#f0fdf4' : '#f8f9fc', border: `1px solid ${lead.is_organic ? '#86efac' : '#e8ecf4'}` }}>
                    <input type="checkbox" checked={lead.is_organic || false}
                      onChange={e => setLead({ ...lead, is_organic: e.target.checked })}
                      className="w-4 h-4 rounded accent-green-500" />
                    <div>
                      <span className="text-[12px] font-bold block" style={{ color: '#1a1a2e' }}>{L('Lead Organico', 'Organic Lead', 'Lead Orgánico')}</span>
                      <span className="text-[10px]" style={{ color: '#94a3b8' }}>{L('Nao veio de campanha paga', 'Did not come from a paid campaign', 'No vino de campaña pagada')}</span>
                    </div>
                  </label>
                  <label className="flex-1 flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-all"
                    style={{ background: lead.contract_closed ? '#f0fdf4' : '#f8f9fc', border: `1px solid ${lead.contract_closed ? '#86efac' : '#e8ecf4'}` }}>
                    <input type="checkbox" checked={lead.contract_closed || false}
                      onChange={e => setLead({ ...lead, contract_closed: e.target.checked })}
                      className="w-4 h-4 rounded accent-green-500" />
                    <div>
                      <span className="text-[12px] font-bold block" style={{ color: '#1a1a2e' }}>{L('Contrato Fechado', 'Contract Closed', 'Contrato Cerrado')}</span>
                      <span className="text-[10px]" style={{ color: '#94a3b8' }}>{L('Apolice emitida', 'Policy issued', 'Póliza emitida')}</span>
                    </div>
                  </label>
                </div>

                {/* Closing details — show when contract_closed */}
                {lead.contract_closed && (
                  <div className="grid grid-cols-2 gap-3 mt-3 p-4 rounded-xl" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#15803d' }}>
                        📅 {L('Data Fechamento', 'Closing Date', 'Fecha de Cierre')}
                      </label>
                      <input type="date" value={lead.closed_at ? lead.closed_at.split('T')[0] : ''}
                        onChange={e => setLead({ ...lead, closed_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                        className="w-full px-3.5 py-2.5 rounded-xl text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-green-200"
                        style={{ background: '#fff', border: '1px solid #bbf7d0', color: '#1a1a2e' }} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#15803d' }}>
                        💰 {L('Valor da Apolice', 'Policy Value', 'Valor de la Póliza')}
                      </label>
                      <input type="number" value={lead.policy_value || ''} placeholder="0.00"
                        onChange={e => setLead({ ...lead, policy_value: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3.5 py-2.5 rounded-xl text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-green-200"
                        style={{ background: '#fff', border: '1px solid #bbf7d0', color: '#1a1a2e' }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Pipeline Stage selector */}
              {pipelineLead && (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#94a3b8' }}>
                    📋 {L('Estágio no Pipeline', 'Stage in Pipeline', 'Etapa en el Pipeline')}
                  </label>
                  <div className="rounded-xl p-3" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold uppercase" style={{ color: '#94a3b8' }}>{L('Pipeline atual:', 'Current pipeline:', 'Pipeline actual:')}</span>
                      <span className="text-[12px] font-bold" style={{ color: '#1a1a2e' }}>
                        {pipelineLead.pipeline?.name || 'Default'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[10px] font-bold uppercase" style={{ color: '#94a3b8' }}>{L('Estágio atual:', 'Current stage:', 'Etapa actual:')}</span>
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold"
                        style={{
                          background: (pipelineLead.stage?.color || '#6366f1') + '22',
                          color: pipelineLead.stage?.color || '#6366f1',
                          border: `1px solid ${(pipelineLead.stage?.color || '#6366f1')}44`,
                        }}>
                        <span className="w-2 h-2 rounded-full" style={{ background: pipelineLead.stage?.color || '#6366f1' }} />
                        {pipelineLead.stage?.name || L('Sem estágio', 'No stage', 'Sin etapa')}
                      </span>
                    </div>

                    {pipelines.length > 1 && (
                      <div className="mb-2">
                        <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: '#94a3b8' }}>{L('Mover para pipeline:', 'Move to pipeline:', 'Mover a pipeline:')}</label>
                        <select
                          value={pendingPipelineId || pipelineLead.pipeline?.id || ''}
                          onChange={e => {
                            const newPipeId = e.target.value
                            setPendingPipelineId(newPipeId)
                            // Se mudou pipeline, reseta o stage pro primeiro da nova pipeline
                            if (newPipeId !== pipelineLead.pipeline?.id) {
                              const newPipe = pipelines.find(p => p.id === newPipeId)
                              const firstStage = (newPipe?.stages || []).sort((a: any, b: any) => a.position - b.position)[0]
                              if (firstStage) setPendingStageId(firstStage.id)
                            } else {
                              setPendingStageId(pipelineLead.stage_id)
                            }
                          }}
                          className="w-full px-3 py-2 rounded-lg text-[13px] font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer"
                          style={{
                            background: '#fff',
                            border: `1px solid ${pendingPipelineId && pendingPipelineId !== pipelineLead.pipeline?.id ? '#6366f1' : '#e8ecf4'}`,
                            color: '#1a1a2e',
                          }}>
                          {pipelines.map((p: any) => (
                            <option key={p.id} value={p.id}>
                              {p.name}{p.id === pipelineLead.pipeline?.id ? L(' (atual)', ' (current)', ' (actual)') : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: '#94a3b8' }}>{L('Mover para estágio:', 'Move to stage:', 'Mover a etapa:')}</label>
                      <select
                        value={pendingStageId || pipelineLead.stage_id || ''}
                        onChange={e => setPendingStageId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-[13px] font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer"
                        style={{
                          background: '#fff',
                          border: `1px solid ${(pendingStageId && pendingStageId !== pipelineLead.stage_id) || (pendingPipelineId && pendingPipelineId !== pipelineLead.pipeline?.id) ? '#6366f1' : '#e8ecf4'}`,
                          color: '#1a1a2e',
                        }}>
                        {(pipelines.find(p => p.id === (pendingPipelineId || pipelineLead.pipeline?.id))?.stages || [])
                          .sort((a: any, b: any) => a.position - b.position)
                          .map((s: any) => (
                            <option key={s.id} value={s.id}>
                              {s.name}{s.id === pipelineLead.stage_id && (pendingPipelineId || pipelineLead.pipeline?.id) === pipelineLead.pipeline?.id ? L(' (atual)', ' (current)', ' (actual)') : ''}
                            </option>
                          ))}
                      </select>
                      {((pendingStageId && pendingStageId !== pipelineLead.stage_id) || (pendingPipelineId && pendingPipelineId !== pipelineLead.pipeline?.id)) && (
                        <p className="text-[10px] mt-1 font-semibold" style={{ color: '#6366f1' }}>
                          ⚠️ {L('Mudança pendente — será salva ao clicar', 'Pending change — saved when you click', 'Cambio pendiente — se guardará al hacer clic en')} &ldquo;{L('Salvar Alterações', 'Save Changes', 'Guardar Cambios')}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Observation */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#94a3b8' }}>
                  📝 {L('Observacao', 'Notes', 'Observación')}
                </label>
                <textarea value={lead.observation || ''} onChange={e => setLead({ ...lead, observation: e.target.value })}
                  rows={3} placeholder={L('Notas sobre este lead. URLs viram clicáveis automaticamente.', 'Notes about this lead. URLs become clickable automatically.', 'Notas sobre este lead. Las URLs se vuelven clicables automáticamente.')}
                  className="w-full px-3.5 py-2.5 rounded-xl text-[13px] font-medium resize-none transition-all focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
                {(() => {
                  const text = lead.observation || ''
                  const urls = Array.from(text.matchAll(/https?:\/\/[^\s)]+/g)).map(m => m[0])
                  if (urls.length === 0) return null
                  return (
                    <div className="mt-2 space-y-1">
                      {urls.map((u, i) => {
                        const display = u.length > 60 ? u.slice(0, 57) + '...' : u
                        return (
                          <a key={i} href={u} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-indigo-50 transition-colors text-[12px] font-semibold truncate"
                            style={{ background: '#f0f4ff', color: '#6366f1', border: '1px solid #e0e7ff', textDecoration: 'none' }}>
                            <span>🔗</span>
                            <span className="truncate">{display}</span>
                            <span className="ml-auto text-[10px]" style={{ color: '#94a3b8' }}>↗</span>
                          </a>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>

              {/* Troca de lead: aparece só quando elegível (14d trabalhados + 0 respostas) */}
              <ExchangeBox leadId={leadId} />

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-3" style={{ borderTop: '1px solid #f1f5f9' }}>
                <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-colors hover:bg-gray-50" style={{ color: '#64748b' }}>
                  {L('Cancelar', 'Cancel', 'Cancelar')}
                </button>
                <button onClick={saveLead} disabled={saving}
                  className="px-6 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50 transition-all"
                  style={{ background: '#6366f1', boxShadow: '0 4px 14px rgba(99,102,241,0.25)' }}>
                  {saving ? L('Salvando...', 'Saving...', 'Guardando...') : L('Salvar Alteracoes', 'Save Changes', 'Guardar Cambios')}
                </button>
              </div>
            </div>
          )}

          {tab === 'inbox' && lead && (
            <WhatsAppInbox leadId={leadId} buyerId={buyerId} />
          )}

          {tab === 'followups' && (
            <div>
              {/* New follow-up button */}
              <button onClick={() => setShowNewFU(true)}
                className="w-full py-3 rounded-xl text-[13px] font-bold mb-5 transition-all hover:shadow-sm"
                style={{ background: '#f0f4ff', color: '#6366f1', border: '1px dashed #c7d2fe' }}>
                + {L('Novo Follow-up', 'New Follow-up', 'Nuevo Seguimiento')}
              </button>

              {/* New follow-up form */}
              {showNewFU && (
                <div className="rounded-xl p-5 mb-5" style={{ background: '#fafbff', border: '1px solid #e0e7ff' }}>
                  <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: '#94a3b8' }}>
                    {L('Tipo', 'Type', 'Tipo')} · <span style={{ color: '#6366f1' }}>
                      {(() => {
                        const cur = FOLLOW_UP_TYPES.find(ft => ft.key === fuType)
                        return cur ? `${cur.icon} ${cur.label} ${L('selecionado', 'selected', 'seleccionado')}` : L('selecione', 'select one', 'selecciona')
                      })()}
                    </span>
                  </p>
                  <div className="flex gap-1.5 mb-4 flex-wrap">
                    {FOLLOW_UP_TYPES.map(t => (
                      <button key={t.key} onClick={() => setFuType(t.key)}
                        className="px-3 py-2 rounded-lg text-[11px] font-bold transition-all"
                        style={{
                          background: fuType === t.key ? '#6366f1' : '#fff',
                          color: fuType === t.key ? '#fff' : '#64748b',
                          border: `1px solid ${fuType === t.key ? '#6366f1' : '#e8ecf4'}`,
                          boxShadow: fuType === t.key ? '0 2px 8px rgba(99,102,241,0.25)' : 'none',
                        }}>
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                  <textarea value={fuDesc} onChange={e => setFuDesc(e.target.value)} placeholder={L('O que aconteceu ou precisa ser feito...', 'What happened or needs to be done...', 'Qué pasó o qué hay que hacer...')}
                    rows={2} className="w-full px-3.5 py-2.5 rounded-xl text-[13px] resize-none mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    style={{ background: '#fff', border: '1px solid #e8ecf4' }} />

                  {/* Agendar data/hora — obrigatório pra Reunião, opcional p/ resto */}
                  <div className="mb-3 p-3 rounded-lg" style={{
                    background: fuType === 'meeting' ? '#fef3c7' : '#f8f9fc',
                    border: fuType === 'meeting' ? '1px solid #fde68a' : '1px solid #e8ecf4',
                  }}>
                    <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: fuType === 'meeting' ? '#92400e' : '#94a3b8' }}>
                      {fuType === 'meeting'
                        ? '📅 ' + L('Data e hora da reunião — OBRIGATÓRIO', 'Meeting date and time — REQUIRED', 'Fecha y hora de la reunión — OBLIGATORIO')
                        : '📅 ' + L('Agendar (opcional — aparece no calendário)', 'Schedule (optional — shows on the calendar)', 'Agendar (opcional — aparece en el calendario)')}
                    </p>
                    <div className="flex gap-2">
                      <input type="date" value={fuDate} onChange={e => setFuDate(e.target.value)}
                        min={new Date().toISOString().slice(0, 10)}
                        required={fuType === 'meeting'}
                        className="flex-1 px-3 py-2 rounded-lg text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        style={{
                          background: '#fff',
                          border: fuType === 'meeting' && !fuDate ? '1px solid #f59e0b' : '1px solid #e8ecf4',
                        }} />
                      <TimePicker value={fuTime} onChange={setFuTime} disabled={!fuDate}
                        className="px-2 py-2 rounded-lg text-[12px] bg-white disabled:opacity-50" />
                      {fuDate && fuType !== 'meeting' && (
                        <button onClick={() => { setFuDate(''); setFuTime('') }}
                          className="px-2 py-2 text-[11px] font-bold" style={{ color: '#94a3b8' }}>
                          ×
                        </button>
                      )}
                    </div>
                    {fuType === 'meeting' && (!fuDate || !fuTime) && (
                      <p className="text-[10px] mt-1.5" style={{ color: '#92400e' }}>
                        ⚠️ {L('Reunião precisa de data + hora pra ser criada como appointment no calendário.', 'A meeting needs a date + time to be created as an appointment on the calendar.', 'La reunión necesita fecha + hora para crearse como cita en el calendario.')}
                      </p>
                    )}

                    {/* Confirmação pro lead no WhatsApp (com data/hora) */}
                    {fuType === 'meeting' && lead?.phone && (
                      <div className="mt-3 pt-3" style={{ borderTop: '1px dashed #fde68a' }}>
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input type="checkbox" checked={fuSendConfirm} onChange={e => setFuSendConfirm(e.target.checked)}
                            className="w-4 h-4 mt-0.5 accent-emerald-500 flex-shrink-0" />
                          <span className="text-[12px] font-bold" style={{ color: '#92400e' }}>
                            ✉️ {L('Mandar confirmação pro lead no WhatsApp (com a data e hora) — pra ele não esquecer', "Send the lead a WhatsApp confirmation (with date and time) — so they don't forget", 'Enviar confirmación al lead por WhatsApp (con fecha y hora) — para que no se olvide')}
                          </span>
                        </label>
                        {fuSendConfirm && (
                          <>
                            <textarea value={fuConfirmMsg}
                              onChange={e => { setFuConfirmMsg(e.target.value); setFuConfirmEdited(true) }}
                              rows={3}
                              placeholder={(!fuDate || !fuTime) ? L('Escolha a data e a hora — a mensagem é montada sozinha.', 'Pick the date and time — the message is built automatically.', 'Elige la fecha y la hora — el mensaje se arma solo.') : ''}
                              className="w-full mt-2 px-3 py-2 rounded-lg text-[12px] resize-none focus:outline-none focus:ring-2 focus:ring-emerald-200"
                              style={{ background: '#fff', border: '1px solid #fde68a', color: '#1a1a2e' }} />
                            <p className="text-[10px] mt-1" style={{ color: '#a16207' }}>
                              {L('Vai pelo WhatsApp do seu número conectado e aparece na conversa do lead. Pode editar o texto acima.', "Sent via your connected WhatsApp number and shows up in the lead's conversation. You can edit the text above.", 'Se envía por el WhatsApp de tu número conectado y aparece en la conversación del lead. Puedes editar el texto de arriba.')}
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowNewFU(false)} className="px-4 py-2 text-[12px] font-semibold rounded-lg" style={{ color: '#94a3b8' }}>{L('Cancelar', 'Cancel', 'Cancelar')}</button>
                    <button onClick={addFollowUp}
                      disabled={fuType === 'meeting' ? (!fuDate || !fuTime) : !fuDesc.trim()}
                      className="px-5 py-2 rounded-lg text-[12px] font-bold text-white disabled:opacity-40"
                      style={{ background: '#6366f1' }}>{L('Salvar', 'Save', 'Guardar')}</button>
                  </div>
                </div>
              )}

              {/* Follow-up list */}
              {followUps.length === 0 ? (
                <div className="text-center py-12">
                  <span className="text-[32px] block mb-2">📌</span>
                  <p className="text-[13px] font-semibold" style={{ color: '#94a3b8' }}>{L('Nenhum follow-up registrado', 'No follow-ups yet', 'Ningún seguimiento registrado')}</p>
                  <p className="text-[11px] mt-1" style={{ color: '#c0c8d4' }}>{L('Registre ligacoes, notas e reunioes', 'Log calls, notes and meetings', 'Registra llamadas, notas y reuniones')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {followUps.map(fu => {
                    const typeInfo = FOLLOW_UP_TYPES.find(ft => ft.key === fu.type) || FOLLOW_UP_TYPES[0]
                    const done = !!fu.completed_at
                    return (
                      <div key={fu.id} className="rounded-xl p-4 flex gap-3 transition-all"
                        style={{
                          background: done ? '#f8fdf9' : '#fff',
                          border: `1px solid ${done ? '#d1fae5' : '#e8ecf4'}`,
                        }}>
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: done ? '#dcfce7' : '#f0f4ff' }}>
                          <span className="text-[14px]">{typeInfo.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          {editingFU?.id === fu.id ? (
                            <div>
                              <textarea value={editingFU.text}
                                onChange={e => setEditingFU({ ...editingFU, text: e.target.value })}
                                rows={2} autoFocus
                                className="w-full px-2 py-1.5 rounded-lg text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                style={{ background: '#fff', border: '1px solid #c7d2fe' }} />
                              <div className="flex gap-2 mt-1.5">
                                <button onClick={() => updateFollowUp(fu.id, editingFU.text)}
                                  disabled={!editingFU.text.trim()}
                                  className="px-3 py-1 rounded text-[10px] font-bold text-white disabled:opacity-50"
                                  style={{ background: '#6366f1' }}>
                                  {L('Salvar', 'Save', 'Guardar')}
                                </button>
                                <button onClick={() => setEditingFU(null)}
                                  className="px-3 py-1 rounded text-[10px] font-bold"
                                  style={{ color: '#94a3b8' }}>
                                  {L('Cancelar', 'Cancel', 'Cancelar')}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-[13px] font-semibold" style={{ color: '#1a1a2e', textDecoration: done ? 'line-through' : 'none' }}>
                                {fu.description}
                              </p>
                              <p className="text-[11px] mt-0.5" style={{ color: '#94a3b8' }}>
                                {new Date(fu.created_at).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {typeInfo.label}
                              </p>
                            </>
                          )}
                        </div>
                        {editingFU?.id !== fu.id && (
                          <div className="flex flex-col gap-1 self-start">
                            {!done && (
                              <button onClick={() => completeFollowUp(fu.id)}
                                title={L('Concluir', 'Complete', 'Completar')}
                                className="text-[10px] font-bold px-2 py-1 rounded-lg transition-all hover:shadow-sm"
                                style={{ background: '#dcfce7', color: '#166534' }}>
                                ✓
                              </button>
                            )}
                            {done && (
                              <span className="text-[10px] font-bold px-2 py-1" style={{ color: '#10b981' }}>✓</span>
                            )}
                            <button onClick={() => setEditingFU({ id: fu.id, text: fu.description })}
                              title={L('Editar', 'Edit', 'Editar')}
                              className="text-[10px] font-bold px-2 py-1 rounded-lg hover:bg-indigo-50"
                              style={{ color: '#6366f1' }}>
                              ✎
                            </button>
                            <button onClick={() => deleteFollowUp(fu.id)}
                              title={L('Deletar', 'Delete', 'Eliminar')}
                              className="text-[10px] font-bold px-2 py-1 rounded-lg hover:bg-red-50"
                              style={{ color: '#ef4444' }}>
                              🗑
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'attachments' && (
            <div>
              {/* Upload */}
              <label className="w-full py-4 rounded-xl text-[13px] font-bold mb-5 transition-all hover:shadow-sm cursor-pointer flex items-center justify-center gap-2"
                style={{ background: '#f0f4ff', color: '#6366f1', border: '1px dashed #c7d2fe' }}>
                <input type="file" className="hidden" onChange={uploadFile} disabled={uploading}
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.xls,.xlsx,.csv,.txt" />
                {uploading ? L('Enviando...', 'Uploading...', 'Subiendo...') : '📎 ' + L('Clique para anexar arquivo', 'Click to attach a file', 'Haz clic para adjuntar un archivo')}
              </label>
              <p className="text-[10px] mb-4" style={{ color: '#c0c8d4' }}>{L('PDF, DOC, XLS, imagens — max 10MB', 'PDF, DOC, XLS, images — max 10MB', 'PDF, DOC, XLS, imágenes — máx 10MB')}</p>

              {/* List */}
              {attachments.length === 0 ? (
                <div className="text-center py-12">
                  <span className="text-[32px] block mb-2">📁</span>
                  <p className="text-[13px] font-semibold" style={{ color: '#94a3b8' }}>{L('Nenhum anexo', 'No attachments', 'Ningún adjunto')}</p>
                  <p className="text-[11px] mt-1" style={{ color: '#c0c8d4' }}>{L('Envie propostas, contratos e documentos', 'Upload proposals, contracts and documents', 'Sube propuestas, contratos y documentos')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {attachments.map(att => {
                    const isImage = att.file_type?.startsWith('image/')
                    const isPdf = att.file_type === 'application/pdf'
                    const icon = isImage ? '🖼️' : isPdf ? '📄' : '📎'
                    return (
                      <div key={att.id} className="rounded-xl p-3.5 flex items-center gap-3"
                        style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: '#f0f4ff' }}>
                          <span className="text-[16px]">{icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold truncate" style={{ color: '#1a1a2e' }}>{att.file_name}</p>
                          <p className="text-[11px]" style={{ color: '#94a3b8' }}>
                            {formatFileSize(att.file_size)} · {new Date(att.created_at).toLocaleDateString(dateLocale)}
                          </p>
                        </div>
                        <button onClick={async () => {
                            const r = await fetch(`/api/leads/${leadId}/attachments/download?path=${encodeURIComponent(att.file_path)}`)
                            const d = await r.json()
                            if (d.url) window.open(d.url, '_blank')
                          }}
                          className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg"
                          style={{ background: '#eef2ff', color: '#6366f1' }}>
                          {L('Baixar', 'Download', 'Descargar')}
                        </button>
                        <button onClick={() => deleteAttachment(att.id)}
                          className="text-[10px] font-bold px-2 py-1.5 rounded-lg"
                          style={{ background: '#fef2f2', color: '#ef4444' }}>
                          ✕
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'forms' && (
            <LeadFormsTab leadId={leadId} buyerId={buyerId} />
          )}
        </div>
      </div>

      {showSendMsg && lead && (
        <SendMessageModal
          lead={{ id: leadId, name: lead.name, phone: lead.phone, email: lead.email, state: lead.state, city: lead.city, interest: lead.interest }}
          agent={{ id: buyerId }}
          onClose={() => setShowSendMsg(false)}
          onSent={() => loadFollowUps()}
        />
      )}
    </>
  )
}
