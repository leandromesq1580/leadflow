'use client'

import React, { useEffect, useId, useRef, useState } from 'react'
import { validAISchedule, type AISequenceConfig } from '@/lib/ai-sequence-config'
import { AI_SEQUENCE_MODELS, LEGACY_AI_SEQUENCE_MODEL } from '@/lib/ai-sequence-models'
import { durationMinutes, durationSummary, durationValue, preferredDurationUnit, type DurationUnit } from '@/lib/ai-sequence-form'
import { sequenceJSON } from '@/lib/sequence-client'

const field = 'w-full min-h-11 min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15'
const help = 'text-xs leading-relaxed text-[var(--fg-secondary)]'
const zones = [
  ['America/New_York', 'Nova York · Leste (Flórida)'],
  ['America/Chicago', 'Chicago · Central'],
  ['America/Denver', 'Denver · Montanhas'],
  ['America/Phoenix', 'Phoenix · Arizona'],
  ['America/Los_Angeles', 'Los Angeles · Pacífico'],
  ['America/Anchorage', 'Anchorage · Alasca'],
  ['Pacific/Honolulu', 'Honolulu · Havaí'],
]

function DurationField({ label, minutes, minimum, onChange }: { label: string; minutes: number; minimum: number; onChange: (minutes: number) => void }) {
  const id = useId()
  const [unit, setUnit] = useState<DurationUnit>(() => preferredDurationUnit(minutes))
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? durationValue(minutes, unit)
  const invalid = !Number.isInteger(minutes) || minutes < minimum || minutes > 43200
  return <div className="min-w-0 space-y-2">
    <label htmlFor={id} className="block text-sm font-medium">{label}</label>
    <div className="grid grid-cols-[minmax(0,1fr)_108px] gap-2">
      <input id={id} type="text" inputMode="decimal" maxLength={30} value={value} aria-invalid={invalid} aria-describedby={`${id}-help`}
        className={field} onChange={e => { setDraft(e.target.value); onChange(durationMinutes(e.target.value, unit, minimum)) }} />
      <select aria-label={`Unidade de ${label.toLowerCase()}`} className={field} value={unit}
        onChange={e => { const next = e.target.value as DurationUnit; setDraft(value); setUnit(next); onChange(durationMinutes(value, next, minimum)) }}>
        <option value="minutes">minutos</option><option value="hours">horas</option><option value="days">dias</option>
      </select>
    </div>
    <div role="group" aria-label={`Atalhos de ${label.toLowerCase()}`} className="flex flex-wrap gap-1.5">
      {(minimum === 0 ? [0, 10, 30, 60, 1440] : [10, 30, 60, 1440]).map(preset => <button key={preset} type="button"
        className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 text-xs font-medium hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        onClick={() => { const next = preferredDurationUnit(preset); setUnit(next); setDraft(durationValue(preset, next)); onChange(preset) }}>
        {preset === 0 ? 'Agora' : preset === 60 ? '1 h' : preset === 1440 ? '1 dia' : `${preset} min`}
      </button>)}
    </div>
    {!invalid && <p className="text-sm font-medium" aria-live="polite">{minimum === 0 ? minutes === 0 ? 'Sem espera inicial, dentro da agenda.' : `Começar após ${durationSummary(minutes)}.` : `Repetir a cada ${durationSummary(minutes)}.`}</p>}
    <p className={help}>Ao trocar a unidade, o número digitado é mantido e a duração muda.</p>
    <p id={`${id}-help`} className={invalid ? 'text-xs text-red-600' : help} role={invalid ? 'alert' : undefined}>
      {invalid ? `Informe uma duração de ${minimum === 0 ? '0 minutos' : '1 minuto'} a 30 dias, em minutos inteiros. Sem arredondamento.` : minimum === 0 ? 'Use 0 para começar na próxima oportunidade dentro da agenda.' : 'De 1 minuto a 30 dias entre mensagens.'}
    </p>
  </div>
}

function ClockField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId()
  const [hour24, savedMinute] = value.split(':')
  const [clock, setClock] = useState(() => ({ hour: String(Number(hour24) % 12 || 12), minute: savedMinute ?? '', period: Number(hour24) >= 12 ? 'PM' : 'AM' }))
  const invalid = !/^\d{1,2}$/.test(clock.minute) || Number(clock.minute) > 59
  function change(patch: Partial<typeof clock>) {
    const next = { ...clock, ...patch }
    setClock(next)
    const valid = /^\d{1,2}$/.test(next.minute) && Number(next.minute) <= 59
    const hour = Number(next.hour) % 12 + (next.period === 'PM' ? 12 : 0)
    onChange(valid ? `${String(hour).padStart(2, '0')}:${next.minute.padStart(2, '0')}` : '')
  }
  return <fieldset className="min-w-0 space-y-2">
    <legend className="mb-2 text-sm font-medium">{label}</legend>
    <div className="grid grid-cols-3 gap-2">
      <label className={help}>Hora
        <select aria-label={`Hora de ${label}`} className={`${field} mt-1`} value={clock.hour} onChange={e => change({ hour: e.target.value })}>
          {Array.from({ length: 12 }, (_, n) => <option key={n + 1} value={n + 1}>{n + 1}</option>)}
        </select>
      </label>
      <label className={help}>Minuto
        <input aria-label={`Minuto de ${label}`} aria-invalid={invalid} aria-describedby={`${id}-help`} className={`${field} mt-1`} type="text" inputMode="numeric" maxLength={2} placeholder="00" value={clock.minute}
          onChange={e => change({ minute: e.target.value })} onBlur={() => { if (!invalid) change({ minute: clock.minute.padStart(2, '0') }) }} />
      </label>
      <label className={help}>Período
        <select aria-label={`Período de ${label}`} className={`${field} mt-1`} value={clock.period} onChange={e => change({ period: e.target.value })}>
          <option value="AM">AM</option><option value="PM">PM</option>
        </select>
      </label>
    </div>
    <p id={`${id}-help`} className={invalid ? 'text-xs text-red-600' : help} role={invalid ? 'alert' : undefined}>
      {invalid ? 'Informe o minuto de 00 a 59.' : '12 AM = meia-noite · 12 PM = meio-dia.'}
    </p>
  </fieldset>
}

export function AISequenceFields({ value: c, onChange }: { value: AISequenceConfig; onChange: (c: AISequenceConfig) => void }) {
  const id = useId()
  const [tab, setTab] = useState<'message' | 'schedule'>('message')
  const [locale, setLocale] = useState('pt')
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const request = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const snapshot = JSON.stringify({ c, locale })
  const currentSnapshot = useRef(snapshot)
  useEffect(() => {
    currentSnapshot.current = snapshot
    request.current += 1
    controller.current?.abort()
    setBusy(false); setPreview(''); setError('')
  }, [snapshot])
  useEffect(() => () => { request.current += 1; controller.current?.abort() }, [])
  const update = (patch: Partial<AISequenceConfig>) => {
    request.current += 1
    controller.current?.abort()
    setBusy(false); setPreview(''); setError('')
    onChange({ ...c, ...patch })
  }
  async function example() {
    const token = ++request.current
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    setBusy(true); setError(''); setPreview('')
    try {
      const result = await sequenceJSON('/api/sequences/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal, body: JSON.stringify({ ai_config: c, locale }) })
      if (token !== request.current || snapshot !== currentSnapshot.current) return
      if (typeof result.body !== 'string' || !result.body.trim()) throw new Error('A geração não retornou uma mensagem. Tente novamente.')
      setPreview(result.body)
    } catch (e) {
      if (token === request.current && !abort.signal.aborted) setError(e instanceof Error ? e.message : 'Não foi possível gerar. Tente novamente.')
    } finally { if (token === request.current) setBusy(false) }
  }
  const modelId = c.model ?? LEGACY_AI_SEQUENCE_MODEL
  const selectedModel = AI_SEQUENCE_MODELS.find(model => model.id === modelId)
  const validSchedule = validAISchedule(c)
  return <section className="grid min-w-0 gap-6 text-[var(--fg)] lg:grid-cols-[minmax(0,1fr)_320px]" aria-label="Configuração da sequência IA">
    <div className="min-w-0">
      <div className="mb-5 flex gap-5 border-b border-[var(--border)]" role="tablist" aria-label="Configuração IA">
        {([['message', 'Mensagem'], ['schedule', 'Agenda de envio']] as const).map(([key, label]) => <button key={key} type="button" role="tab" id={`${id}-${key}-tab`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} aria-controls={`${id}-${key}`} onClick={() => setTab(key)} onKeyDown={event => {
          if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const next = event.key === 'Home' ? 'message' : event.key === 'End' ? 'schedule' : key === 'message' ? 'schedule' : 'message'
          setTab(next)
          document.getElementById(`${id}-${next}-tab`)?.focus()
        }}
          className={`border-b-2 px-1 pb-3 text-sm font-semibold ${tab === key ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--fg-secondary)]'}`}>{label}{key === 'schedule' && !validSchedule ? ' · Revisar' : ''}</button>)}
      </div>
      <div id={`${id}-message`} role="tabpanel" aria-labelledby={`${id}-message-tab`} hidden={tab !== 'message'} className="space-y-5">
        <fieldset><legend className="mb-2 text-sm font-medium">Objetivo final</legend>
          <div className="grid grid-cols-2 gap-3">
            {([['call', 'Obter ligação', 'Ligação após despertar interesse.'], ['meeting', 'Combinar reunião', 'Reunião após despertar interesse.']] as const).map(([goal, title, detail]) => <label key={goal} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${c.goal === goal ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border)]'}`}>
              <input type="radio" name={`${id}-goal`} value={goal} checked={c.goal === goal} onChange={() => update({ goal })} className="mt-1 accent-[var(--accent)]" />
              <span><span className="block text-sm font-semibold">{title}</span><span className={help}>{detail}</span></span>
            </label>)}
          </div>
        </fieldset>
        <p className={help}>Primeiro passo: conseguir uma resposta com uma pergunta curta e natural. Ao responder, a sequência para e você assume.</p>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor={`${id}-instructions`} className="text-sm font-medium">Instruções da IA</label><span className={help}>{(c.instructions ?? '').length}/6000</span></div>
          <textarea id={`${id}-instructions`} className={`${field} min-h-[240px] resize-y`} rows={10} maxLength={6000} value={c.instructions ?? ''} onChange={e => update({ instructions: e.target.value })} aria-describedby={`${id}-instructions-help`} placeholder={'PROPÓSITO\nO que você deseja alcançar?\n\nMODO DE ATUAÇÃO\nExplique como funciona seu atendimento.\n\nABORDAGEM\nComo conduzir a conversa, sem pressão?\n\nTOM DE FALA\nEx.: acolhedor, simples e direto.'} />
          <p id={`${id}-instructions-help`} className={help}>Opcional. Oriente perguntas e voz: pergunte se já conhece o life insurance ou tem proteção familiar. Uma pergunta por mensagem, antes de pedir ligação/reunião. Para convite direto, escreva uma frase separada: Convide diretamente para uma ligação. (ou: Convide diretamente para uma reunião.) Guia principal de propósito, funcionamento, abordagem e tom para esta sequência; não treina o modelo permanentemente. A IA segue o idioma do lead, o objetivo escolhido e as regras de segurança do app. Não inclua dados privados de leads nem conversas. Use o campo de apresentação abaixo para seu nome profissional.</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2"><label htmlFor={`${id}-brief`} className="text-sm font-medium">Brief da conversa</label><span className={help}>{c.brief.length}/300</span></div>
          <textarea id={`${id}-brief`} className={`${field} min-h-[116px] resize-y`} rows={4} maxLength={300} value={c.brief} onChange={e => update({ brief: e.target.value })} aria-describedby={`${id}-privacy`} placeholder="Ex.: Apresente proteção familiar em linguagem simples. Tom acolhedor, sem pressão para fechar." />
          <p id={`${id}-privacy`} className={help}>Contexto comercial complementar: conte o que destacar. Não inclua nomes, contatos, renda, saúde ou conversas de leads.</p>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor={`${id}-presentation`} className="text-sm font-medium">Como você gosta de se apresentar? <span className="font-normal text-[var(--fg-secondary)]">(opcional)</span></label><span className={help}>{(c.presentation ?? '').length}/300</span></div>
          <textarea id={`${id}-presentation`} className={`${field} min-h-[96px] resize-y`} rows={3} maxLength={300} value={c.presentation ?? ''} onChange={e => update({ presentation: e.target.value })} aria-describedby={`${id}-presentation-help`} placeholder="Ex.: Oi, sou Ana, agente de life insurance. Gosto de conversar de forma simples e sem pressão." />
          <p id={`${id}-presentation-help`} className={help}>Sugira seu próprio jeito, abordagem ou exemplo de abertura. Vale seu nome profissional. A IA usa como referência adaptada ao idioma do lead, não um texto fixo repetido. Não inclua dados de leads, contatos, saúde ou renda, nem licenças ou credenciais.</p>
        </div>
        <div className="space-y-2">
          <label htmlFor={`${id}-model`} className="block text-sm font-medium">Modelo de IA</label>
          <select id={`${id}-model`} className={field} value={modelId} onChange={e => update({ model: e.target.value as AISequenceConfig['model'] })}>
            {!selectedModel && modelId && <option value={modelId}>{modelId} · modelo salvo</option>}
            {AI_SEQUENCE_MODELS.map(model => <option key={model.id} value={model.id}>{'provider' in model ? String(model.provider) : 'OpenAI'} · {model.id}</option>)}
          </select>
          <p className={help}>{selectedModel?.description || 'Modelo salvo preservado. Se não estiver disponível, escolha outro modelo antes de gerar.'}</p>
        </div>
        {c.goal === 'meeting' && <label className="block space-y-2 text-sm font-medium">URL de agendamento <span className="font-normal text-[var(--fg-secondary)]">(opcional)</span>
          <input className={field} type="url" maxLength={250} value={c.booking_url} onChange={e => update({ booking_url: e.target.value })} placeholder="https://sua-agenda.com" />
          <span className={`${help} block font-normal`}>O link será incluído no convite. Não confirma disponibilidade na agenda.</span>
        </label>}
      </div>
      <div id={`${id}-schedule`} role="tabpanel" aria-labelledby={`${id}-schedule-tab`} hidden={tab !== 'schedule'} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <DurationField label="Espera inicial" minutes={c.initial_delay_minutes} minimum={0} onChange={initial_delay_minutes => update({ initial_delay_minutes })} />
          <DurationField label="Intervalo entre envios" minutes={c.repeat_minutes} minimum={1} onChange={repeat_minutes => update({ repeat_minutes })} />
        </div>
        {Number.isInteger(c.repeat_minutes) && c.repeat_minutes >= 1 && c.repeat_minutes < 60 && <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-[var(--fg)]">Intervalos curtos podem gerar muitas mensagens e aumentar o custo. Considere um intervalo maior.</p>}
        <label className="block space-y-2 text-sm font-medium">Fuso dos envios
          <select aria-label="Fuso dos envios" className={field} value={c.timezone} onChange={e => update({ timezone: e.target.value })}>
            {!zones.some(([zone]) => zone === c.timezone) && <option value={c.timezone}>{c.timezone} · fuso salvo</option>}
            {zones.map(([zone, label]) => <option key={zone} value={zone}>{label}</option>)}
          </select>
        </label>
        <fieldset><legend className="mb-2 text-sm font-medium">Dias de envio</legend>
          <div className="grid grid-cols-7 gap-1.5">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, n) => <label key={day} className="min-w-0 cursor-pointer text-center">
            <input className="peer sr-only" type="checkbox" aria-label={day} checked={c.days.includes(n)} onChange={e => update({ days: e.target.checked ? [...c.days, n] : c.days.filter(d => d !== n) })} />
            <span className="block rounded-lg border border-[var(--border)] py-3 text-xs font-semibold peer-checked:border-[var(--accent)] peer-checked:bg-[var(--accent)] peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]">{day}</span>
          </label>)}</div>
          {!c.days.length && <p role="alert" className="mt-2 text-xs text-red-600">Escolha ao menos um dia de envio.</p>}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2"><ClockField label="A partir de" value={c.start} onChange={start => update({ start })} /><ClockField label="Até" value={c.end} onChange={end => update({ end })} /></div>
        {c.start >= c.end && <p role="alert" className="text-xs text-red-600">O horário final deve ser depois do início, no mesmo dia.</p>}
        <p className={help}>Mensagens somente nesses dias e horários, antes do horário final. Fora da janela, aguardam a próxima abertura. Pode haver alguns minutos de espera; o recebimento de leads não muda.</p>
        <label className="flex items-start gap-2.5 rounded-lg border border-[var(--border)] p-3 text-sm"><input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={c.stop_on_stage_exit} onChange={e => update({ stop_on_stage_exit: e.target.checked })} /><span>Parar ao sair do estágio gatilho<span className={`${help} mt-1 block`}>Evita continuar o contato quando o lead avançar no funil.</span></span></label>
      </div>
    </div>
    <aside className="min-w-0 self-start rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 lg:sticky lg:top-0" aria-label="Prévia e resumo">
      <div className="mb-4 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Prévia da mensagem</h3><span className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1 text-[10px] font-medium text-[var(--fg-secondary)]">WhatsApp</span></div>
      <div aria-live="polite" aria-busy={busy} className="mb-4 min-h-[174px] rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        {busy ? <div role="status" className="space-y-3"><p className="text-sm font-medium">Gerando com IA…</p><p className={help}>Preparando um exemplo com o modelo, suas instruções, o brief e sua sugestão de apresentação.</p><div className="h-2 w-4/5 animate-pulse rounded bg-[var(--border)]" /><div className="h-2 w-3/5 animate-pulse rounded bg-[var(--border)]" /></div>
          : error ? <div role="alert"><p className="mb-2 text-sm font-semibold">Não foi possível gerar</p><p className="break-words text-xs leading-relaxed text-red-600">{error}</p><p className={`${help} mt-3`}>Seu rascunho foi mantido. Nenhuma mensagem enviada.</p></div>
          : preview ? <><p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-secondary)]">Exemplo gerado · revise antes de ativar</p><blockquote className="whitespace-pre-wrap break-words text-sm leading-relaxed">{preview}</blockquote></>
          : <div className="py-3"><p className="mb-2 text-sm font-medium">Veja como a conversa começa</p><p className={help}>Defina o objetivo e suas instruções, depois gere uma mensagem para revisar. Nada será enviado a um lead.</p></div>}
      </div>
      <label className="mb-3 block space-y-2 text-xs font-medium">Idioma do exemplo<select aria-label="Idioma do exemplo" className={field} value={locale} onChange={e => { request.current += 1; controller.current?.abort(); setBusy(false); setPreview(''); setError(''); setLocale(e.target.value) }}><option value="pt">Português</option><option value="es">Español</option><option value="en">English</option></select></label>
      <button type="button" disabled={busy || !validSchedule} onClick={example} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-sm font-semibold transition-colors hover:border-[var(--accent)] disabled:opacity-50">{busy ? 'Gerando…' : error ? 'Tentar novamente (não envia)' : 'Gerar exemplo (não envia)'}</button>
      <p className={`${help} mt-2`}>Os envios reais seguem o idioma cadastrado do lead.</p>
      <div className="mt-5 border-t border-[var(--border)] pt-4"><p className="mb-2 text-xs font-semibold">Seu plano de contato</p><p className="text-sm leading-relaxed">{c.initial_delay_minutes === 0 ? 'Sem espera inicial, dentro da agenda' : `Começa após ${durationSummary(c.initial_delay_minutes)}`}. Depois, a cada {durationSummary(c.repeat_minutes)}, dentro da agenda.</p><p className={`${help} mt-3`}>A IA redige em seu nome, com sua abordagem e sem repetir a apresentação. Qualquer resposta encerra a sequência e o humano assume.</p></div>
    </aside>
  </section>
}
