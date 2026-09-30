'use client'

import { actionEditHref } from '@/lib/pipeline-action-links'
import type { StageActionsState } from '@/lib/use-stage-actions'

type Props = { stageId: string; stageName: string; locale: string; state: StageActionsState; returnTo?: string; onRetry?: () => void }
export function StageActionsStrip({stageId,stageName,locale,state,returnTo='/dashboard/pipeline',onRetry}: Props) {
  const L = (pt: string,en: string,es: string) => locale==='en'?en:locale==='es'?es:pt
  const stage = state.status==='ready' ? state.stages.find(s=>s.id===stageId) : undefined
  const unavailable = state.status==='loading' ? L('Carregando…','Loading…','Cargando…') : state.status==='not-applicable' ? L('Não se aplica','Not applicable','No aplica') : state.status==='restricted' ? L('Restrito','Restricted','Restringido') : L('Indisponível','Unavailable','No disponible')
  const active = L('Ativa','Active','Activa'), inactive = L('Inativa','Inactive','Inactiva'), none = L('Nenhuma','None','Ninguna')
  const groups = [['sequences',L('Sequência','Sequence','Secuencia')],['automations',L('Automação','Automation','Automatización')]] as const
  return <div className="mb-2 rounded-lg px-2 py-1 text-[11px]" style={{background:'var(--m-surface, var(--bg-card))',border:'1px solid var(--m-border, var(--border))',color:'var(--m-text, var(--fg))'}} aria-label={L(`Ações de ${stageName}`,`Actions for ${stageName}`,`Acciones de ${stageName}`)}>
    {groups.map(([kind,label])=>{
      if (!stage) return <p key={kind} className="py-1" role="status">{label} · {unavailable}</p>
      const items = stage[kind], enabled = items.filter(item=>item.enabled).length, disabled=items.length-enabled
      const summary = items.length===0 ? none : items.length===1 ? (enabled?active:inactive) : [enabled ? L(`${enabled} ${enabled===1?'ativa':'ativas'}`,`${enabled} active`,`${enabled} ${enabled===1?'activa':'activas'}`) : '',disabled ? L(`${disabled} ${disabled===1?'inativa':'inativas'}`,`${disabled} inactive`,`${disabled} ${disabled===1?'inactiva':'inactivas'}`) : ''].filter(Boolean).join(' · ')
      return <details key={kind} className="group" onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus()}}}>
        <summary className="cursor-pointer rounded py-2 leading-4 focus-visible:outline-2 focus-visible:outline-offset-2" style={{outlineColor:'var(--accent)'}}>{label} · <span className="font-medium">{summary}</span></summary>
        <div className="pb-2 pt-1">
          {items.length===0 ? <p>{L('Nenhuma vinculada a esta etapa.','None linked to this stage.','Ninguna vinculada a esta etapa.')}</p> : <ul className="max-h-[min(16rem,40dvh)] space-y-2 overflow-y-auto overscroll-contain">
            {items.map(item=><li key={item.id} className="rounded-md p-2" style={{background:'var(--m-bg, var(--bg))'}}>
              <p className="break-words font-semibold" style={{color:'var(--m-text, var(--fg))'}}>{item.name}</p>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2"><span>{item.enabled?active:inactive}</span><a className="rounded px-2 py-1 font-semibold underline underline-offset-2 focus-visible:outline-2" style={{color:'var(--m-text, var(--accent))'}} href={actionEditHref(kind,item.id,returnTo)} aria-label={`${L('Editar','Edit','Editar')} ${item.name}`}>{L('Editar','Edit','Editar')}</a></div>
            </li>)}
          </ul>}
          {items.length>0 && <p className="mt-2 leading-relaxed">{L('Estado da configuração; não indica saúde dos envios.','Configuration status; not delivery health.','Estado de configuración; no indica la salud de los envíos.')}</p>}
        </div>
      </details>
    })}
    {state.status==='not-applicable' && <p className="py-1 leading-relaxed">{L('Este membro ainda não possui um pipeline próprio. Ações por etapa não se aplicam a este quadro de leads atribuídos.','This member does not yet have their own pipeline. Stage actions do not apply to this assigned-leads board.','Este miembro aún no tiene un pipeline propio. Las acciones por etapa no se aplican a este tablero de prospectos asignados.')}</p>}
    {state.status==='restricted' && <p className="py-1 leading-relaxed">{L('Somente o dono da conta pode consultar e editar estas ações.','Only the account owner can view and edit these actions.','Solo el titular de la cuenta puede consultar y editar estas acciones.')}</p>}
    {(state.status==='error' || (state.status==='ready'&&!stage)) && onRetry && <button type="button" className="py-2 underline" onClick={onRetry}>{L('Tentar novamente','Try again','Reintentar')}</button>}
  </div>
}
