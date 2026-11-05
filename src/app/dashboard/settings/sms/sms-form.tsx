'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n-client'

type Tpl = { id: string; name: string; body: string; is_default: boolean }
const MAX = 320

export function SmsForm() {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [tpls, setTpls] = useState<Tpl[]>([])
  const [auto, setAuto] = useState(true)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState<{ id?: string; name: string; body: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const r = await fetch('/api/sms-templates', { cache: 'no-store' })
      if (!r.ok) throw new Error()
      const d = await r.json(); setTpls(d.templates || []); setAuto(d.auto_enabled !== false); setErr('')
    } catch { setErr(L('Não foi possível carregar.', 'Could not load.', 'No se pudo cargar.')) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true); setErr('')
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || L('Não salvou.', 'Not saved.', 'No se guardó.')); setBusy(false); return false }
      await load(); setBusy(false); return true
    } catch { setErr(L('Sem conexão.', 'No connection.', 'Sin conexión.')); setBusy(false); return false }
  }

  const card = { background: 'var(--bg-card)', border: '1px solid var(--border)' } as const
  const defaultText = L('Texto padrão do sistema: “Oi {nome}! Aqui é {corretor}. Tentei te ligar sobre sua cotação de seguro de vida, mas não consegui falar com você. Pode me retornar por aqui?” (no idioma do lead).',
    'System default text: “Hi {name}! This is {agent}. I tried to call you about your life insurance quote, but I couldn’t reach you. Can you reply here?” (in the lead’s language).',
    'Texto predeterminado: «¡Hola {nombre}! Soy {agente}. Intenté llamarte sobre tu cotización de seguro de vida, pero no pude comunicarme contigo. ¿Puedes responderme por aquí?» (en el idioma del lead).')

  if (loading) return <p className="text-[13px]" style={{ color: 'var(--fg-muted)' }}>…</p>
  return (
    <div className="space-y-6">
      {err && <div className="rounded-xl p-3 text-[13px]" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>{err}</div>}

      <section className="rounded-2xl p-5" style={card}>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <h2 className="text-[15px] font-extrabold" style={{ color: 'var(--fg)' }}>{L('Enviar SMS automático', 'Send automatic SMS', 'Enviar SMS automático')}</h2>
            <p className="text-[12.5px] mt-1" style={{ color: 'var(--fg-secondary)' }}>
              {auto ? L('Ligado: ligação sem contato dispara o SMS.', 'On: a call with no contact triggers the SMS.', 'Activado: una llamada sin contacto envía el SMS.')
                    : L('Desligado: nenhuma ligação sua dispara SMS.', 'Off: none of your calls trigger an SMS.', 'Desactivado: ninguna llamada tuya envía SMS.')}
            </p>
          </div>
          <button type="button" disabled={busy} onClick={() => call('/api/sms-templates/auto', 'PUT', { enabled: !auto })}
            className="w-11 h-6 rounded-full relative shrink-0 disabled:opacity-50" style={{ background: auto ? '#10b981' : '#d1d5db' }} aria-label="toggle">
            <span className="absolute w-5 h-5 bg-white rounded-full top-0.5 shadow" style={{ left: auto ? '22px' : '2px', transition: 'left .2s' }} />
          </button>
        </div>
        <p className="text-[12px] mt-3" style={{ color: 'var(--fg-muted)' }}>
          {L('Durante a ligação, o painel do telefone tem o seletor “SMS se não atender” para trocar o texto ou não enviar só naquela ligação.',
             'During the call, the phone panel has an “SMS if no answer” selector to change the text or skip it for that call only.',
             'Durante la llamada, el panel del teléfono tiene el selector «SMS si no contesta» para cambiar el texto u omitirlo solo en esa llamada.')}
        </p>
      </section>

      <section className="rounded-2xl p-5" style={card}>
        <div className="flex items-center mb-3">
          <h2 className="text-[15px] font-extrabold flex-1" style={{ color: 'var(--fg)' }}>{L('Seus modelos', 'Your templates', 'Tus modelos')}</h2>
          <button type="button" onClick={() => setEditing({ name: '', body: '' })} className="px-3 py-1.5 rounded-lg text-[12px] font-bold text-white bg-violet-600 hover:bg-violet-700">+ {L('Novo modelo', 'New template', 'Nuevo modelo')}</button>
        </div>
        <p className="text-[12px] mb-3" style={{ color: 'var(--fg-muted)' }}>{defaultText}</p>
        {tpls.length === 0 && <p className="text-[13px]" style={{ color: 'var(--fg-secondary)' }}>{L('Nenhum modelo ainda: vale o texto padrão.', 'No templates yet: the default text applies.', 'Aún no hay modelos: vale el texto predeterminado.')}</p>}
        <div className="space-y-2">
          {tpls.map(x => (
            <div key={x.id} className="rounded-xl p-3" style={{ border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <b className="text-[13px] flex-1" style={{ color: 'var(--fg)' }}>{x.name}{x.is_default && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-extrabold">{L('PADRÃO', 'DEFAULT', 'PREDETERMINADO')}</span>}</b>
                <button type="button" disabled={busy} onClick={() => call(`/api/sms-templates/${x.id}`, 'PATCH', { is_default: !x.is_default })} className="text-[12px] font-semibold text-violet-700 disabled:opacity-50">{x.is_default ? L('Tirar padrão', 'Unset default', 'Quitar predeterminado') : L('Usar como padrão', 'Make default', 'Usar como predeterminado')}</button>
                <button type="button" onClick={() => setEditing({ id: x.id, name: x.name, body: x.body })} className="text-[12px] font-semibold" style={{ color: 'var(--fg-secondary)' }}>{L('Editar', 'Edit', 'Editar')}</button>
                <button type="button" disabled={busy} onClick={() => { if (confirm(L('Apagar este modelo?', 'Delete this template?', '¿Eliminar este modelo?'))) call(`/api/sms-templates/${x.id}`, 'DELETE') }} className="text-[12px] font-semibold text-red-600 disabled:opacity-50">{L('Apagar', 'Delete', 'Eliminar')}</button>
              </div>
              <p className="text-[12.5px] mt-1.5 whitespace-pre-wrap" style={{ color: 'var(--fg-secondary)' }}>{x.body}</p>
            </div>
          ))}
        </div>
      </section>

      {editing && (
        <section className="rounded-2xl p-5" style={{ ...card, borderColor: 'rgba(139,92,246,0.45)' }}>
          <h2 className="text-[15px] font-extrabold mb-3" style={{ color: 'var(--fg)' }}>{editing.id ? L('Editar modelo', 'Edit template', 'Editar modelo') : L('Novo modelo', 'New template', 'Nuevo modelo')}</h2>
          <input value={editing.name} maxLength={60} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder={L('Nome (ex.: Cotação de vida)', 'Name (e.g. Life quote)', 'Nombre (ej.: Cotización de vida)')} className="w-full mb-2 px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid var(--border)', background: 'var(--bg)' }} />
          <textarea value={editing.body} maxLength={MAX} rows={4} onChange={e => setEditing({ ...editing, body: e.target.value })} placeholder={L('Oi {nome}! Aqui é {corretor}. …', 'Hi {nome}! This is {corretor}. …', '¡Hola {nome}! Soy {corretor}. …')} className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid var(--border)', background: 'var(--bg)' }} />
          <p className="text-[11.5px] mt-1" style={{ color: 'var(--fg-muted)' }}>
            {editing.body.length}/{MAX} · {L('Variáveis: {nome} (primeiro nome do lead) e {corretor} (seu nome). Escreva no seu idioma: o sistema traduz para o idioma do lead antes de enviar.', 'Variables: {nome} (lead’s first name) and {corretor} (your name). Write in your language: the system translates it to the lead’s language before sending.', 'Variables: {nome} (nombre del lead) y {corretor} (tu nombre). Escribe en tu idioma: el sistema lo traduce al idioma del lead antes de enviar.')}
          </p>
          <div className="flex gap-2 mt-3">
            <button type="button" disabled={busy || !editing.name.trim() || !editing.body.trim()} onClick={async () => { const ok = editing.id ? await call(`/api/sms-templates/${editing.id}`, 'PATCH', { name: editing.name, body: editing.body }) : await call('/api/sms-templates', 'POST', { name: editing.name, body: editing.body }); if (ok) setEditing(null) }} className="px-4 py-2 rounded-lg text-[13px] font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50">{L('Salvar', 'Save', 'Guardar')}</button>
            <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ border: '1px solid var(--border)', color: 'var(--fg-secondary)' }}>{L('Cancelar', 'Cancel', 'Cancelar')}</button>
          </div>
        </section>
      )}

      <p className="text-[12px]" style={{ color: 'var(--fg-muted)' }}>
        {L('Todo SMS termina com “Responda STOP para parar.” (no idioma do lead), automaticamente. Regras que não mudam, para proteger você: só entre 8h e 21h no horário do lead (fora disso, fica agendado), no máximo 1 SMS por dia por lead, 14 no total, e nunca se o lead pediu STOP ou já respondeu.',
           'Every SMS ends with “Reply STOP to stop.” (in the lead’s language), automatically. Rules that never change, to protect you: only 8 AM–9 PM in the lead’s time (outside that, it is scheduled), at most 1 SMS per day per lead, 14 in total, and never if the lead sent STOP or already replied.',
           'Todo SMS termina con «Responde STOP para parar.» (en el idioma del lead), automáticamente. Reglas que no cambian, para protegerte: solo de 8 a 21 h en la hora del lead (fuera de eso queda programado), máximo 1 SMS al día por lead, 14 en total, y nunca si el lead envió STOP o ya respondió.')}
      </p>
    </div>
  )
}
