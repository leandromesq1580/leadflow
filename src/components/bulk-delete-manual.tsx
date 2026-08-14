'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n-client'

/**
 * "Excluir meus leads manuais" (pedido dos clientes, 2026-07-31).
 * Fluxo em 2 passos: prévia com os números reais → confirmação digitada ("EXCLUIR").
 * O servidor só apaga leads MANUAIS do próprio comprador e preserva os com contrato
 * fechado — o botão nunca encosta em lead comprado/entregue pelo sistema.
 */
export function BulkDeleteManual() {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
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
      if (r.ok) { setPreview(d); setOpen(true) } else alert(d.error || L('Não consegui carregar.', 'Could not load.', 'No pude cargar.'))
    } catch { alert(L('Erro de conexão.', 'Connection error.', 'Error de conexión.')) }
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
      if (!r.ok) { alert(d.error || L('Falhou.', 'Failed.', 'Falló.')); setBusy(false); return }
      setFeito({ deleted: d.deleted, remaining: d.remaining })
      if (d.remaining === 0) setTimeout(() => window.location.reload(), 1200)
    } catch { alert(L('Erro de conexão.', 'Connection error.', 'Error de conexión.')) }
    setBusy(false)
  }

  return (
    <>
      <button onClick={abrir} disabled={busy}
        className="px-3 py-2 rounded-lg text-[12px] font-bold disabled:opacity-50"
        style={{ background: 'var(--bg-card)', color: '#b91c1c', border: '1px solid #fecaca' }}>
        🗑️ {L('Excluir meus leads manuais', 'Delete my manual leads', 'Eliminar mis leads manuales')}
      </button>

      {open && (
        <div onClick={() => !busy && setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-card)', borderRadius: 18, padding: 24, width: 460, maxWidth: '100%', boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>
            {feito ? (
              <>
                <p className="text-[16px] font-extrabold mb-2" style={{ color: '#059669' }}>✅ {feito.deleted} {L('lead(s) excluído(s)', 'lead(s) deleted', 'lead(s) eliminados')}</p>
                {feito.remaining > 0 ? (
                  <>
                    <p className="text-[13px] mb-4" style={{ color: 'var(--fg-secondary)' }}>
                      {L('Ainda restam', 'There are still', 'Aún quedan')} <b>{feito.remaining}</b> {L('(excluímos em lotes pra não travar). Clique de novo para continuar.', 'left (we delete in batches so nothing freezes). Click again to continue.', '(eliminamos por lotes para que no se trabe). Haz clic de nuevo para continuar.')}
                    </p>
                    <button onClick={excluir} disabled={busy} className="w-full py-2.5 rounded-xl text-[13px] font-bold text-white" style={{ background: '#dc2626' }}>
                      {busy ? L('Excluindo…', 'Deleting…', 'Eliminando…') : L(`Excluir os ${feito.remaining} restantes`, `Delete the ${feito.remaining} remaining`, `Eliminar los ${feito.remaining} restantes`)}
                    </button>
                  </>
                ) : (
                  <p className="text-[13px]" style={{ color: 'var(--fg-secondary)' }}>{L('Atualizando a lista…', 'Refreshing the list…', 'Actualizando la lista…')}</p>
                )}
              </>
            ) : (
              <>
                <p className="text-[17px] font-extrabold mb-1" style={{ color: 'var(--fg)' }}>{L('Excluir leads manuais', 'Delete manual leads', 'Eliminar leads manuales')}</p>
                <p className="text-[13px] mb-4" style={{ color: 'var(--fg-secondary)' }}>
                  {L('Apaga os leads que', 'Deletes the leads', 'Elimina los leads que')} <b>{L('você mesmo cadastrou', 'you added yourself', 'tú mismo registraste')}</b> {L('(manualmente ou por importação de planilha), com as conversas e follow-ups deles.', '(manually or via spreadsheet import), along with their conversations and follow-ups.', '(manualmente o por importación de planilla), con sus conversaciones y follow-ups.')}
                </p>

                <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--err-soft)', border: '1px solid #fecaca' }}>
                  <p className="text-[13px] font-bold" style={{ color: '#b91c1c' }}>
                    {preview?.toDelete ?? 0} {L('lead(s) serão excluídos — não dá para desfazer', "lead(s) will be deleted — this can't be undone", 'lead(s) serán eliminados — no se puede deshacer')}
                  </p>
                </div>

                <div className="rounded-xl p-3 mb-4" style={{ background: 'var(--ok-soft)', border: '1px solid #bbf7d0' }}>
                  <p className="text-[12.5px] font-bold mb-1" style={{ color: '#166534' }}>{L('Ficam protegidos:', 'These stay protected:', 'Quedan protegidos:')}</p>
                  <ul className="text-[12px] space-y-0.5" style={{ color: '#15803d' }}>
                    <li>• {L('Todos os leads que você', 'All the leads you', 'Todos los leads que')} <b>{L('comprou', 'bought', 'compraste')}</b> {L('(entregues pela plataforma)', '(delivered by the platform)', '(entregados por la plataforma)')}</li>
                    <li>• {preview?.preserved ?? 0} {L('lead(s) manuais com', 'manual lead(s) with a', 'lead(s) manuales con')} <b>{L('contrato fechado', 'closed contract', 'contrato cerrado')}</b></li>
                  </ul>
                </div>

                {(preview?.toDelete ?? 0) > 0 ? (
                  <>
                    <label className="block text-[12px] font-semibold mb-1.5" style={{ color: 'var(--fg-secondary)' }}>
                      {L('Digite', 'Type', 'Escribe')} <b style={{ color: '#b91c1c' }}>EXCLUIR</b> {L('para confirmar:', 'to confirm:', 'para confirmar:')}
                    </label>
                    <input value={texto} onChange={e => setTexto(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 rounded-lg text-[13px] font-bold mb-4"
                      style={{ border: '1px solid #e2e8f0', letterSpacing: 1 }} placeholder="EXCLUIR" />
                    <div className="flex gap-2">
                      <button onClick={() => setOpen(false)} disabled={busy}
                        className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold" style={{ background: 'var(--bg-soft)', color: 'var(--fg-secondary)' }}>
                        {L('Cancelar', 'Cancel', 'Cancelar')}
                      </button>
                      <button onClick={excluir} disabled={busy || texto !== 'EXCLUIR'}
                        className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-40"
                        style={{ background: '#dc2626' }}>
                        {busy ? L('Excluindo…', 'Deleting…', 'Eliminando…') : L('Excluir definitivamente', 'Delete permanently', 'Eliminar definitivamente')}
                      </button>
                    </div>
                  </>
                ) : (
                  <button onClick={() => setOpen(false)} className="w-full py-2.5 rounded-xl text-[13px] font-bold" style={{ background: 'var(--bg-soft)', color: 'var(--fg-secondary)' }}>
                    {L('Você não tem leads manuais para excluir — fechar', 'You have no manual leads to delete — close', 'No tienes leads manuales para eliminar — cerrar')}
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
