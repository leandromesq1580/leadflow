import { createAdminClient } from '@/lib/supabase/admin'
import { SCRIPT_IUL_PADRAO, type CallScript } from '@/lib/call-script'

/**
 * FASE 2 DO ROTEIRO — a IA acompanha a ligação e sugere o próximo passo.
 *
 * A transcrição ao vivo (webhook do Twilio) chama avaliarConversa() a cada fala do
 * CLIENTE: as últimas falas + as etapas do roteiro do corretor vão pro modelo, que
 * devolve em que etapa a conversa está e UMA sugestão curta do que falar agora
 * (contorno de objeção quando houver). O resultado fica no mesmo registro da
 * transcrição (campo assist) e o painel ao lado do telefone consome via polling.
 *
 * Custos sob controle: só roda pra corretor com o roteiro LIGADO (opt-in), só em
 * fala do cliente, com debounce de 4s. Modelo rápido (haiku), ~1s de latência.
 * Falha aqui NUNCA afeta a ligação nem a transcrição — melhor sem sugestão do que
 * sem telefone.
 */

const MODELO = 'claude-haiku-4-5-20251001'
const DEBOUNCE_MS = 4000
const MAX_FALAS_NO_PROMPT = 16

export interface Assist {
  etapa_num: number          // 1-based
  etapa_id: string
  sugestao: string
  motivo?: string
  em: string                 // quando foi gerada
  apos_linha: number         // nº de falas quando foi gerada (pro debounce)
}

async function scriptDoBuyer(db: ReturnType<typeof createAdminClient>, buyerId: string): Promise<CallScript | null> {
  try {
    const { data } = await db.from('settings').select('value').eq('key', `call_script:${buyerId}`).maybeSingle()
    const v = (data?.value as any) || {}
    if (v.enabled !== true) return null   // opt-in desligado = sem IA, sem custo
    const s = v.script
    return s && Array.isArray(s.etapas) && s.etapas.length ? s : SCRIPT_IUL_PADRAO
  } catch { return null }
}

export async function avaliarConversa(callSid: string): Promise<Assist | null> {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
  if (!apiKey || !callSid) return null

  const db = createAdminClient()
  const chave = `call_transcript:${callSid}`
  const { data } = await db.from('settings').select('value').eq('key', chave).maybeSingle()
  const v = (data?.value as any)
  if (!v?.meta?.buyer_id || !Array.isArray(v.linhas) || v.linhas.length === 0) return null

  // debounce + só reavalia se há fala nova desde a última sugestão
  const antes: Assist | undefined = v.assist
  if (antes) {
    if (Date.now() - new Date(antes.em).getTime() < DEBOUNCE_MS) return antes
    if (antes.apos_linha >= v.linhas.length) return antes
  }

  const script = await scriptDoBuyer(db, String(v.meta.buyer_id))
  if (!script) return null

  const etapas = script.etapas.map((e, i) =>
    `${i + 1}. [${e.id}] ${e.titulo} — objetivo: ${e.objetivo || '—'}${e.gatilho ? ` — avança quando: ${e.gatilho}` : ''}`).join('\n')
  const falas = v.linhas.slice(-MAX_FALAS_NO_PROMPT)
    .map((l: any) => `[${l.quem === 'cliente' ? 'CLIENTE' : 'ATENDENTE'}] ${l.texto}`).join('\n')

  const prompt = `Você acompanha AO VIVO uma ligação de venda de seguro de vida (IUL) nos EUA, em português. O atendente segue um roteiro por etapas. A transcrição é de telefone e tem erros — interprete pelo contexto.

ROTEIRO (etapas):
${etapas}

ÚLTIMAS FALAS:
${falas}

Responda APENAS um JSON válido:
{"etapa_num": <número da etapa em que a conversa ESTÁ agora>, "sugestao": "<a MELHOR próxima fala do atendente, 1-2 frases, natural, em PT-BR — se o cliente levantou objeção ou fugiu do roteiro, a sugestão é o contorno>", "motivo": "<por quê, max 80 chars>"}

Regras:
- A sugestão é pra falar AGORA, respondendo à última fala do cliente.
- Objeção (preço, "já tenho", "depois", desinteresse, pediu outra coisa) tem prioridade sobre seguir o roteiro.
- Nada de jargão técnico; tom humano, direto, caloroso.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODELO, max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!res.ok) {
      console.error('[call-assist] API', res.status, (await res.text()).slice(0, 150))
      return null
    }
    const dataAi = await res.json()
    const texto = dataAi?.content?.[0]?.text || ''
    const m = texto.match(/\{[\s\S]*\}/)
    if (!m) return null
    const parsed = JSON.parse(m[0])
    const num = Math.max(1, Math.min(script.etapas.length, Number(parsed.etapa_num) || 1))
    const assist: Assist = {
      etapa_num: num,
      etapa_id: script.etapas[num - 1].id,
      sugestao: String(parsed.sugestao || '').slice(0, 400),
      motivo: String(parsed.motivo || '').slice(0, 120),
      em: new Date().toISOString(),
      apos_linha: v.linhas.length,
    }
    if (!assist.sugestao) return null

    await db.from('settings').upsert(
      { key: chave, value: { ...v, assist }, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
    return assist
  } catch (e: any) {
    console.error('[call-assist]', e?.message)
    return null
  }
}
