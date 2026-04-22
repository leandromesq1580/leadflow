import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim()
const ASSISTANT_ID = (process.env.OPENAI_ASSISTANT_ID || '').trim()
const OPENAI_BASE = 'https://api.openai.com/v1'
const HEADERS = {
  'Authorization': `Bearer ${OPENAI_API_KEY}`,
  'Content-Type': 'application/json',
  'OpenAI-Beta': 'assistants=v2',
}

async function openai<T = unknown>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${OPENAI_BASE}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI ${res.status}: ${err.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

/**
 * POST /api/ai-consult  body: { message: string }
 * Usa um Assistant OpenAI (Life Insurance Specialist) pra responder.
 * Mantém thread persistente por buyer em `buyers.ai_thread_id`.
 */
export async function POST(request: NextRequest) {
  if (!OPENAI_API_KEY || !ASSISTANT_ID) {
    return NextResponse.json({ error: 'OpenAI não configurado' }, { status: 500 })
  }

  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message } = await request.json()
  if (!message?.trim()) return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })

  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers').select('id, ai_thread_id').eq('auth_user_id', user.id).maybeSingle()
  if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })

  try {
    // 1) Pega ou cria thread persistente
    let threadId = buyer.ai_thread_id as string | null
    if (!threadId) {
      const thread = await openai<{ id: string }>('/threads', 'POST', {})
      threadId = thread.id
      await db.from('buyers').update({ ai_thread_id: threadId }).eq('id', buyer.id)
    }

    // 2) Adiciona mensagem do user
    await openai(`/threads/${threadId}/messages`, 'POST', {
      role: 'user',
      content: message.trim(),
    })

    // 3) Roda o assistant
    const run = await openai<{ id: string; status: string }>(
      `/threads/${threadId}/runs`,
      'POST',
      { assistant_id: ASSISTANT_ID },
    )

    // 4) Polling do status (max ~30s)
    let attempts = 0
    let runStatus = run.status
    while ((runStatus === 'queued' || runStatus === 'in_progress') && attempts < 30) {
      await new Promise(r => setTimeout(r, 1000))
      const check = await openai<{ status: string; last_error?: { message: string } }>(
        `/threads/${threadId}/runs/${run.id}`,
        'GET',
      )
      runStatus = check.status
      if (check.last_error) {
        return NextResponse.json({ error: check.last_error.message }, { status: 500 })
      }
      attempts++
    }
    if (runStatus !== 'completed') {
      return NextResponse.json({ error: `Run não completou (status: ${runStatus})` }, { status: 500 })
    }

    // 5) Lê a resposta (ultima msg do assistant)
    const messages = await openai<{ data: Array<{ role: string; content: Array<{ type: string; text?: { value: string } }> }> }>(
      `/threads/${threadId}/messages?limit=5&order=desc`,
      'GET',
    )
    const latest = messages.data.find(m => m.role === 'assistant')
    const textBlock = latest?.content.find(c => c.type === 'text')
    const reply = textBlock?.text?.value || '(sem resposta)'

    return NextResponse.json({ reply, thread_id: threadId })
  } catch (err: unknown) {
    const msg = (err as Error)?.message || 'Erro desconhecido'
    console.error('[AI Consult] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** GET /api/ai-consult — histórico da thread */
export async function GET(request: NextRequest) {
  if (!OPENAI_API_KEY) return NextResponse.json({ messages: [] })

  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers').select('ai_thread_id').eq('auth_user_id', user.id).maybeSingle()
  if (!buyer?.ai_thread_id) return NextResponse.json({ messages: [] })

  try {
    const messages = await openai<{ data: Array<{ id: string; role: string; content: Array<{ type: string; text?: { value: string } }>; created_at: number }> }>(
      `/threads/${buyer.ai_thread_id}/messages?limit=50&order=asc`,
      'GET',
    )
    const list = messages.data.map(m => ({
      id: m.id,
      role: m.role,
      text: m.content.find(c => c.type === 'text')?.text?.value || '',
      created_at: m.created_at,
    }))
    return NextResponse.json({ messages: list })
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error)?.message, messages: [] })
  }
}

/** DELETE /api/ai-consult — reseta thread (começa nova conversa) */
export async function DELETE(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  await db.from('buyers').update({ ai_thread_id: null }).eq('auth_user_id', user.id)
  return NextResponse.json({ ok: true })
}
