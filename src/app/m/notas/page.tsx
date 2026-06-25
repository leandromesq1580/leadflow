'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n-client'
import { MIcon } from '@/components/mobile/icons'

interface Item { id: string; label: string; done: boolean }
interface Block { id: string; title: string; notes: string; items: Item[] }

function uid() { return 'x' + Math.random().toString(36).slice(2, 10) }

export default function MobileNotas() {
  const t = useT()
  const loc = t._locale
  const L = (pt: string, en: string, es: string) => (loc === 'en' ? en : loc === 'es' ? es : pt)
  const router = useRouter()

  const [blocks, setBlocks] = useState<Block[] | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const skipSave = useRef(true)

  useEffect(() => {
    fetch('/api/notes', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { setBlocks(d?.blocks || []) }).catch(() => setBlocks([]))
  }, [])

  useEffect(() => {
    if (blocks === null) return
    if (skipSave.current) { skipSave.current = false; return }
    setStatus('saving')
    const tm = setTimeout(() => {
      fetch('/api/notes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blocks }) })
        .then(r => setStatus(r.ok ? 'saved' : 'error')).catch(() => setStatus('error'))
    }, 700)
    return () => clearTimeout(tm)
  }, [blocks])

  const upd = (fn: (b: Block[]) => Block[]) => setBlocks(prev => fn(prev || []))
  const setBlock = (id: string, patch: Partial<Block>) => upd(bs => bs.map(b => b.id === id ? { ...b, ...patch } : b))
  const setItem = (bid: string, iid: string, patch: Partial<Item>) => upd(bs => bs.map(b => b.id === bid ? { ...b, items: b.items.map(it => it.id === iid ? { ...it, ...patch } : it) } : b))

  return (
    <div>
      <div className="m-pad" style={{ paddingTop: 6, display: 'flex', alignItems: 'center', gap: 12, height: 44 }}>
        <button onClick={() => router.push('/m/mais')} className="m-tap" style={{ background: 'none', border: 'none', color: 'var(--m-text)', display: 'flex', cursor: 'pointer', padding: 0 }}><MIcon name="arrowLeft" size={24} /></button>
        <p style={{ margin: 0, flex: 1, fontSize: 20, fontWeight: 800 }}>{L('Notas', 'Notes', 'Notas')}</p>
        <span className="m-faint" style={{ fontSize: 12 }}>{status === 'saving' ? L('salvando…', 'saving…', 'guardando…') : status === 'saved' ? L('✓ salvo', '✓ saved', '✓ guardado') : status === 'error' ? '⚠' : ''}</span>
      </div>

      {!blocks && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><div className="m-spin" /></div>}

      {blocks && (
        <div className="m-pad" style={{ paddingTop: 6 }}>
          <button onClick={() => upd(bs => [...bs, { id: uid(), title: L('Nova pessoa', 'New person', 'Nueva persona'), notes: '', items: [] }])} className="m-tap" style={{ width: '100%', marginBottom: 14, background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.18)', color: '#a5b4fc', borderRadius: 13, height: 46, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <MIcon name="plus" size={17} />{L('Novo bloco', 'New block', 'Nuevo bloque')}
          </button>

          {blocks.length === 0 && <p className="m-muted" style={{ textAlign: 'center', fontSize: 14, paddingTop: 20 }}>{L('Crie um bloco pra acompanhar alguém.', 'Create a block to track someone.', 'Crea un bloque.')}</p>}

          {blocks.map(b => {
            const done = b.items.filter(i => i.done).length
            const pct = b.items.length ? Math.round((done / b.items.length) * 100) : 0
            return (
              <div key={b.id} className="m-card" style={{ padding: 15, marginBottom: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <input className="m-input" value={b.title} onChange={e => setBlock(b.id, { title: e.target.value })} style={{ height: 42, fontWeight: 700 }} />
                  <button onClick={() => upd(bs => bs.filter(x => x.id !== b.id))} className="m-tap" style={{ background: 'none', border: 'none', color: 'var(--m-faint)', cursor: 'pointer', display: 'flex', padding: 6 }}><MIcon name="x" size={18} /></button>
                </div>

                {b.items.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
                    <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)' }}><div style={{ width: `${pct}%`, height: 6, borderRadius: 999, background: 'linear-gradient(90deg,#6366f1,#8b5cf6)' }} /></div>
                    <span className="m-faint" style={{ fontSize: 12, fontWeight: 600 }}>{done}/{b.items.length}</span>
                  </div>
                )}

                {b.items.map(it => (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div onClick={() => setItem(b.id, it.id, { done: !it.done })} className="m-tap" style={{ width: 22, height: 22, borderRadius: 7, border: it.done ? 'none' : '1.5px solid rgba(255,255,255,0.25)', background: it.done ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', color: '#fff' }}>{it.done && <MIcon name="check" size={14} />}</div>
                    <input value={it.label} onChange={e => setItem(b.id, it.id, { label: e.target.value })} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: it.done ? 'var(--m-faint)' : 'var(--m-text)', fontSize: 14, textDecoration: it.done ? 'line-through' : 'none' }} />
                    <button onClick={() => setBlock(b.id, { items: b.items.filter(x => x.id !== it.id) })} className="m-tap" style={{ background: 'none', border: 'none', color: 'var(--m-faint)', cursor: 'pointer', display: 'flex', padding: 4 }}><MIcon name="x" size={15} /></button>
                  </div>
                ))}

                <button onClick={() => setBlock(b.id, { items: [...b.items, { id: uid(), label: '', done: false }] })} className="m-tap" style={{ background: 'none', border: 'none', color: '#a5b4fc', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '6px 0', display: 'flex', alignItems: 'center', gap: 5 }}><MIcon name="plus" size={15} />{L('Adicionar item', 'Add item', 'Añadir')}</button>

                <textarea value={b.notes} onChange={e => setBlock(b.id, { notes: e.target.value })} placeholder={L('Anotações…', 'Notes…', 'Notas…')} rows={2} style={{ width: '100%', marginTop: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--m-text)', borderRadius: 12, padding: '10px 13px', fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'inherit' }} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
