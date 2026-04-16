import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributeLeadToNextBuyer } from '@/lib/distribute'

const FORM_IDS = [
  '25952858404333766',  // FORMULARIO SEGURO-SEM PERGUNTA (principal)
  '1963007337624994',   // FORMULARIO SEGURO-SEM PERGUNTA-ESPANHOL
]

/**
 * GET /api/poll-leads — Polls Meta Graph API for new leads not yet in DB.
 * Workaround while app is in Development mode (webhooks don't fire for real users).
 * Called by cron every 2 minutes.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pageToken = (process.env.META_PAGE_TOKEN || '').trim().replace(/\\n/g, '')
  if (!pageToken) {
    return NextResponse.json({ error: 'No META_PAGE_TOKEN' }, { status: 500 })
  }

  const supabase = createAdminClient()
  let imported = 0
  let skipped = 0

  for (const formId of FORM_IDS) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v25.0/${formId}/leads?fields=id,created_time,field_data&limit=20&access_token=${pageToken}`
      )
      const data = await res.json()
      if (data.error) {
        console.error(`[Poll] Form ${formId} error:`, data.error.message)
        continue
      }

      for (const lead of data.data || []) {
        // Check duplicate
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .eq('meta_lead_id', lead.id)
          .single()

        if (existing) {
          skipped++
          continue
        }

        // Parse fields
        const fields: Record<string, string> = {}
        for (const f of lead.field_data || []) {
          fields[f.name] = f.values?.[0] || ''
        }

        const name = fields.full_name || fields.nome_completo || 'Lead Meta'
        const email = fields.email || ''
        const phone = fields.phone || fields.phone_number || ''

        // Save lead
        const { data: newLead, error } = await supabase
          .from('leads')
          .insert({
            meta_lead_id: lead.id,
            name,
            email,
            phone,
            city: '',
            state: 'FL',
            interest: 'Seguro de vida',
            campaign_name: 'Meta Lead Ads',
            form_name: formId,
            raw_data: lead,
            type: 'hot',
            status: 'new',
            product_type: 'lead',
            created_at: lead.created_time,
          })
          .select()
          .single()

        if (error || !newLead) {
          console.error('[Poll] Save failed:', error)
          continue
        }

        // Distribute
        const buyer = await distributeLeadToNextBuyer(newLead)
        console.log(`[Poll] Lead ${newLead.id} — ${name} → ${buyer?.name || 'no buyer'}`)
        imported++
      }
    } catch (err) {
      console.error(`[Poll] Form ${formId} fetch error:`, err)
    }
  }

  return NextResponse.json({
    status: 'ok',
    imported,
    skipped,
    timestamp: new Date().toISOString(),
  })
}
