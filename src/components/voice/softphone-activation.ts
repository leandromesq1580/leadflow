/**
 * Ativação do telefone do navegador (Twilio Device), separada do componente pra ser testável.
 *
 * Incidente 08–09/10/2026 (Fernanda, Giselle): o clique em "Ligar" enquanto o telefone
 * ainda estava ativando (token + register em andamento) era tratado como FALHA — a função
 * antiga devolvia `false` quando havia ativação em curso, e o componente mostrava o alerta
 * "Não consegui ativar o telefone agora… verifique a permissão de microfone", mesmo com a
 * ativação terminando bem logo depois. Reproduzido em teste local em 09/10 (teste 1 abaixo).
 *
 * Regras:
 *  - ensure() com ativação em curso ESPERA a mesma ativação (uma só por vez) em vez de falhar;
 *  - toda falha tem um motivo legível, pra o alerta dizer o que aconteceu de verdade;
 *  - depois de uma falha, o próximo ensure() tenta de novo (não fica travado).
 */

export type ActivationReason = 'unauthorized' | 'voice_unavailable' | 'token' | 'sdk' | 'unmounted'

export type ActivationResult<D> = { ok: true; device: D } | { ok: false; reason: ActivationReason; detail?: string }

type TokenResponse = { ok: boolean; status: number; json: () => Promise<any> }

export type ActivatorDeps<D> = {
  fetchToken: () => Promise<TokenResponse>
  /** Cria e configura o Device (listeners inclusos). Não chama register(). */
  createDevice: (token: string) => Promise<D & { destroy: () => void; updateToken: (token: string) => void }>
  isMounted: () => boolean
  onIdentity?: (identity: string) => void
  log: (message: string) => void
}

export function createDeviceActivator<D>(deps: ActivatorDeps<D>) {
  let current: (D & { destroy: () => void; updateToken: (token: string) => void }) | null = null
  let inflight: Promise<ActivationResult<D>> | null = null

  async function activate(): Promise<ActivationResult<D>> {
    let res: TokenResponse
    try {
      res = await deps.fetchToken()
    } catch (e: any) {
      deps.log(`token: ${e?.message || e}`)
      return { ok: false, reason: 'token', detail: String(e?.message || e) }
    }
    if (!res.ok) {
      deps.log(`token HTTP ${res.status}`)
      if (res.status === 401 || res.status === 403) return { ok: false, reason: 'unauthorized', detail: `HTTP ${res.status}` }
      if (res.status === 503) return { ok: false, reason: 'voice_unavailable', detail: `HTTP ${res.status}` }
      return { ok: false, reason: 'token', detail: `HTTP ${res.status}` }
    }
    let token = ''
    try {
      const body = await res.json()
      token = String(body?.token || '')
      if (body?.identity) deps.onIdentity?.(String(body.identity))
    } catch (e: any) {
      deps.log(`token body: ${e?.message || e}`)
      return { ok: false, reason: 'token', detail: 'resposta inválida' }
    }
    if (!token) return { ok: false, reason: 'token', detail: 'sem token' }
    if (!deps.isMounted()) return { ok: false, reason: 'unmounted' }

    let device = current
    try {
      if (device) device.updateToken(token)
      else device = await deps.createDevice(token)
    } catch (e: any) {
      try { device?.destroy() } catch {}
      current = null
      deps.log(`sdk: ${e?.message || e}`)
      return { ok: false, reason: 'sdk', detail: String(e?.message || e) }
    }
    if (!deps.isMounted()) {
      try { device.destroy() } catch { /* desmontagem não deve deixar uma ativação rejeitada */ }
      return { ok: false, reason: 'unmounted' }
    }
    // Saída usa connect(), que abre seu próprio canal. register() só habilita
    // recebimento e pode recusar/travar sem que isso impeça chamadas de saída.
    current = device
    return { ok: true, device }
  }

  return {
    /** Instância preparada para TENTAR saída, não conexão/microfone validados.
     * refresh=true renova a autorização no clique, mesmo sem sinalização prévia.
     * Chamadas simultâneas compartilham a MESMA preparação/renovação. */
    ensure(options: { refresh?: boolean } = {}): Promise<ActivationResult<D>> {
      if (inflight) return inflight
      if (current && !options.refresh) return Promise.resolve({ ok: true, device: current })
      inflight = activate().finally(() => { inflight = null })
      return inflight
    },
    current(): D | null { return current },
    /** Esquece o Device (desmontagem). Não chama destroy(): isso é do componente. */
    clear() { current = null },
  }
}
