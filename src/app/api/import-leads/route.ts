import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface SheetLead {
  id: string
  created_time: string
  full_name: string
  email: string
  phone: string
  campaign_name: string
  form_name: string
  platform: string
}

/**
 * POST /api/import-leads
 * Import leads from Google Sheets CSV data with original dates preserved
 */
export async function POST(request: NextRequest) {
  try {
    const { leads, sheetUrl } = await request.json()

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ error: 'No leads provided' }, { status: 400 })
    }

    const db = createAdminClient()
    let imported = 0
    let skipped = 0
    const errors: string[] = []

    for (const lead of leads as SheetLead[]) {
      // Clean phone (remove "p:" prefix)
      const phone = (lead.phone || '').replace(/^p:/, '').trim()
      const name = (lead.full_name || '').trim()
      const email = (lead.email || '').trim()

      if (!name || !phone) {
        skipped++
        continue
      }

      // Check for duplicate by meta_lead_id or email+phone combo
      const metaId = (lead.id || '').replace(/^l:/, '').trim()

      if (metaId) {
        const { data: existing } = await db
          .from('leads')
          .select('id')
          .eq('meta_lead_id', metaId)
          .single()

        if (existing) {
          skipped++
          continue
        }
      }

      // Calculate age to determine hot/cold
      const createdAt = new Date(lead.created_time)
      const daysSinceCreation = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
      const type = daysSinceCreation > 7 ? 'cold' : 'hot'

      // Insert lead with ORIGINAL created_at date
      const { error } = await db.from('leads').insert({
        meta_lead_id: metaId || null,
        name,
        email,
        phone,
        city: '',
        state: '',
        interest: 'Seguro de vida',
        campaign_name: lead.campaign_name || '',
        form_name: lead.form_name || '',
        raw_data: { source: 'google_sheets', platform: lead.platform, sheet_url: sheetUrl },
        type,
        status: 'new',
        product_type: 'lead',
        created_at: createdAt.toISOString(),
      })

      if (error) {
        errors.push(`${name}: ${error.message}`)
      } else {
        imported++
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      errors: errors.slice(0, 5),
      total: leads.length,
    })
  } catch (error: any) {
    console.error('[Import] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to import' }, { status: 500 })
  }
}
