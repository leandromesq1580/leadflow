'use client'

import { createContext, useContext, useRef, useState, type ReactNode, type FormEvent } from 'react'
import { LOCALES, slotLabel, type BookingLang } from '@/lib/equipe-booking'

const TEXT = {
 en: { title:'Schedule a call', intro:'Choose a 30-minute conversation about joining the team. No WhatsApp needed.', name:'Full name', email:'Email', phone:'Phone (with country code)', zone:'Times in your time zone', day:'Day', time:'Time', choose:'Choose a time', submit:'Confirm booking', close:'Close', loading:'Loading available times…', retry:'Try again', empty:'No times available. Please try again later.', unavailable:'We could not confirm your booking. Please try again.', invalid:'Check your details and choose an available time. Include the country code in your phone number.', slot_taken:'That time was just booked. Please choose another.', rate_limited:'Booking limit reached. Please try again tomorrow.', success:'Your conversation is booked.', saved:'Save this date and time. This page is your confirmation; no automatic email or SMS is sent.', privacy:'By booking, you agree that our team may contact you about recruitment.', busy:'Confirming…' },
 pt: { title:'Agendar uma conversa', intro:'Escolha 30 minutos para conversar sobre entrar na equipe. Não precisa de WhatsApp.', name:'Nome completo', email:'E-mail', phone:'Telefone (com código do país)', zone:'Horários no seu fuso', day:'Dia', time:'Horário', choose:'Escolha um horário', submit:'Confirmar agendamento', close:'Fechar', loading:'Carregando horários disponíveis…', retry:'Tentar novamente', empty:'Nenhum horário disponível. Tente novamente mais tarde.', unavailable:'Não foi possível confirmar seu agendamento. Tente novamente.', invalid:'Confira os dados e escolha um horário disponível. Inclua o código do país no telefone.', slot_taken:'Esse horário acabou de ser reservado. Escolha outro.', rate_limited:'Limite de agendamentos atingido. Tente novamente amanhã.', success:'Sua conversa está agendada.', saved:'Guarde esta data e horário. Esta tela é sua confirmação; não enviamos e-mail ou SMS automático.', privacy:'Ao agendar, você concorda que nossa equipe entre em contato sobre recrutamento.', busy:'Confirmando…' },
 es: { title:'Agendar una llamada', intro:'Elige 30 minutos para conversar sobre unirte al equipo. No necesitas WhatsApp.', name:'Nombre completo', email:'Correo electrónico', phone:'Teléfono (con código de país)', zone:'Horarios en tu zona horaria', day:'Día', time:'Hora', choose:'Elige un horario', submit:'Confirmar cita', close:'Cerrar', loading:'Cargando horarios disponibles…', retry:'Intentar de nuevo', empty:'No hay horarios disponibles. Intenta más tarde.', unavailable:'No pudimos confirmar tu cita. Intenta de nuevo.', invalid:'Revisa tus datos y elige un horario disponible. Incluye el código de país en el teléfono.', slot_taken:'Ese horario acaba de reservarse. Elige otro.', rate_limited:'Límite de citas alcanzado. Intenta mañana.', success:'Tu conversación está agendada.', saved:'Guarda esta fecha y hora. Esta pantalla es tu confirmación; no se envía correo ni SMS automático.', privacy:'Al reservar, aceptas que nuestro equipo te contacte sobre reclutamiento.', busy:'Confirmando…' },
}
const OpenBooking = createContext<() => void>(() => {})
export function BookingButton({ children, small = false }: { children: ReactNode; small?: boolean }) {
 const open = useContext(OpenBooking)
 return <button type="button" className={`eq-btn${small ? ' eq-btn-sm' : ''}`} onClick={open}>{children}</button>
}
export function LanguageLink({ href, children }: { href: string; children: ReactNode }) {
 return <a href={href} onClick={e => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); window.location.assign(href + window.location.search) } }}>{children}</a>
}

export default function BookingProvider({ lang, children }: { lang: BookingLang; children: ReactNode }) {
 const t = TEXT[lang], dialog = useRef<HTMLDialogElement>(null), active = useRef(false)
 const [zone, setZone] = useState('UTC'), [slots, setSlots] = useState<string[]>([])
 const [day, setDay] = useState(''), [slot, setSlot] = useState(''), [loading, setLoading] = useState(false)
 const [error, setError] = useState(''), [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState('')
 const request = useRef({ signature:'', id:'' }), loadId = useRef(0)
 const dayOf = (s: string, z = zone) => new Intl.DateTimeFormat('en-CA', {timeZone:z,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s))
 async function load(z: string) {
  const id = ++loadId.current
  setLoading(true); setSlots([]); setSlot('')
  try {
   const res = await fetch('/api/equipe/agendar', {cache:'no-store', signal:AbortSignal.timeout(15000)})
   const data = await res.json()
   if (!res.ok || !Array.isArray(data.slots)) throw Error()
   if (id !== loadId.current) return
   setSlots(data.slots); setDay(data.slots[0] ? dayOf(data.slots[0],z) : '')
  } catch { if (id === loadId.current) setError(t.unavailable) }
  finally { if (id === loadId.current) setLoading(false) }
 }
 function open() {
  const z = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  setZone(z); dialog.current?.showModal()
  if (!confirmed) { setError(''); void load(z) }
 }
 async function submit(e: FormEvent<HTMLFormElement>) {
  e.preventDefault()
  if (active.current || !slot) return
  active.current = true; setBusy(true); setError('')
  const form = new FormData(e.currentTarget), tracking: Record<string,string> = {}
  for (const [key,value] of new URLSearchParams(window.location.search)) if (key.startsWith('utm_') || key === 'campaign_id') tracking[key] = value
  const payload = {nome:form.get('nome'),email:form.get('email'),telefone:form.get('telefone'),website:form.get('website'),idioma:lang,fuso:zone,slot,tracking}
  const signature = JSON.stringify(payload)
  if (request.current.signature !== signature) request.current = {signature,id:crypto.randomUUID()}
  try {
   const res = await fetch('/api/equipe/agendar', {method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,requestId:request.current.id}),signal:AbortSignal.timeout(20000)})
   const data = await res.json()
   if (!res.ok || data.ok !== true) {
    const code = data.code as keyof typeof t
    setError(['invalid','slot_taken','rate_limited'].includes(code) ? t[code] : t.unavailable)
    if (code === 'slot_taken') await load(zone)
    return
   }
   setConfirmed(data.slot)
  } catch { setError(t.unavailable) }
  finally { active.current=false; setBusy(false) }
 }
 const days = [...new Set(slots.map(s => dayOf(s)))]
 return <OpenBooking.Provider value={open}>{children}
  <style>{`.eq button{font-family:inherit;cursor:pointer}.eq-btn{border:0}.eq-book{color:var(--txt);background:#0a0e1a;border:1px solid #65519b;border-radius:22px;width:min(560px,calc(100vw - 28px));max-height:90dvh;overflow:auto;padding:26px;margin:auto;box-shadow:0 24px 80px #0009}.eq-book::backdrop{background:#04060cbb;backdrop-filter:blur(5px)}.eq-book h2{font-size:26px;margin:0 0 12px}.eq-book p{color:var(--mut);font-size:14px}.eq-book label{display:grid;gap:5px;font-size:14px;margin:12px 0}.eq-book input,.eq-book select{width:100%;min-width:0;background:#151b2b;color:#eef1f8;border:1px solid #68738c;border-radius:9px;padding:11px;font:inherit;color-scheme:dark}.eq-book input:focus,.eq-book select:focus,.eq-book button:focus-visible{outline:2px solid #c4b5fd;outline-offset:3px}.eq-book-close{float:right;color:var(--txt);background:none;border:0;padding:6px 10px}.eq-book .eq-btn{width:100%;margin-top:12px}.eq-book button:disabled{opacity:.55;cursor:wait}.eq-book .eq-book-error{color:#fda4af}.eq-book-hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}`}</style>
  <dialog ref={dialog} className="eq-book" aria-labelledby="eq-book-title" onCancel={e => { if (busy) e.preventDefault() }}>
   <button type="button" className="eq-book-close" aria-label={t.close} disabled={busy} onClick={() => dialog.current?.close()}>✕</button>
   <h2 id="eq-book-title">{confirmed ? t.success : t.title}</h2>
   {confirmed ? <div role="status"><strong>{slotLabel(confirmed,lang,zone)}</strong><p>{zone}</p><p>{t.saved}</p></div> : <>
    <p>{t.intro}</p><p>{t.zone}: <strong>{zone}</strong></p>
    {loading && <p role="status">{t.loading}</p>}
    {!loading && !slots.length && !error && <p role="status">{t.empty}</p>}
    <form onSubmit={submit}>
     <fieldset disabled={busy} style={{border:0,padding:0,margin:0}}>
      <label>{t.name}<input autoComplete="name" name="nome" required minLength={2} maxLength={120} /></label>
      <label>{t.email}<input type="email" autoComplete="email" name="email" required maxLength={254} /></label>
      <label>{t.phone}<input type="tel" autoComplete="tel" name="telefone" placeholder="+1 202 555 0123" required maxLength={40} /></label>
      <div className="eq-book-hp" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label>{t.day}<select value={day} disabled={loading || !days.length} onChange={e => {setDay(e.target.value);setSlot('')}}>{days.map(d => <option key={d} value={d}>{new Intl.DateTimeFormat(LOCALES[lang],{timeZone:zone,weekday:'long',month:'long',day:'numeric'}).format(new Date(slots.find(s => dayOf(s)===d)!))}</option>)}</select></label>
      <label>{t.time}<select name="slot" value={slot} required disabled={loading || !slots.length} onChange={e => setSlot(e.target.value)}><option value="">{t.choose}</option>{slots.filter(s => dayOf(s)===day).map(s => <option key={s} value={s}>{new Intl.DateTimeFormat(LOCALES[lang],{timeZone:zone,hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(s))}</option>)}</select></label>
      <p>{t.privacy}</p>
      <button className="eq-btn" type="submit" disabled={busy || loading || !slot}>{busy ? t.busy : t.submit}</button>
     </fieldset>
    </form>
    {error && <p className="eq-book-error" role="alert">{error}</p>}
    {!loading && !slots.length && <button type="button" className="eq-btn" onClick={() => {setError('');void load(zone)}}>{t.retry}</button>}
   </>}
  </dialog>
 </OpenBooking.Provider>
}
