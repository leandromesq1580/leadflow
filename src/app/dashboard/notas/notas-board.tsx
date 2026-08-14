'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useT } from '@/lib/i18n-client'

type Item = { id: string; label: string; done: boolean }
type Block = { id: string; title: string; items: Item[]; notes: string }

type Lfn = (pt: string, en: string, es: string) => string

const licenseItems = (L: Lfn) => [
  L('Reunião Academia da licença', 'License Academy meeting', 'Reunión Academia de la licencia'),
  L('Começou o Curso', 'Started the Course', 'Comenzó el Curso'),
  L('Simulado', 'Practice exam', 'Simulacro'),
  L('Marcou Prova', 'Scheduled the Exam', 'Agendó el Examen'),
  'Fingerprint',
  L('Passou Prova', 'Passed the Exam', 'Aprobó el Examen'),
  'E&O',
  'Appointment NLG',
]
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)

function newLicenseBlock(L: Lfn): Block {
  return { id: uid(), title: L('Nova pessoa', 'New person', 'Nueva persona'), notes: '', items: licenseItems(L).map(label => ({ id: uid(), label, done: false })) }
}

export function NotasBoard() {
  const t = useT()
  const L: Lfn = (pt, en, es) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [blocks, setBlocks] = useState<Block[] | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ready = useRef(false)

  useEffect(() => {
    fetch('/api/notes', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setBlocks(Array.isArray(d.blocks) ? d.blocks : []))
      .catch(() => setBlocks([]))
      .finally(() => { ready.current = true })
  }, [])

  // Autosave debounced sempre que blocks muda (após carregar).
  useEffect(() => {
    if (!ready.current || blocks === null) return
    setStatus('saving')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch('/api/notes', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blocks }),
        })
        if (!r.ok) throw new Error()
        setStatus('saved')
        setTimeout(() => setStatus(s => (s === 'saved' ? 'idle' : s)), 1500)
      } catch { setStatus('error') }
    }, 700)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [blocks])

  const mut = useCallback((fn: (b: Block[]) => Block[]) => setBlocks(prev => (prev ? fn(prev) : prev)), [])
  const patchBlock = (id: string, fn: (b: Block) => Block) => mut(bs => bs.map(b => (b.id === id ? fn(b) : b)))

  if (blocks === null) {
    return <div className="text-[13px] py-16 text-center" style={{ color: 'var(--fg-muted)' }}>{L('Carregando…', 'Loading…', 'Cargando…')}</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] font-medium" style={{ color: status === 'error' ? '#ef4444' : 'var(--fg-muted)' }}>
          {status === 'saving' ? L('salvando…', 'saving…', 'guardando…') : status === 'saved' ? L('✓ salvo', '✓ saved', '✓ guardado') : status === 'error' ? L('⚠ erro ao salvar', '⚠ error saving', '⚠ error al guardar') : ''}
        </span>
        <button onClick={() => mut(bs => [...bs, newLicenseBlock(L)])}
          className="px-3.5 py-2 rounded-xl text-[13px] font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg,var(--accent),#8b5cf6)', boxShadow: '0 4px 14px rgba(124,58,237,0.3)' }}>
          {L('+ Novo bloco', '+ New block', '+ Nuevo bloque')}
        </button>
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--bg-card)', border: '1px dashed #cbd5e1' }}>
          <p className="text-[14px] font-semibold" style={{ color: 'var(--fg-secondary)' }}>{L('Nenhum bloco ainda', 'No blocks yet', 'Ningún bloque todavía')}</p>
          <p className="text-[12px] mt-1" style={{ color: 'var(--fg-muted)' }}>{L('Clique em “+ Novo bloco” pra criar a checklist de licença de uma pessoa.', 'Click “+ New block” to create someone\'s license checklist.', 'Haz clic en “+ Nuevo bloque” para crear el checklist de licencia de una persona.')}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {blocks.map(block => (
            <BlockCard
              key={block.id}
              block={block}
              onTitle={(t) => patchBlock(block.id, b => ({ ...b, title: t }))}
              onNotes={(n) => patchBlock(block.id, b => ({ ...b, notes: n }))}
              onToggle={(itemId) => patchBlock(block.id, b => ({ ...b, items: b.items.map(it => (it.id === itemId ? { ...it, done: !it.done } : it)) }))}
              onItemLabel={(itemId, label) => patchBlock(block.id, b => ({ ...b, items: b.items.map(it => (it.id === itemId ? { ...it, label } : it)) }))}
              onRemoveItem={(itemId) => patchBlock(block.id, b => ({ ...b, items: b.items.filter(it => it.id !== itemId) }))}
              onAddItem={() => patchBlock(block.id, b => ({ ...b, items: [...b.items, { id: uid(), label: '', done: false }] }))}
              onRemoveBlock={() => mut(bs => bs.filter(b => b.id !== block.id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function BlockCard({ block, onTitle, onNotes, onToggle, onItemLabel, onRemoveItem, onAddItem, onRemoveBlock }: {
  block: Block
  onTitle: (t: string) => void
  onNotes: (n: string) => void
  onToggle: (itemId: string) => void
  onItemLabel: (itemId: string, label: string) => void
  onRemoveItem: (itemId: string) => void
  onAddItem: () => void
  onRemoveBlock: () => void
}) {
  const t = useT()
  const L: Lfn = (pt, en, es) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const total = block.items.length
  const done = block.items.filter(i => i.done).length
  const pct = total ? Math.round((done / total) * 100) : 0

  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
      <div className="flex items-start gap-3">
        <input value={block.title} onChange={e => onTitle(e.target.value)} placeholder={L('Nome da pessoa', 'Person\'s name', 'Nombre de la persona')}
          className="flex-1 text-[16px] font-extrabold bg-transparent outline-none" style={{ color: 'var(--fg)' }} />
        <button onClick={onRemoveBlock} title={L('Excluir bloco', 'Delete block', 'Eliminar bloque')}
          className="text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors hover:bg-red-50 hover:text-red-500" style={{ color: '#cbd5e1' }}>
          {L('Excluir', 'Delete', 'Eliminar')}
        </button>
      </div>

      <div className="flex items-center gap-2.5 mt-3 mb-3">
        <span className="text-[11px] font-bold tabular-nums" style={{ color: pct === 100 ? '#10b981' : 'var(--fg-secondary)', minWidth: 32 }}>{pct}%</span>
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? '#10b981' : 'linear-gradient(90deg,var(--accent),#8b5cf6)' }} />
        </div>
      </div>

      <div className="space-y-0.5">
        {block.items.map(it => (
          <div key={it.id} className="group flex items-center gap-2.5 py-1.5 px-1 rounded-lg hover:bg-slate-50">
            <button onClick={() => onToggle(it.id)} aria-label={it.done ? L('desmarcar', 'uncheck', 'desmarcar') : L('marcar', 'check', 'marcar')}
              className="shrink-0 w-[18px] h-[18px] rounded-[5px] flex items-center justify-center transition-all"
              style={{ background: it.done ? 'var(--accent)' : 'var(--bg-card)', border: `1.5px solid ${it.done ? 'var(--accent)' : '#cbd5e1'}` }}>
              {it.done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 6" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </button>
            <input value={it.label} onChange={e => onItemLabel(it.id, e.target.value)} placeholder={L('Descreva a etapa…', 'Describe the step…', 'Describe la etapa…')}
              className="flex-1 text-[13.5px] bg-transparent outline-none"
              style={{ color: it.done ? 'var(--fg-muted)' : '#334155', textDecoration: it.done ? 'line-through' : 'none' }} />
            <button onClick={() => onRemoveItem(it.id)} aria-label={L('remover item', 'remove item', 'eliminar ítem')}
              className="shrink-0 opacity-0 group-hover:opacity-100 text-[16px] leading-none px-1 transition-opacity hover:text-red-400" style={{ color: '#cbd5e1' }}>×</button>
          </div>
        ))}
      </div>

      <button onClick={onAddItem} className="mt-1.5 text-[12.5px] font-semibold px-1 py-1 rounded-lg transition-colors hover:bg-indigo-50" style={{ color: 'var(--accent)' }}>
        {L('+ Adicionar item', '+ Add item', '+ Agregar ítem')}
      </button>

      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--bg-soft)' }}>
        <textarea value={block.notes} onChange={e => onNotes(e.target.value)} rows={2} placeholder={L('Anotações…', 'Notes…', 'Notas…')}
          className="w-full text-[13px] resize-y rounded-xl px-3 py-2 outline-none"
          style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', color: '#334155', minHeight: 48 }} />
      </div>
    </div>
  )
}
