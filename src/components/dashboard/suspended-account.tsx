'use client'

/** Tela exibida quando o comprador está com is_active=false. Bloqueia toda a plataforma. */
export function SuspendedAccount({ name }: { name: string }) {
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
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#f8f9fc' }}>
      <div className="w-full max-w-md rounded-2xl p-8 text-center" style={{ background: '#fff', border: '1px solid #e8ecf4', boxShadow: '0 8px 30px rgba(0,0,0,0.06)' }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: '#fef2f2' }}>
          <span className="text-[34px]">🔒</span>
        </div>
        <h1 className="text-[20px] font-extrabold mb-2" style={{ color: '#1a1a2e' }}>Conta suspensa</h1>
        <p className="text-[14px] leading-relaxed mb-1" style={{ color: '#64748b' }}>
          Olá{name ? `, ${name.split(' ')[0]}` : ''}. Seu acesso ao Lead4Producers está temporariamente desativado.
        </p>
        <p className="text-[13px] leading-relaxed mb-6" style={{ color: '#94a3b8' }}>
          Para reativar sua conta e voltar a receber leads, fale com a nossa equipe.
        </p>
        <a
          href="https://wa.me/17867442126"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full py-3 rounded-xl text-[14px] font-bold text-white mb-3"
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
        >
          💬 Falar com o suporte
        </a>
        <button onClick={logout} className="text-[13px] font-semibold" style={{ color: '#94a3b8' }}>
          Sair
        </button>
      </div>
    </div>
  )
}
