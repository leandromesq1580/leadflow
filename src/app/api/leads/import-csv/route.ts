import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stateFromPhone } from '@/lib/us-area-codes'

interface CsvLead {
  name?: string
  phone?: string
  email?: string
  state?: string
  city?: string
  interest?: string
  notes?: string
}

/**
 * POST /api/leads/import-csv
 * Import em massa de leads do CSV.
 * Auto-atribui todos ao buyer logado + adiciona no pipeline default.
 *
 * Body: { leads: CsvLead[] }
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
  const csvLeads: CsvLead[] = body.leads || []

  if (!Array.isArray(csvLeads) || csvLeads.length === 0) {
    return NextResponse.json({ error: 'Nenhum lead enviado' }, { status: 400 })
  }

  if (csvLeads.length > 2000) {
    return NextResponse.json({ error: 'Limite de 2000 leads por import' }, { status: 400 })
  }

  // Default pipeline
  const { data: defaultPipe } = await db
    .from('pipelines')
    .select('id, pipeline_stages(id, position)')
    .eq('buyer_id', buyer.id)
    .eq('is_default', true)
    .single()

  const firstStageId = defaultPipe
    ? (((defaultPipe as any).pipeline_stages || []).sort((a: any, b: any) => a.position - b.position)[0]?.id)
    : null

  // Build rows to insert
  const rowsToInsert: any[] = []
  const invalid: Array<{ row: number; reason: string }> = []

  csvLeads.forEach((lead, idx) => {
    const name = (lead.name || '').trim()
    const phone = (lead.phone || '').trim()
    const email = (lead.email || '').trim()

    if (!name) {
      invalid.push({ row: idx + 1, reason: 'nome obrigatório' })
      return
    }
    if (!phone && !email) {
      invalid.push({ row: idx + 1, reason: 'telefone ou email obrigatório' })
      return
    }

    rowsToInsert.push({
      name,
      phone,
      email,
      state: (lead.state || '').trim() || stateFromPhone(phone) || '',
      city: (lead.city || '').trim(),
      interest: (lead.interest || 'Seguro de vida').trim(),
      campaign_name: 'Import CSV',
      form_name: 'csv_import',
      type: 'hot',
      status: 'assigned',
      product_type: 'lead',
      assigned_to: buyer.id,
      raw_data: { source: 'csv_import', notes: lead.notes || '' },
    })
  })

  if (rowsToInsert.length === 0) {
    return NextResponse.json({ error: 'Nenhum lead válido no CSV', invalid }, { status: 400 })
  }

  // Batch insert in chunks of 100
  const CHUNK = 100
  const insertedLeads: any[] = []
  for (let i = 0; i < rowsToInsert.length; i += CHUNK) {
    const chunk = rowsToInsert.slice(i, i + CHUNK)
    const { data, error } = await db.from('leads').insert(chunk).select('id')
    if (error) {
      return NextResponse.json({ error: `Falha na inserção (chunk ${i}): ${error.message}` }, { status: 500 })
    }
    insertedLeads.push(...(data || []))
  }

  // Add all to pipeline
  if (firstStageId && defaultPipe && insertedLeads.length > 0) {
    const pipelineRows = insertedLeads.map((l, idx) => ({
      lead_id: l.id,
      pipeline_id: defaultPipe.id,
      stage_id: firstStageId,
      position: idx,
      moved_at: new Date().toISOString(),
    }))
    for (let i = 0; i < pipelineRows.length; i += CHUNK) {
      await db.from('pipeline_leads').insert(pipelineRows.slice(i, i + CHUNK))
    }
  }

  return NextResponse.json({
    success: true,
    imported: insertedLeads.length,
    skipped: invalid.length,
    invalid: invalid.slice(0, 10),
    total: csvLeads.length,
  })
}
