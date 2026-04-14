import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseMetaWebhook } from '@/lib/meta'
import { distributeLeadToNextBuyer } from '@/lib/distribute'

/**
 * GET /api/webhook/meta
 * Meta Webhook verification (required for setup)
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  const expectedToken = process.env.META_VERIFY_TOKEN || 'leadflow_verify_2026'

  // Always log for debugging
  console.log('[Meta Webhook GET]', { mode, tokenMatch: token === expectedToken, challenge: challenge?.slice(0, 20) })

  // Meta verification: return challenge as plain text
  if (mode === 'subscribe' && token === expectedToken) {
    return new Response(challenge || 'ok', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }

  // Debug endpoint
  if (url.searchParams.has('debug')) {
    const p: Record<string, string> = {}
    url.searchParams.forEach((v, k) => { p[k] = v })
    return Response.json({ params: p, tokenMatch: token === expectedToken })
  }

  // If we got hub params but they didn't match, show why
  if (mode || token) {
    return Response.json({
      error: 'Verification failed',
      received_mode: mode,
      received_token: token?.slice(0, 10) + '...',
      expected_token: expectedToken.slice(0, 10) + '...',
      match: token === expectedToken,
    }, { status: 403 })
  }

  return new Response('OK', { status: 200 })
}

/**
 * POST /api/webhook/meta
 * Receive new leads from Meta Lead Ads
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Parse the Meta webhook payload
    const leadData = parseMetaWebhook(body)
    if (!leadData) {
      console.error('[Meta Webhook] Failed to parse payload:', JSON.stringify(body).slice(0, 500))
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    console.log(`[Meta Webhook] New lead: ${leadData.name} (${leadData.phone})`)

    const supabase = createAdminClient()

    // Check for duplicate (meta_lead_id)
    if (leadData.meta_lead_id) {
      const { data: existing } = await supabase
        .from('leads')
        .select('id')
        .eq('meta_lead_id', leadData.meta_lead_id)
        .single()

      if (existing) {
        console.log(`[Meta Webhook] Duplicate lead ${leadData.meta_lead_id}, skipping`)
        return NextResponse.json({ status: 'duplicate' })
      }
    }

    // Determine product type based on distribution settings
    // For now, default to 'lead' — admin can change in settings
    const productType = 'lead'

    // Save lead to database
    const { data: newLead, error } = await supabase
      .from('leads')
      .insert({
        meta_lead_id: leadData.meta_lead_id || null,
        name: leadData.name,
        email: leadData.email,
        phone: leadData.phone,
        city: leadData.city,
        state: leadData.state,
        interest: leadData.interest,
        campaign_name: leadData.campaign_name,
        form_name: leadData.form_name,
        raw_data: leadData.raw_data,
        type: 'hot',
        status: 'new',
        product_type: productType,
      })
      .select()
      .single()

    if (error || !newLead) {
      console.error('[Meta Webhook] Failed to save lead:', error)
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
    }

    // Auto-distribute if product_type is 'lead'
    if (productType === 'lead') {
      const assignedBuyer = await distributeLeadToNextBuyer(newLead)
      if (assignedBuyer) {
        console.log(`[Meta Webhook] Lead distributed to ${assignedBuyer.name}`)
      } else {
        console.log('[Meta Webhook] No eligible buyers — lead queued')
      }
    }

    return NextResponse.json({ status: 'ok', lead_id: newLead.id })
  } catch (error) {
    console.error('[Meta Webhook] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
