import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { migrateWhatsAppOwnership } from '@/lib/lead-ownership'

/**
 * GET /api/leads/[id]
 * Get a specific lead with activity history
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminDb = createAdminClient()
  const { data: lead, error } = await adminDb
    .from('leads')
    .select(`
      *,
      buyer:buyers!assigned_to(name, email),
      activities:lead_activity(*, buyer:buyers(name))
    `)
    .eq('id', id)
    .single()

  if (error || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  return NextResponse.json({ lead })
}

/**
 * PATCH /api/leads/[id]
 * Update lead status or assignment
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const allowedFields = [
    'status', 'assigned_to', 'assigned_at', 'product_type', 'type',
    'name', 'email', 'phone', 'city', 'state', 'interest',
    'age_range', 'reason', 'platform', 'is_organic', 'contract_closed',
    'policy_value', 'observation', 'attendant', 'assigned_to_member', 'closed_at',
  ]
  const updates: Record<string, unknown> = {}

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field]
    }
  }

  // Use admin client to bypass RLS for updates
  const adminDb = createAdminClient()

  // Se estiver removendo o membro atribuido (voltar pra mim), prepara pra:
  //  - migrar WA de volta pro owner
  //  - REMOVER o pipeline_lead do pipe do member (espelho fica zerado)
  //  - RESTAURAR pipeline_lead no pipe default do owner (lead volta pro kanban dele)
  let movingBackToOwner: string | null = null
  let prevMemberId: string | null = null
  if ('assigned_to_member' in body && body.assigned_to_member === null) {
    const { data: leadBefore } = await adminDb.from('leads').select('assigned_to, assigned_to_member').eq('id', id).maybeSingle()
    if (leadBefore?.assigned_to && leadBefore.assigned_to_member) {
      movingBackToOwner = leadBefore.assigned_to as string
      prevMemberId = leadBefore.assigned_to_member as string
    }
  }

  // DEBUG temporario pra rastrear policy_value/closed_at
  if ('policy_value' in body || 'closed_at' in body || 'contract_closed' in body) {
    console.log(`[Lead PATCH ${id}] body:`, JSON.stringify({
      policy_value: body.policy_value,
      closed_at: body.closed_at,
      contract_closed: body.contract_closed,
    }), 'updates keys:', Object.keys(updates))
  }

  const { data, error } = await adminDb
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error(`[Lead PATCH ${id}] DB error:`, error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 🔒 Privacidade: se o lead voltou pro owner original, move a thread WA de volta
  if (movingBackToOwner) {
    const migrated = await migrateWhatsAppOwnership(adminDb, id, movingBackToOwner)
    if (migrated > 0) console.log(`[Lead] Unassign: migrated ${migrated} WA messages back to ${movingBackToOwner}`)

    // Remove o lead do pipeline do team_member antigo (se ele tem conta propria
    // e tinha o lead no kanban dele). Espelha o que /api/team/assign faz no
    // sentido contrario.
    if (prevMemberId) {
      const { data: prevMember } = await adminDb
        .from('team_members')
        .select('auth_user_id, email')
        .eq('id', prevMemberId)
        .maybeSingle()

      let prevMemberBuyerId: string | null = null
      if (prevMember?.auth_user_id) {
        const { data: b } = await adminDb.from('buyers').select('id').eq('auth_user_id', prevMember.auth_user_id).maybeSingle()
        prevMemberBuyerId = b?.id || null
      }
      if (!prevMemberBuyerId && prevMember?.email) {
        const { data: b } = await adminDb.from('buyers').select('id').ilike('email', prevMember.email).maybeSingle()
        prevMemberBuyerId = b?.id || null
      }

      if (prevMemberBuyerId) {
        const { data: prevPipes } = await adminDb
          .from('pipelines')
          .select('id')
          .eq('buyer_id', prevMemberBuyerId)
        const prevPipeIds = (prevPipes || []).map(p => p.id)
        if (prevPipeIds.length > 0) {
          await adminDb.from('pipeline_leads').delete()
            .eq('lead_id', id)
            .in('pipeline_id', prevPipeIds)
        }
      }
    }

    // Restaura o lead no pipe default do owner (se nao estiver la), Novo Lead.
    const { data: ownerPipe } = await adminDb
      .from('pipelines')
      .select('id, stages:pipeline_stages(id, position)')
      .eq('buyer_id', movingBackToOwner)
      .eq('is_default', true)
      .maybeSingle()
    if (ownerPipe?.id && ownerPipe.stages?.length) {
      const firstStage = (ownerPipe.stages as any[]).sort((a: any, b: any) => a.position - b.position)[0]
      await adminDb.from('pipeline_leads').upsert({
        lead_id: id,
        pipeline_id: ownerPipe.id,
        stage_id: firstStage.id,
        position: 0,
        moved_at: new Date().toISOString(),
      }, { onConflict: 'lead_id,pipeline_id' })
    }
  }

  return NextResponse.json({ lead: data })
}

/**
 * DELETE /api/leads/[id] — exclusão DEFINITIVA. Só lead JÁ ARQUIVADO (força o fluxo de 2 passos)
 * e só pelo dono (assigned_to) ou admin. Apaga os anexos do storage e a linha do lead —
 * as tabelas filhas (mensagens, follow-ups, forms, pipeline etc.) caem por ON DELETE CASCADE.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: buyer } = await db
    .from('buyers')
    .select('id, is_admin')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })

  const { data: lead } = await db
    .from('leads')
    .select('id, archived, assigned_to')
    .eq('id', id)
    .single()
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
  if (!lead.archived) {
    return NextResponse.json({ error: 'Arquive o lead antes de excluir definitivamente.' }, { status: 400 })
  }
  if (!buyer.is_admin && lead.assigned_to !== buyer.id) {
    return NextResponse.json({ error: 'Só o dono do lead (ou admin) pode excluir.' }, { status: 403 })
  }

  // Anexos: o cascade apaga as linhas, mas NÃO os arquivos do bucket — remove antes.
  try {
    const { data: atts } = await db.from('lead_attachments').select('file_path').eq('lead_id', id)
    const paths = (atts || []).map((a: any) => a.file_path).filter(Boolean)
    if (paths.length) await db.storage.from('lead-attachments').remove(paths)
  } catch {}

  // Conversas do lead são SET NULL (ficariam órfãs) — exclusão definitiva apaga junto.
  // Itens de calendário só desvinculam (agenda é do usuário, não do lead).
  try { await db.from('whatsapp_messages').delete().eq('lead_id', id) } catch {}
  try { await db.from('sms_messages').delete().eq('lead_id', id) } catch {}

  const { error } = await db.from('leads').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, deleted: id })
}
