import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributeLeadToNextBuyer } from '@/lib/distribute'
import { sendLeadNotificationEmail } from '@/lib/notifications'

const FORM_IDS = [
  '25952858404333766',  // FORMULARIO SEGURO-SEM PERGUNTA (principal)
  '1963007337624994',   // FORMULARIO SEGURO-SEM PERGUNTA-ESPANHOL
]

async function forceAssign(supabase: ReturnType<typeof createAdminClient>, lead: any, email: string) {
  const { data: buyer } = await supabase
    .from('buyers')
    .select('id, name, email, phone, notification_email, notification_sms')
    .ilike('email', email)
    .maybeSingle()

  if (!buyer) {
    console.error(`[Poll] FORCE_ASSIGN: buyer ${email} not found — falling back to normal distribution`)
    return null
  }

  await supabase
    .from('leads')
    .update({ assigned_to: buyer.id, assigned_at: new Date().toISOString(), status: 'assigned' })
    .eq('id', lead.id)

  await sendLeadNotificationEmail(buyer as any, lead)

  // Auto-add to default pipeline (same behavior as distributeLeadToNextBuyer)
  const { data: pipe } = await supabase
    .from('pipelines')
    .select('id, stages:pipeline_stages(id, position)')
    .eq('buyer_id', buyer.id)
    .eq('is_default', true)
    .maybeSingle()

  if (pipe?.stages?.length) {
    const firstStage = (pipe.stages as any[]).sort((a: any, b: any) => a.position - b.position)[0]
    await supabase.from('pipeline_leads').upsert({
      lead_id: lead.id,
      pipeline_id: pipe.id,
      stage_id: firstStage.id,
      position: 0,
      moved_at: new Date().toISOString(),
    }, { onConflict: 'lead_id,pipeline_id' })
  }

  console.log(`[Poll] FORCE_ASSIGN: lead ${lead.id} → ${buyer.name} (${buyer.email})`)
  return buyer
}

/**
 * GET /api/poll-leads — Polls Meta Graph API for new leads not yet in DB.
 * Workaround while app is in Development mode (webhooks don't fire for real users).
 * Called by cron every 2 minutes.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'lead4producers-poll-2026')) {
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

        // Force-assign bypass (temporário enquanto Meta não libera produção)
        const forceEmail = (process.env.FORCE_ASSIGN_TO_EMAIL || '').trim()
        let buyer: any = null
        if (forceEmail) {
          buyer = await forceAssign(supabase, newLead, forceEmail)
        }
        if (!buyer) {
          buyer = await distributeLeadToNextBuyer(newLead)
        }
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
