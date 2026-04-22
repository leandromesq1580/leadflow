'use client'

import { useEffect, useState } from 'react'

interface QrState {
  status: 'not_configured' | 'starting' | 'pending_qr' | 'connected' | 'disconnected' | 'unreachable'
  ready: boolean
  number: string | null
  qr: string | null
}

export function WaConnectCard() {
  const [state, setState] = useState<QrState | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function poll() {
    try {
      const r = await fetch('/api/whatsapp/qr', { cache: 'no-store' })
      const d = await r.json()
      setState(d)
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    poll()
    const iv = setInterval(poll, 4000)
    return () => clearInterval(iv)
  }, [])

  async function connect() {
    setCreating(true)
    setErr(null)
    try {
      const r = await fetch('/api/whatsapp/connect', { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao conectar')
      // re-poll imediatamente
      poll()
    } catch (e: any) {
      setErr(e?.message || 'Falha')
    } finally {
      setCreating(false)
    }
  }

  async function disconnect() {
    if (!confirm('Desconectar WhatsApp? Você vai precisar escanear o QR de novo.')) return
    await fetch('/api/whatsapp/qr', { method: 'POST' })
    poll()
  }

  if (loading) {
    return (
      <div className="rounded-2xl p-6 mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <p className="text-[13px]" style={{ color: '#94a3b8' }}>Carregando status do WhatsApp...</p>
      </div>
    )
  }

  const status = state?.status || 'not_configured'

  return (
    <div className="rounded-2xl p-6 mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[18px]">💬</span>
        <h2 className="text-[15px] font-bold" style={{ color: '#1a1a2e' }}>Conectar WhatsApp</h2>
      </div>
      <p className="text-[12px] mb-4" style={{ color: '#64748b' }}>
        Quando você enviar mensagem pelos leads do seu pipeline, sai do <strong>seu número</strong> de WhatsApp (não mais do dono da agência).
      </p>

      {status === 'connected' && (
        <div className="rounded-xl p-4 flex items-center justify-between gap-4" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <div>
            <p className="text-[13px] font-bold flex items-center gap-2" style={{ color: '#15803d' }}>
              <span className="w-2 h-2 rounded-full" style={{ background: '#15803d' }} />
              Conectado
            </p>
            <p className="text-[12px] mt-0.5" style={{ color: '#166534' }}>
              Número: <strong>+{state?.number}</strong>
            </p>
          </div>
          <button onClick={disconnect}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold"
            style={{ background: '#fee2e2', color: '#dc2626' }}>
            Desconectar
          </button>
        </div>
      )}

      {status === 'pending_qr' && state?.qr && (
        <div className="rounded-xl p-4 flex flex-col items-center gap-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <p className="text-[12px] font-bold" style={{ color: '#1a1a2e' }}>
            Abra o WhatsApp → Aparelhos conectados → Escanear QR
          </p>
          <img src={state.qr} alt="QR Code" className="w-[240px] h-[240px] rounded-lg" style={{ imageRendering: 'pixelated' }} />
          <p className="text-[11px]" style={{ color: '#64748b' }}>Aguardando scan...</p>
        </div>
      )}

      {status === 'starting' && (
        <div className="rounded-xl p-4" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
          <p className="text-[13px] font-bold" style={{ color: '#1d4ed8' }}>Iniciando bridge...</p>
          <p className="text-[11px] mt-1" style={{ color: '#1e40af' }}>Aguarde alguns segundos. O QR vai aparecer logo.</p>
        </div>
      )}

      {(status === 'not_configured' || status === 'disconnected') && (
        <div>
          <p className="text-[12px] mb-3" style={{ color: '#64748b' }}>
            Você ainda não tem WhatsApp conectado. Clique pra gerar um QR e parear seu celular.
          </p>
          <button onClick={connect} disabled={creating}
            className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', boxShadow: '0 4px 14px rgba(22,163,74,0.3)' }}>
            {creating ? 'Criando bridge...' : '📱 Conectar meu WhatsApp'}
          </button>
          {err && <p className="text-[11px] mt-2 font-semibold" style={{ color: '#dc2626' }}>⚠️ {err}</p>}
        </div>
      )}

      {status === 'unreachable' && (
        <div className="rounded-xl p-4" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
          <p className="text-[13px] font-bold" style={{ color: '#dc2626' }}>Bridge inalcançável</p>
          <p className="text-[11px] mt-1" style={{ color: '#991b1b' }}>Servidor não está respondendo. Tenta desconectar e reconectar.</p>
          <button onClick={disconnect} className="mt-2 px-3 py-1.5 rounded-lg text-[11px] font-bold" style={{ background: '#fee2e2', color: '#dc2626' }}>
            Reset conexão
          </button>
        </div>
      )}
    </div>
  )
}
