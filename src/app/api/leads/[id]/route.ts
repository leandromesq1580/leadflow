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

  // Se estiver removendo o membro atribuido (voltar pra mim), prepara pra migrar WA de volta
  let movingBackToOwner: string | null = null
  if ('assigned_to_member' in body && body.assigned_to_member === null) {
    const { data: leadBefore } = await adminDb.from('leads').select('assigned_to, assigned_to_member').eq('id', id).maybeSingle()
    if (leadBefore?.assigned_to && leadBefore.assigned_to_member) {
      movingBackToOwner = leadBefore.assigned_to as string
    }
  }

  const { data, error } = await adminDb
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 🔒 Privacidade: se o lead voltou pro owner original, move a thread WA de volta
  if (movingBackToOwner) {
    const migrated = await migrateWhatsAppOwnership(adminDb, id, movingBackToOwner)
    if (migrated > 0) console.log(`[Lead] Unassign: migrated ${migrated} WA messages back to ${movingBackToOwner}`)
  }

  return NextResponse.json({ lead: data })
}
