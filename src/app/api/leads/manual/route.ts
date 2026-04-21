import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stateFromPhone } from '@/lib/us-area-codes'

/**
 * POST /api/leads/manual
 * Cria um lead manualmente e auto-atribui ao buyer logado.
 * Também adiciona ao pipeline default do buyer (se tiver).
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: buyer } = await db
    .from('buyers')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })

  const body = await request.json()
  const { name, phone, email, state, city, interest, notes } = body

  if (!name?.trim() || (!phone?.trim() && !email?.trim())) {
    return NextResponse.json({ error: 'Nome e (telefone ou email) obrigatórios' }, { status: 400 })
  }

  // Se nao veio estado, tenta inferir pelo DDD do telefone
  const finalState = (state || '').trim() || stateFromPhone(phone) || ''

  // Insert lead
  const { data: lead, error } = await db
    .from('leads')
    .insert({
      name: name.trim(),
      phone: (phone || '').trim(),
      email: (email || '').trim(),
      state: finalState,
      city: (city || '').trim(),
      interest: (interest || 'Seguro de vida').trim(),
      campaign_name: 'Manual',
      form_name: 'manual_entry',
      type: 'hot',
      status: 'assigned',
      product_type: 'lead',
      assigned_to: buyer.id,
      raw_data: { source: 'manual', notes: notes || '' },
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Add to default pipeline
  const { data: defaultPipe } = await db
    .from('pipelines')
    .select('id, pipeline_stages(id, position)')
    .eq('buyer_id', buyer.id)
    .eq('is_default', true)
    .single()

  if (defaultPipe) {
    const stages = ((defaultPipe as any).pipeline_stages || []).sort((a: any, b: any) => a.position - b.position)
    if (stages.length > 0) {
      await db.from('pipeline_leads').insert({
        lead_id: lead.id,
        pipeline_id: defaultPipe.id,
        stage_id: stages[0].id,
        position: 0,
        moved_at: new Date().toISOString(),
      })
    }
  }

  return NextResponse.json({ lead })
}
