import { NextResponse } from 'next/server'

/**
 * ⛔ DESATIVADO — este endpoint trocava o plano por PRORAÇÃO silenciosa (cobrava centavos e
 * deixava o cliente no plano novo sem pagar a diferença). As trocas agora passam por
 * /api/subscription/upgrade-checkout (upgrade abre checkout pra pagar a diferença; downgrade
 * aplica direto). Mantido só pra devolver erro claro a clientes com JS antigo em cache.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Atualize a página (Ctrl/Cmd + Shift + R) e clique em trocar de novo — o novo fluxo abre um checkout pra pagar a diferença.' },
    { status: 410 },
  )
}
