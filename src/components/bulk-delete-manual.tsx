'use client'

import { useState } from 'react'

/**
 * "Excluir meus leads manuais" (pedido dos clientes, 2026-07-31).
 * Fluxo em 2 passos: prévia com os números reais → confirmação digitada ("EXCLUIR").
 * O servidor só apaga leads MANUAIS do próprio comprador e preserva os com contrato
 * fechado — o botão nunca encosta em lead comprado/entregue pelo sistema.
 */
export function BulkDeleteManual() {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<{ toDelete: number; preserved: number } | null>(null)
  const [texto, setTexto] = useState('')
  const [busy, setBusy] = useState(false)
  const [feito, setFeito] = useState<{ deleted: number; remaining: number } | null>(null)

  async function abrir() {
    setBusy(true); setFeito(null); setTexto('')
    try {
      const r = await fetch('/api/leads/bulk-delete-manual', { cache: 'no-store' })
      const d = await r.json()
      if (r.ok) { setPreview(d); setOpen(true) } else alert(d.error || 'Não consegui carregar.')
    } catch { alert('Erro de conexão.') }
    setBusy(false)
  }

  async function excluir() {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch('/api/leads/bulk-delete-manual', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: texto }),
      })
      const d = await r.json()
      if (!r.ok) { alert(d.error || 'Falhou.'); setBusy(false); return }
      setFeito({ deleted: d.deleted, remaining: d.remaining })
      if (d.remaining === 0) setTimeout(() => window.location.reload(), 1200)
    } catch { alert('Erro de conexão.') }
    setBusy(false)
  }

  return (
    <>
      <button onClick={abrir} disabled={busy}
        className="px-3 py-2 rounded-lg text-[12px] font-bold disabled:opacity-50"
        style={{ background: '#fff', color: '#b91c1c', border: '1px solid #fecaca' }}>
        🗑️ Excluir meus leads manuais
      </button>

      {open && (
        <div onClick={() => !busy && setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 18, padding: 24, width: 460, maxWidth: '100%', boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>
            {feito ? (
              <>
                <p className="text-[16px] font-extrabold mb-2" style={{ color: '#059669' }}>✅ {feito.deleted} lead(s) excluído(s)</p>
                {feito.remaining > 0 ? (
                  <>
                    <p className="text-[13px] mb-4" style={{ color: '#64748b' }}>
                      Ainda restam <b>{feito.remaining}</b> (excluímos em lotes pra não travar). Clique de novo para continuar.
                    </p>
                    <button onClick={excluir} disabled={busy} className="w-full py-2.5 rounded-xl text-[13px] font-bold text-white" style={{ background: '#dc2626' }}>
                      {busy ? 'Excluindo…' : `Excluir os ${feito.remaining} restantes`}
                    </button>
                  </>
                ) : (
                  <p className="text-[13px]" style={{ color: '#64748b' }}>Atualizando a lista…</p>
                )}
              </>
            ) : (
              <>
                <p className="text-[17px] font-extrabold mb-1" style={{ color: '#1a1a2e' }}>Excluir leads manuais</p>
                <p className="text-[13px] mb-4" style={{ color: '#64748b' }}>
                  Apaga os leads que <b>você mesmo cadastrou</b> (manualmente ou por importação de planilha), com as conversas e follow-ups deles.
                </p>

                <div className="rounded-xl p-3 mb-3" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                  <p className="text-[13px] font-bold" style={{ color: '#b91c1c' }}>
                    {preview?.toDelete ?? 0} lead(s) serão excluídos — não dá para desfazer
                  </p>
                </div>

                <div className="rounded-xl p-3 mb-4" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <p className="text-[12.5px] font-bold mb-1" style={{ color: '#166534' }}>Ficam protegidos:</p>
                  <ul className="text-[12px] space-y-0.5" style={{ color: '#15803d' }}>
                    <li>• Todos os leads que você <b>comprou</b> (entregues pela plataforma)</li>
                    <li>• {preview?.preserved ?? 0} lead(s) manuais com <b>contrato fechado</b></li>
                  </ul>
                </div>

                {(preview?.toDelete ?? 0) > 0 ? (
                  <>
                    <label className="block text-[12px] font-semibold mb-1.5" style={{ color: '#64748b' }}>
                      Digite <b style={{ color: '#b91c1c' }}>EXCLUIR</b> para confirmar:
                    </label>
                    <input value={texto} onChange={e => setTexto(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 rounded-lg text-[13px] font-bold mb-4"
                      style={{ border: '1px solid #e2e8f0', letterSpacing: 1 }} placeholder="EXCLUIR" />
                    <div className="flex gap-2">
                      <button onClick={() => setOpen(false)} disabled={busy}
                        className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold" style={{ background: '#f1f5f9', color: '#475569' }}>
                        Cancelar
                      </button>
                      <button onClick={excluir} disabled={busy || texto !== 'EXCLUIR'}
                        className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-40"
                        style={{ background: '#dc2626' }}>
                        {busy ? 'Excluindo…' : 'Excluir definitivamente'}
                      </button>
                    </div>
                  </>
                ) : (
                  <button onClick={() => setOpen(false)} className="w-full py-2.5 rounded-xl text-[13px] font-bold" style={{ background: '#f1f5f9', color: '#475569' }}>
                    Você não tem leads manuais para excluir — fechar
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
