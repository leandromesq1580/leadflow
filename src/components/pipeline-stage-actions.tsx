'use client'

import { actionEditHref } from '@/lib/pipeline-action-links'
import type { StageActionsState } from '@/lib/use-stage-actions'

type Props = { stageId: string; stageName: string; locale: string; state: StageActionsState; returnTo?: string; onRetry?: () => void }
export function StageActionsStrip({stageId,stageName,locale,state,returnTo='/dashboard/pipeline',onRetry}: Props) {
  const L = (pt: string,en: string,es: string) => locale==='en'?en:locale==='es'?es:pt
  const stage = state.status==='ready' ? state.stages.find(s=>s.id===stageId) : undefined
  const unavailable = state.status==='loading' ? L('Carregando…','Loading…','Cargando…') : state.status==='not-applicable' ? L('Não se aplica','Not applicable','No aplica') : state.status==='restricted' ? L('Restrito','Restricted','Restringido') : L('Indisponível','Unavailable','No disponible')
  if (!stage) {
    const explanation = state.status==='not-applicable'
      ? L('Este membro ainda não possui um pipeline próprio. Ações por etapa não se aplicam a este quadro de leads atribuídos.','This member does not yet have their own pipeline. Stage actions do not apply to this assigned-leads board.','Este miembro aún no tiene un pipeline propio. Las acciones por etapa no se aplican a este tablero de prospectos asignados.')
      : state.status==='restricted' ? L('Somente o dono da conta pode consultar e editar estas ações.','Only the account owner can view and edit these actions.','Solo el titular de la cuenta puede consultar y editar estas acciones.') : undefined
    return <p className="mb-2 flex flex-wrap items-center gap-x-2 text-[11px]" style={{color:'var(--m-muted, var(--fg-muted))'}} role="status" title={explanation}>
      <span>{L('Ações','Actions','Acciones')} · {unavailable}</span>
      {explanation && <span className="sr-only">{explanation}</span>}
      {(state.status==='error' || state.status==='ready') && onRetry && <button type="button" className="py-1 underline" onClick={onRetry}>{L('Tentar novamente','Try again','Reintentar')}</button>}
    </p>
  }
  const active = L('Ativa','Active','Activa')
  if (![...stage.sequences,...stage.automations].some(item=>item.enabled===true)) return null
  const groups = [['sequences',L('Sequência','Sequence','Secuencia')],['automations',L('Automação','Automation','Automatización')]] as const
  return <div className="mb-2 flex flex-wrap items-start gap-1 text-[11px]" style={{color:'var(--m-text, var(--fg))'}} aria-label={L(`Ações de ${stageName}`,`Actions for ${stageName}`,`Acciones de ${stageName}`)}>
    {groups.map(([kind,label])=>{
      const items = stage[kind].filter(item=>item.enabled===true)
      if (items.length===0) return null
      const summary = items.length===1 ? active : L(`${items.length} ativas`,`${items.length} active`,`${items.length} activas`)
      return <details key={kind} className="group min-w-0 max-w-full rounded-lg px-2 open:w-full" style={{background:'var(--m-surface, var(--bg-card))',border:'1px solid var(--m-border, var(--border))'}} onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus()}}}>
        <summary className="cursor-pointer rounded py-1 leading-4 focus-visible:outline-2 focus-visible:outline-offset-2" style={{outlineColor:'var(--accent)'}}>{label} · <span className="font-medium">{summary}</span></summary>
        <div className="pb-2 pt-1">
          <ul className="max-h-[min(16rem,40dvh)] space-y-2 overflow-y-auto overscroll-contain">
            {items.map(item=><li key={item.id} className="rounded-md p-2" style={{background:'var(--m-bg, var(--bg))'}}>
              <p className="break-words font-semibold" style={{color:'var(--m-text, var(--fg))'}}>{item.name}</p>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2"><span>{active}</span><a className="rounded px-2 py-1 font-semibold underline underline-offset-2 focus-visible:outline-2" style={{color:'var(--m-text, var(--accent))'}} href={actionEditHref(kind,item.id,returnTo)} aria-label={`${L('Editar','Edit','Editar')} ${item.name}`}>{L('Editar','Edit','Editar')}</a></div>
            </li>)}
          </ul>
          <p className="mt-2 leading-relaxed">{L('Estado da configuração; não indica saúde dos envios.','Configuration status; not delivery health.','Estado de configuración; no indica la salud de los envíos.')}</p>
        </div>
      </details>
    })}
  </div>
}
