'use client'

import { useState, useEffect } from 'react'
import { useT } from '@/lib/i18n-client'

interface ReferralData {
  code: string
  credit_cents: number
  pending_cents?: number
  total_referrals: number
  rewards: Array<{ trigger: string; cents: number; granted_at: string; name: string; email: string }>
}

const triggerLabels = (L: (pt: string, en: string, es: string) => string): Record<string, string> => ({
  signup: L('Se cadastrou', 'Signed up', 'Se registró'),
  first_purchase: L('1ª compra', '1st purchase', '1ª compra'),
  crm_subscription: L('Assinou CRM Pro', 'Subscribed to CRM Pro', 'Se suscribió a CRM Pro'),
})

export default function ReferralPage() {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [data, setData] = useState<ReferralData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const ref = supabaseUrl.replace('https://', '').split('.')[0]
    const cookie = document.cookie.split('; ').find(c => c.startsWith(`sb-${ref}-auth-token=`))
    if (cookie) {
      try {
        const token = JSON.parse(atob(decodeURIComponent(cookie.substring(cookie.indexOf('=') + 1))))
        const payload = JSON.parse(atob(token.access_token.split('.')[1]))
        fetchData(payload.sub)
      } catch {}
    }
  }, [])

  async function fetchData(authId: string) {
    const b = await fetch(`/api/settings?auth_user_id=${authId}`).then(r => r.json())
    if (!b?.id) { setLoading(false); return }
    const r = await fetch(`/api/referral?buyer_id=${b.id}`)
    if (r.ok) setData(await r.json())
    setLoading(false)
  }

  const link = data ? `https://lead4producers.com/register?ref=${data.code}` : ''

  async function copy() {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function share() {
    const msg = L(
      `Oi! Conheço uma plataforma de leads de seguro de vida pra corretor BR nos EUA. Se cadastrar pelo meu link, nós dois ganhamos crédito: ${link}`,
      `Hey! I know a life insurance lead platform for agents in the US. If you sign up with my link, we both earn credit: ${link}`,
      `¡Hola! Conozco una plataforma de leads de seguro de vida para agentes en EE.UU. Si te registras con mi enlace, los dos ganamos crédito: ${link}`,
    )
    if (navigator.share) navigator.share({ text: msg, url: link })
    else window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  if (loading) return <div className="p-8 text-[13px]" style={{ color: '#64748b' }}>{L('Carregando...', 'Loading...', 'Cargando...')}</div>
  if (!data) return <div className="p-8 text-[13px]" style={{ color: '#64748b' }}>{L('Sem dados', 'No data', 'Sin datos')}</div>

  return (
    <div className="max-w-[720px]">
      <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>{L('Programa de Indicação', 'Referral Program', 'Programa de Referidos')}</h1>
      <p className="text-[14px] mb-6" style={{ color: '#64748b' }}>{L('Indique corretores e ganhe crédito em dólar', 'Refer agents and earn credit in dollars', 'Recomienda agentes y gana crédito en dólares')}</p>

      {/* Credit card */}
      <div className="rounded-2xl p-6 mb-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)' }}>
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.5)' }}>{L('Seu crédito', 'Your credit', 'Tu crédito')}</p>
            <p className="text-[42px] font-extrabold text-white mt-1">${(data.credit_cents / 100).toFixed(2)}</p>
            <p className="text-[12px] mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {L('disponível para usar', 'available to use', 'disponible para usar')} · {data.total_referrals} {data.total_referrals === 1 ? L('indicação', 'referral', 'referido') : L('indicações', 'referrals', 'referidos')}
            </p>
            {!!data.pending_cents && data.pending_cents > 0 && (
              <p className="text-[12px] mt-1.5 font-bold" style={{ color: '#fbbf24' }}>
                + ${(data.pending_cents / 100).toFixed(2)} {L('aguardando liberação (14 dias)', 'awaiting release (14 days)', 'esperando liberación (14 días)')}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>{L('Você ganha', 'You earn', 'Tú ganas')}</p>
            <p className="text-[13px] text-white mt-1"><b>10%</b> {L('do 1º pagamento do CRM', 'of their 1st CRM payment', 'del 1er pago del CRM')}</p>
            <p className="text-[13px] text-white"><b>5%</b> {L('do pacote de leads dele', 'of their lead package', 'de su paquete de leads')}</p>
            <p className="text-[11px] mt-1.5" style={{ color: 'rgba(255,255,255,0.55)' }}>{L('Mensal $10 · Trimestral $25 · Semestral $40 · Anual $70', 'Monthly $10 · Quarterly $25 · Semiannual $40 · Annual $70', 'Mensual $10 · Trimestral $25 · Semestral $40 · Anual $70')}</p>
          </div>
        </div>
      </div>

      {/* Regras — o cliente precisa entender antes de indicar (feedback 2026-07-30) */}
      <div className="rounded-2xl p-5 mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <p className="text-[13px] font-bold mb-3" style={{ color: '#1a1a2e' }}>📋 {L('Como funciona', 'How it works', 'Cómo funciona')}</p>
        <ol className="space-y-2.5 text-[12.5px]" style={{ color: '#475569' }}>
          {t._locale === 'en' ? (
            <>
              <li><b>1.</b> Share your link. Whoever signs up through it becomes your referral.</li>
              <li><b>2.</b> On their <b>first purchase</b> you earn: <b>10%</b> if they subscribe to the CRM (Monthly $10 · Quarterly $25 · Semiannual $40 · Annual $70) or <b>5%</b> if they buy a lead package (10 leads = $15 · 25 = $30 · 50 = $55).</li>
              <li><b>3.</b> The credit stays <b>pending for 14 days</b> (cancellation/refund window) and then becomes <b>available</b>.</li>
              <li><b>4.</b> The credit is applied as an <b>automatic discount</b> on your next lead purchase — it covers up to <b>50%</b> of the order and the rest stays saved.</li>
            </>
          ) : t._locale === 'es' ? (
            <>
              <li><b>1.</b> Comparte tu enlace. Quien se registre con él entra como tu referido.</li>
              <li><b>2.</b> En su <b>primera compra</b> tú ganas: <b>10%</b> si se suscribe al CRM (Mensual $10 · Trimestral $25 · Semestral $40 · Anual $70) o <b>5%</b> si compra un paquete de leads (10 leads = $15 · 25 = $30 · 50 = $55).</li>
              <li><b>3.</b> El crédito queda <b>pendiente por 14 días</b> (plazo de cancelación/reembolso) y después pasa a <b>disponible</b>.</li>
              <li><b>4.</b> El crédito se usa como <b>descuento automático</b> en tu próxima compra de leads — cubre hasta el <b>50%</b> del pedido y el resto queda guardado.</li>
            </>
          ) : (
            <>
              <li><b>1.</b> Compartilhe seu link. Quem se cadastrar por ele entra como seu indicado.</li>
              <li><b>2.</b> Na <b>primeira compra</b> dele você ganha: <b>10%</b> se ele assinar o CRM (Mensal $10 · Trimestral $25 · Semestral $40 · Anual $70) ou <b>5%</b> se ele comprar pacote de leads (10 leads = $15 · 25 = $30 · 50 = $55).</li>
              <li><b>3.</b> O crédito fica <b>pendente por 14 dias</b> (prazo de cancelamento/reembolso) e depois vira <b>disponível</b>.</li>
              <li><b>4.</b> O crédito é usado como <b>desconto automático</b> na sua próxima compra de leads — cobre até <b>50%</b> do pedido e o restante continua guardado.</li>
            </>
          )}
        </ol>
        <div className="mt-3 pt-3 text-[11.5px]" style={{ borderTop: '1px solid #f1f5f9', color: '#94a3b8' }}>
          {t._locale === 'en' ? (
            <>
              <b style={{ color: '#64748b' }}>Rules:</b> 1 reward per referral (on their first purchase) ·
              the referral must be a new account · referring yourself doesn&apos;t count (same email/phone) ·
              if the referral cancels or requests a refund, the credit is reversed ·
              limit of <b>$300 per month</b> in rewards · credit is not redeemable for cash.
            </>
          ) : t._locale === 'es' ? (
            <>
              <b style={{ color: '#64748b' }}>Reglas:</b> 1 recompensa por referido (en su primera compra) ·
              el referido debe ser una cuenta nueva · no vale referirte a ti mismo (mismo email/teléfono) ·
              si el referido cancela o pide reembolso, el crédito se revierte ·
              límite de <b>$300 por mes</b> en recompensas · el crédito no es canjeable por dinero.
            </>
          ) : (
            <>
              <b style={{ color: '#64748b' }}>Regras:</b> 1 recompensa por indicado (na primeira compra dele) ·
              o indicado precisa ser conta nova · não vale indicar a si mesmo (mesmo email/telefone) ·
              se o indicado cancelar ou pedir reembolso, o crédito é estornado ·
              limite de <b>$300 por mês</b> em recompensas · crédito não é resgatável em dinheiro.
            </>
          )}
        </div>
      </div>

      {/* Share link */}
      <div className="rounded-2xl p-5 mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#94a3b8' }}>{L('Seu link de indicação', 'Your referral link', 'Tu enlace de referido')}</p>
        <div className="flex gap-2">
          <input readOnly value={link}
            className="flex-1 px-3 py-2 rounded-lg text-[12px] font-mono"
            style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
          <button onClick={copy}
            className="px-4 py-2 rounded-lg text-[12px] font-bold"
            style={{ background: copied ? '#10b981' : '#eef2ff', color: copied ? '#fff' : '#6366f1' }}>
            {copied ? L('✓ Copiado', '✓ Copied', '✓ Copiado') : L('Copiar', 'Copy', 'Copiar')}
          </button>
          <button onClick={share}
            className="px-4 py-2 rounded-lg text-[12px] font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            {L('Compartilhar', 'Share', 'Compartir')}
          </button>
        </div>
        <p className="text-[11px] mt-2" style={{ color: '#94a3b8' }}>
          {L('Código:', 'Code:', 'Código:')} <span className="font-mono font-bold" style={{ color: '#1a1a2e' }}>{data.code}</span>
        </p>
      </div>

      {/* How it works */}
      <div className="rounded-2xl p-5 mb-6" style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}>
        <p className="text-[13px] font-bold mb-3" style={{ color: '#0c4a6e' }}>{L('Como funciona', 'How it works', 'Cómo funciona')}</p>
        <ol className="space-y-2 text-[13px]" style={{ color: '#0c4a6e' }}>
          <li><b>1.</b> {L('Compartilhe seu link com corretores', 'Share your link with agents', 'Comparte tu enlace con agentes')}</li>
          <li><b>2.</b> {L('Eles se cadastram pelo link e começam a usar', 'They sign up through the link and start using it', 'Ellos se registran con el enlace y empiezan a usarla')}</li>
          <li><b>3.</b> {L('Quando assinarem CRM Pro, você ganha crédito automaticamente', 'When they subscribe to CRM Pro, you earn credit automatically', 'Cuando se suscriban a CRM Pro, tú ganas crédito automáticamente')}</li>
          <li><b>4.</b> {L('Crédito é aplicado na sua próxima compra de leads ou mensalidade', 'Credit is applied to your next lead purchase or subscription payment', 'El crédito se aplica en tu próxima compra de leads o mensualidad')}</li>
        </ol>
      </div>

      {/* Rewards list */}
      {data.rewards.length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <p className="text-[13px] font-bold mb-3" style={{ color: '#1a1a2e' }}>{L('Histórico', 'History', 'Historial')}</p>
          <div className="space-y-2">
            {data.rewards.map((r, i) => (
              <div key={i} className="flex justify-between items-center py-2" style={{ borderBottom: i < data.rewards.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <div>
                  <p className="text-[13px] font-bold" style={{ color: '#1a1a2e' }}>{r.name}</p>
                  <p className="text-[11px]" style={{ color: '#94a3b8' }}>{triggerLabels(L)[r.trigger]} · {new Date(r.granted_at).toLocaleDateString(t._locale === 'en' ? 'en-US' : t._locale === 'es' ? 'es-US' : 'pt-BR')}</p>
                </div>
                <span className="text-[14px] font-bold" style={{ color: r.cents > 0 ? '#10b981' : '#94a3b8' }}>
                  {r.cents > 0 ? `+$${(r.cents / 100).toFixed(2)}` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
