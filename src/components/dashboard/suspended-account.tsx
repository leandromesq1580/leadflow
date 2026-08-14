'use client'

import { useT } from '@/lib/i18n-client'

/** Tela exibida quando o comprador está com is_active=false. Bloqueia toda a plataforma. */
export function SuspendedAccount({ name }: { name: string }) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  async function logout() {
    try {
      const { createBrowserClient } = await import('@supabase/ssr')
      const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      await supabase.auth.signOut()
    } catch {}
    // Limpa também o cookie manual que o login.tsx escreve
    const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace('https://', '').split('.')[0]
    document.cookie = `sb-${ref}-auth-token=; path=/; max-age=0`
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-md rounded-2xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 8px 30px rgba(0,0,0,0.06)' }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: 'var(--err-soft)' }}>
          <span className="text-[34px]">🔒</span>
        </div>
        <h1 className="text-[20px] font-extrabold mb-2" style={{ color: 'var(--fg)' }}>{L('Conta suspensa', 'Account suspended', 'Cuenta suspendida')}</h1>
        <p className="text-[14px] leading-relaxed mb-1" style={{ color: 'var(--fg-secondary)' }}>
          {L('Olá', 'Hello', 'Hola')}{name ? `, ${name.split(' ')[0]}` : ''}. {L('Seu acesso ao Lead4Producers está temporariamente desativado.', 'Your access to Lead4Producers is temporarily disabled.', 'Tu acceso a Lead4Producers está temporalmente desactivado.')}
        </p>
        <p className="text-[13px] leading-relaxed mb-6" style={{ color: 'var(--fg-muted)' }}>
          {L('Para reativar sua conta e voltar a receber leads, fale com a nossa equipe.', 'To reactivate your account and start receiving leads again, talk to our team.', 'Para reactivar tu cuenta y volver a recibir leads, habla con nuestro equipo.')}
        </p>
        <a
          href="https://wa.me/17867442126"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full py-3 rounded-xl text-[14px] font-bold text-white mb-3"
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
        >
          💬 {L('Falar com o suporte', 'Talk to support', 'Hablar con soporte')}
        </a>
        <button onClick={logout} className="text-[13px] font-semibold" style={{ color: 'var(--fg-muted)' }}>
          {L('Sair', 'Sign out', 'Salir')}
        </button>
      </div>
    </div>
  )
}
