'use client'

import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { actionEditHref } from '@/lib/pipeline-action-links'
import type { StageActionsState } from '@/lib/use-stage-actions'

type Props = { stageId: string; stageName: string; locale: string; state: StageActionsState; returnTo?: string; onRetry?: () => void }

// Loading/empty unmount the interactive child: a focus refresh must not retain
// open state for a panel that no longer exists. Identity/status changes reset it too.
export function StageActionsStrip(props: Props) {
  const { state, stageId, locale } = props
  if (state.status === 'loading') return <span className="sr-only" role="status" aria-busy="true">{locale === 'en' ? 'Loading actions…' : locale === 'es' ? 'Cargando acciones…' : 'Carregando ações…'}</span>
  const stage = state.status === 'ready' ? state.stages.find(s => s.id === stageId) : undefined
  if (stage && ![...stage.sequences, ...stage.automations].some(item => item.enabled === true)) return null
  return <StageActionsPopover key={`${state.pipelineId}:${stageId}:${state.status}`} {...props} />
}

// One portal path also works in WebViews without the native Popover API.
function StageActionsPopover({ stageId, stageName, locale, state, returnTo = '/dashboard/pipeline', onRetry }: Props) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const L = (pt: string, en: string, es: string) => locale === 'en' ? en : locale === 'es' ? es : pt
  const stage = state.status === 'ready' ? state.stages.find(s => s.id === stageId) : undefined
  const active = !!stage && [...stage.sequences, ...stage.automations].some(item => item.enabled === true)
  const label = active
    ? L(`Ações ativas de ${stageName}`, `Active actions for ${stageName}`, `Acciones activas de ${stageName}`)
    : L(`Informações sobre ações de ${stageName}`, `Action information for ${stageName}`, `Información de acciones de ${stageName}`)
  const unavailable = state.status === 'not-applicable' ? L('Não se aplica', 'Not applicable', 'No aplica')
    : state.status === 'restricted' ? L('Restrito', 'Restricted', 'Restringido') : L('Indisponível', 'Unavailable', 'No disponible')
  const explanation = state.status === 'not-applicable'
    ? L('Este membro ainda não possui um pipeline próprio. Ações por etapa não se aplicam a este quadro de leads atribuídos.', 'This member does not yet have their own pipeline. Stage actions do not apply to this assigned-leads board.', 'Este miembro aún no tiene un pipeline propio. Las acciones por etapa no se aplican a este tablero de prospectos asignados.')
    : state.status === 'restricted'
      ? L('Somente o dono da conta pode consultar e editar estas ações.', 'Only the account owner can view and edit these actions.', 'Solo el titular de la cuenta puede consultar y editar estas acciones.')
      : L('Não foi possível consultar as ações desta etapa.', 'Actions for this stage could not be loaded.', 'No se pudieron consultar las acciones de esta etapa.')

  useLayoutEffect(() => {
    if (!open) return
    const button = trigger.current, popup = panel.current
    if (!button || !popup) return
    // Portals escape overflow but not by inheritance: carry the scoped mobile
    // and desktop tokens/font from the trigger, never a hardcoded light theme.
    const theme = getComputedStyle(button)
    for (const token of ['--m-bg', '--m-text', '--m-border', '--m-muted', '--bg-card', '--fg', '--border', '--fg-muted', '--accent']) {
      const value = theme.getPropertyValue(token)
      if (value) popup.style.setProperty(token, value)
    }
    popup.style.fontFamily = theme.fontFamily
    function position() {
      const button = trigger.current, popup = panel.current
      if (!button || !popup) return
      const rect = button.getBoundingClientRect()
      const viewport = window.visualViewport
      const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0
      const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight
      popup.style.width = `${Math.min(320, width - 16)}px`
      popup.style.maxHeight = `${Math.max(0, height - 16)}px`
      popup.style.left = `${Math.max(left + 8, Math.min(rect.left, left + width - popup.offsetWidth - 8))}px`
      popup.style.top = `${Math.max(top + 8, Math.min(rect.bottom + 6, top + height - popup.offsetHeight - 8))}px`
    }
    position()
    popup.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    const dismiss = () => setOpen(false)
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !popup.contains(event.target) && !button.contains(event.target)) dismiss()
    }
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        dismiss()
        button.focus({ preventScroll: true })
      }
    }
    // Non-modal: Tab may leave, and outside pointer/touch must keep its target focus.
    const focusOutside = (event: FocusEvent) => {
      if (event.target instanceof Node && !popup.contains(event.target) && !button.contains(event.target)) dismiss()
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', keyboard)
    document.addEventListener('focusin', focusOutside)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    window.visualViewport?.addEventListener('resize', position)
    window.visualViewport?.addEventListener('scroll', position)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', keyboard)
      document.removeEventListener('focusin', focusOutside)
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      window.visualViewport?.removeEventListener('resize', position)
      window.visualViewport?.removeEventListener('scroll', position)
    }
  }, [open])

  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }) }
  const groups = [['sequences', L('Sequência', 'Sequence', 'Secuencia')], ['automations', L('Automação', 'Automation', 'Automatización')]] as const
  const content = <div ref={panel} id={id} role="dialog" aria-label={label} hidden={!open}
      className="fixed m-0 overflow-y-auto overscroll-contain rounded-xl border p-3 text-xs shadow-xl"
      style={{ display: open ? undefined : 'none', zIndex: 1000, inset: 'auto', width: 'min(320px, calc(100vw - 16px))', maxHeight: 'calc(100vh - 16px)', background: 'var(--m-bg, var(--bg-card))', color: 'var(--m-text, var(--fg))', borderColor: 'var(--m-border, var(--border))', whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="min-w-0 font-semibold">{stageName}</p>
        <button type="button" onClick={close} aria-label={L('Fechar ações', 'Close actions', 'Cerrar acciones')} className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded focus-visible:outline-2">×</button>
      </div>
      {active && stage ? <>
        {groups.map(([kind, groupLabel]) => {
          const items = stage[kind].filter(item => item.enabled === true)
          if (!items.length) return null
          return <section key={kind} aria-label={groupLabel} className="mb-3">
            <h4 className="mb-1 font-semibold">{groupLabel} · {items.length === 1 ? L('1 ativa', '1 active', '1 activa') : L(`${items.length} ativas`, `${items.length} active`, `${items.length} activas`)}</h4>
            <ul className="space-y-1">
              {items.map(item => <li key={item.id} className="flex items-start justify-between gap-3 rounded py-1">
                <span className="min-w-0 pt-1">{item.name}</span>
                <a className="shrink-0 rounded px-2 py-1 font-semibold underline underline-offset-2 focus-visible:outline-2" href={actionEditHref(kind, item.id, returnTo)} aria-label={`${L('Editar', 'Edit', 'Editar')} ${item.name}`}>{L('Editar', 'Edit', 'Editar')}</a>
              </li>)}
            </ul>
          </section>
        })}
        <p style={{ color: 'var(--m-muted, var(--fg-muted))' }}>{L('Estado da configuração; não indica saúde dos envios.', 'Configuration status; not delivery health.', 'Estado de configuración; no indica la salud de los envíos.')}</p>
      </> : <div role="status">
        <p className="font-semibold">{unavailable}</p><p className="mt-1">{explanation}</p>
        {(state.status === 'error' || state.status === 'ready') && onRetry && <button type="button" className="mt-2 py-1 underline" onClick={() => { close(); onRetry() }}>{L('Tentar novamente', 'Try again', 'Reintentar')}</button>}
      </div>}
    </div>
  return <>
    <button ref={trigger} type="button" onClick={() => setOpen(value => !value)} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} aria-label={label}
      title={active ? L('Ver sequências e automações ativas; editar configurações', 'View active sequences and automations; edit settings', 'Ver secuencias y automatizaciones activas; editar configuración') : `${unavailable}: ${explanation}`}
      className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-[14px] focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ color: 'inherit', outlineColor: 'var(--accent)' }}>
      <span aria-hidden="true">{active ? '⚡' : 'ⓘ'}</span>
    </button>
    {open ? createPortal(content, document.body) : content}
  </>
}
