'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n-client'

/**
 * Onboarding do add-on Gestão de Apólices ($39/mês):
 *  1) sem add-on → página de venda com o checkout
 *  2) add-on pago → formulário de conexão do portal (credenciais vão direto
 *     pro robô no servidor via HTTPS — nunca ficam no banco)
 * Conectou → recarrega e a página vira o book completo (a 1ª varredura já anda).
 */
export function ApolicesOnboard({ addonAtivo: addonInicial }: { addonAtivo: boolean }) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt

  const [addonAtivo, setAddonAtivo] = useState(addonInicial)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [agente, setAgente] = useState('')

  // voltou do checkout? o webhook pode levar uns segundos — fica de olho
  useEffect(() => {
    if (addonAtivo) return
    const p = new URLSearchParams(window.location.search)
    if (p.get('addon') !== 'ok') return
    const timer = setInterval(async () => {
      try {
        const d = await fetch('/api/apolices/conectar', { cache: 'no-store' }).then(r => r.json())
        if (d.addonAtivo) { setAddonAtivo(true); clearInterval(timer) }
      } catch {}
    }, 3000)
    return () => clearInterval(timer)
  }, [addonAtivo])

  async function assinar() {
    setCarregando(true); setErro(null)
    try {
      const r = await fetch('/api/apolices/checkout', { method: 'POST' })
      const d = await r.json()
      if (!r.ok || !d.url) { setErro(d.error || L('Não consegui abrir o pagamento.', 'Could not open checkout.', 'No pude abrir el pago.')); setCarregando(false); return }
      window.location.href = d.url
    } catch { setErro(L('Erro de conexão.', 'Connection error.', 'Error de conexión.')); setCarregando(false) }
  }

  async function conectar() {
    if (!usuario.trim() || !senha) { setErro(L('Preencha usuário e senha do portal.', 'Enter your portal username and password.', 'Completa usuario y contraseña del portal.')); return }
    setCarregando(true); setErro(null)
    try {
      const r = await fetch('/api/apolices/conectar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: usuario.trim(), senha, agente: agente.trim() }),
      })
      const d = await r.json()
      if (!r.ok) { setErro(d.error || L('Não consegui conectar.', 'Could not connect.', 'No pude conectar.')); setCarregando(false); return }
      window.location.href = '/dashboard/apolices'
      window.location.reload()
    } catch { setErro(L('Erro de conexão.', 'Connection error.', 'Error de conexión.')); setCarregando(false) }
  }

  const inStyle = { width: '100%', padding: '10px 13px', borderRadius: 10, border: '1px solid #e8ecf4', fontSize: 14, color: '#1a1a2e', background: '#fff', outline: 'none' } as const
  const lbl = { fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', margin: '14px 0 5px' } as const

  return (
    <div className="max-w-[720px]">
      <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>{L('Gestão de Apólices', 'Policy Management', 'Gestión de Pólizas')}</h1>
      <p className="text-[14px] mt-1 mb-6" style={{ color: '#64748b' }}>
        {L('Pós-venda: o que precisa da sua ação hoje para não perder cliente nem comissão',
           'Post-sale: what needs your action today so you do not lose the client or the commission',
           'Posventa: lo que necesita tu acción hoy para no perder al cliente ni la comisión')}
      </p>

      {!addonAtivo ? (
        <div className="rounded-2xl p-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <p className="text-[16px] font-bold" style={{ color: '#1a1a2e' }}>
            {L('Seu book inteiro, vigiado todos os dias — direto do portal da National Life',
               'Your entire book, watched every day — straight from the National Life portal',
               'Todo tu book, vigilado todos los días — directo del portal de National Life')}
          </p>
          <ul className="mt-4 space-y-2 text-[14px]" style={{ color: '#475569' }}>
            <li>🤖 {L('O robô entra no SEU portal todo dia e traz 100% das apólices', 'The robot logs into YOUR portal daily and brings 100% of your policies', 'El robot entra a TU portal cada día y trae el 100% de tus pólizas')}</li>
            <li>🔴 {L('Apólice caducando aparece com dívida, prazo e telefone do cliente — antes do chargeback', 'A lapsing policy shows up with debt, deadline and client phone — before the chargeback', 'La póliza por caducar aparece con deuda, plazo y teléfono del cliente — antes del chargeback')}</li>
            <li>📋 {L('Pendências organizadas: o que é sua ação, o que é do cliente, o que é da seguradora', 'Pending items organized: your action, the client’s, the carrier’s', 'Pendientes organizados: tu acción, la del cliente, la de la aseguradora')}</li>
            <li>💰 {L('Um único chargeback evitado paga anos do add-on', 'A single avoided chargeback pays for years of the add-on', 'Un solo chargeback evitado paga años del add-on')}</li>
          </ul>
          <div className="flex items-center gap-4 mt-6 flex-wrap">
            <button onClick={assinar} disabled={carregando}
              className="px-6 py-3 rounded-xl text-[15px] font-bold text-white disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
              {carregando ? L('Abrindo…', 'Opening…', 'Abriendo…') : L('Assinar — $39/mês', 'Subscribe — $39/mo', 'Suscribir — $39/mes')}
            </button>
            <span className="text-[12px]" style={{ color: '#94a3b8' }}>
              {L('Separado do CRM · cancele quando quiser', 'Separate from the CRM · cancel anytime', 'Separado del CRM · cancela cuando quieras')}
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl p-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <p className="text-[15px] font-bold" style={{ color: '#059669' }}>
            ✅ {L('Add-on ativo! Agora conecte seu portal da National Life:', 'Add-on active! Now connect your National Life portal:', '¡Add-on activo! Ahora conecta tu portal de National Life:')}
          </p>
          <label style={lbl}>{L('Usuário do portal (nationallife.com)', 'Portal username (nationallife.com)', 'Usuario del portal (nationallife.com)')}</label>
          <input style={inStyle} value={usuario} onChange={e => setUsuario(e.target.value)} autoComplete="off" />
          <label style={lbl}>{L('Senha do portal', 'Portal password', 'Contraseña del portal')}</label>
          <input style={inStyle} type="password" value={senha} onChange={e => setSenha(e.target.value)} autoComplete="new-password" />
          <label style={lbl}>{L('Seu número de agente (ex.: 484G2) — opcional', 'Your agent number (e.g., 484G2) — optional', 'Tu número de agente (ej.: 484G2) — opcional')}</label>
          <input style={inStyle} value={agente} onChange={e => setAgente(e.target.value)} placeholder="484G2" />
          <p className="text-[12px] mt-3" style={{ color: '#94a3b8' }}>
            🔒 {L('Suas credenciais vão por conexão segura direto pro robô no servidor e ficam num arquivo protegido — nunca no banco de dados. Se o portal pedir código de verificação (chega no seu e-mail), a tela vai te mostrar onde digitar.',
                  'Your credentials go over a secure connection straight to the robot on the server and live in a protected file — never in the database. If the portal asks for a verification code (sent to your email), the screen will show you where to type it.',
                  'Tus credenciales van por conexión segura directo al robot en el servidor y viven en un archivo protegido — nunca en la base de datos. Si el portal pide un código de verificación (llega a tu correo), la pantalla te mostrará dónde escribirlo.')}
          </p>
          <button onClick={conectar} disabled={carregando}
            className="mt-4 px-6 py-3 rounded-xl text-[15px] font-bold text-white disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
            {carregando ? L('Conectando…', 'Connecting…', 'Conectando…') : L('Conectar meu portal', 'Connect my portal', 'Conectar mi portal')}
          </button>
        </div>
      )}

      {erro && (
        <div className="rounded-xl p-3 mt-4 text-[13px] font-semibold" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
          {erro}
        </div>
      )}
    </div>
  )
}
