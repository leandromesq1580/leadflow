import { createAdminClient } from '@/lib/supabase/admin'

interface ScoreResult {
  score: number // 0-100
  reason: string
}

/**
 * Score a lead 0-100 using Claude API.
 * Considers: interest, state, source, tempo de contato, respostas, histórico.
 */
export async function scoreLeadWithAI(leadId: string): Promise<ScoreResult | null> {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
  if (!apiKey) {
    console.warn('[AI Score] ANTHROPIC_API_KEY not set — skipping')
    return null
  }

  const db = createAdminClient()

  // Gather context
  const { data: lead } = await db.from('leads').select('*').eq('id', leadId).single()
  if (!lead) return null

  const { data: messages } = await db
    .from('whatsapp_messages')
    .select('direction, body, sent_at')
    .eq('lead_id', leadId)
    .order('sent_at', { ascending: true })
    .limit(20)

  const { data: followUps } = await db
    .from('follow_ups')
    .select('type, description, completed_at')
    .eq('lead_id', leadId)
    .order('completed_at', { ascending: true })
    .limit(10)

  const ageDays = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400_000)
  const outgoing = (messages || []).filter(m => m.direction === 'out').length
  const incoming = (messages || []).filter(m => m.direction === 'in').length
  const conversation = (messages || []).map(m => `[${m.direction === 'in' ? 'LEAD' : 'AGENTE'}] ${m.body?.slice(0, 200)}`).join('\n')

  const prompt = `Você é um avaliador de leads de seguro de vida nos EUA. Analise este lead e retorne um score de 0-100 (100 = mais quente/provável fechar).

LEAD:
- Nome: ${lead.name || 'Sem nome'}
- Estado: ${lead.state || 'N/A'}, Cidade: ${lead.city || 'N/A'}
- Interesse: ${lead.interest || 'Geral'}
- Fonte: ${lead.source || 'N/A'}
- Status: ${lead.status}
- Dias desde captura: ${ageDays}
- Tem telefone: ${lead.phone ? 'sim' : 'não'}, Tem email: ${lead.email ? 'sim' : 'não'}

ENGAJAMENTO:
- Mensagens enviadas pelo agente: ${outgoing}
- Respostas do lead: ${incoming}
- Follow-ups registrados: ${followUps?.length || 0}

CONVERSA (últimas msgs):
${conversation || '(sem conversa ainda)'}

Retorne APENAS um JSON válido no formato:
{"score": <0-100>, "reason": "<1 frase curta em PT-BR explicando por que, max 120 chars>"}

Regras:
- Respondeu recentemente = muito quente (80-100)
- Engajou mas silenciou >7d = morno (40-60)
- Nunca respondeu + >14d = frio (0-30)
- Dados completos (tel+email+interest específico) + fonte hot = bonus
- Estado de alta demanda (FL, TX, CA, NJ, MA) = bonus leve`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[AI Score] API error:', res.status, err.slice(0, 200))
      return null
    }

    const data = await res.json()
    const content = data?.content?.[0]?.text || ''
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    const score = Math.max(0, Math.min(100, Number(parsed.score) || 0))
    const reason = String(parsed.reason || '').slice(0, 200)

    // Save to lead
    await db.from('leads').update({
      ai_score: score,
      ai_score_reason: reason,
      ai_scored_at: new Date().toISOString(),
    }).eq('id', leadId)

    return { score, reason }
  } catch (err: any) {
    console.error('[AI Score] Exception:', err?.message)
    return null
  }
}

/** Score all leads for a buyer that haven't been scored recently (>24h) */
export async function scoreStaleLeads(buyerId: string, limit = 20): Promise<number> {
  const db = createAdminClient()
  const cutoff = new Date(Date.now() - 86400_000).toISOString()

  const { data: leads } = await db
    .from('leads')
    .select('id')
    .eq('assigned_to', buyerId)
    .neq('status', 'converted')
    .neq('status', 'lost')
    .or(`ai_scored_at.is.null,ai_scored_at.lte.${cutoff}`)
    .limit(limit)

  let count = 0
  for (const lead of leads || []) {
    const result = await scoreLeadWithAI(lead.id)
    if (result) count++
  }
  return count
}
