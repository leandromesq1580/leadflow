'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n-client'

const STORAGE_KEY = 'lead_coupon'

interface CouponInfo {
  code: string
  label: string
  unitPrice: number
  packages: { id: string; quantity: number; total: number }[]
}

// Caixa "Tem um cupom?" da tela de créditos. Valida no servidor e guarda o código em
// sessionStorage — o BuyButton lê de lá na hora da compra. A validação de verdade
// acontece de novo no /api/checkout (aqui é só pré-visualização do preço).
export function CouponBox() {
  const [input, setInput] = useState('')
  const [applied, setApplied] = useState<CouponInfo | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt

  async function validate(code: string, silent = false) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/coupon/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (data.valid) {
        setApplied(data)
        sessionStorage.setItem(STORAGE_KEY, data.code)
      } else {
        sessionStorage.removeItem(STORAGE_KEY)
        if (!silent) setError(data.error || L('Cupom inválido.', 'Invalid coupon.', 'Cupón inválido.'))
      }
    } catch {
      if (!silent) setError(L('Erro ao validar. Tenta de novo.', 'Validation failed. Try again.', 'Error al validar. Inténtalo de nuevo.'))
    }
    setBusy(false)
  }

  // Reaplica cupom já usado nesta sessão (ex.: voltou do checkout cancelado)
  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (saved) validate(saved, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function remove() {
    sessionStorage.removeItem(STORAGE_KEY)
    setApplied(null)
    setInput('')
  }

  if (applied) {
    return (
      <div className="rounded-xl p-4 mb-4" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-bold" style={{ color: '#047857' }}>
            {L(`✅ Cupom ${applied.code} aplicado — $${applied.unitPrice}/lead`, `✅ Coupon ${applied.code} applied — $${applied.unitPrice}/lead`, `✅ Cupón ${applied.code} aplicado — $${applied.unitPrice}/lead`)}
          </p>
          <button onClick={remove} className="text-[12px] font-semibold underline" style={{ color: '#047857' }}>
            {L('Remover', 'Remove', 'Quitar')}
          </button>
        </div>
        <p className="text-[12px] mt-1" style={{ color: '#065f46' }}>
          {applied.packages.map((p) => `${p.quantity} leads = $${p.total.toLocaleString('en-US')}`).join(' · ')}
        </p>
        <p className="text-[11px] mt-1" style={{ color: '#059669' }}>
          {L('O desconto é aplicado automaticamente ao clicar em Comprar.', 'The discount is applied automatically when you click Buy.', 'El descuento se aplica automáticamente al hacer clic en Comprar.')}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
      <p className="text-[12px] font-semibold mb-2" style={{ color: '#64748b' }}>{L('Tem um cupom?', 'Have a coupon?', '¿Tienes un cupón?')}</p>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          placeholder={L('CÓDIGO', 'CODE', 'CÓDIGO')}
          className="flex-1 px-3 py-2 rounded-lg text-[13px] font-semibold tracking-wide"
          style={{ border: '1px solid #e2e8f0', color: '#1a1a2e' }}
        />
        <button
          onClick={() => validate(input)}
          disabled={busy || !input.trim()}
          className="px-4 py-2 rounded-lg text-[13px] font-bold text-white disabled:opacity-50"
          style={{ background: '#6366f1' }}
        >
          {busy ? '...' : L('Aplicar', 'Apply', 'Aplicar')}
        </button>
      </div>
      {error && <p className="text-[12px] mt-2" style={{ color: '#dc2626' }}>{error}</p>}
    </div>
  )
}
