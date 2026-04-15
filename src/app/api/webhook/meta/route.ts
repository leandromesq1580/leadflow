import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributeLeadToNextBuyer } from '@/lib/distribute'

/**
 * GET /api/webhook/meta — Verification
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  const expectedToken = (process.env.META_VERIFY_TOKEN || 'leadflow_verify_2026').trim()

  if (mode === 'subscribe' && token === expectedToken) {
    return new Response(challenge || 'ok', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }

  if (url.searchParams.has('debug')) {
    const p: Record<string, string> = {}
    url.searchParams.forEach((v, k) => { p[k] = v })
    return Response.json({ params: p, tokenMatch: token === expectedToken })
  }

  return new Response('OK', { status: 200 })
}

/**
 * Fetch lead data from Meta Graph API using leadgen_id
 */
async function fetchLeadFromMeta(leadgenId: string): Promise<{
  name: string; email: string; phone: string; city: string; state: string; interest: string
} | null> {
  const pageToken = process.env.META_PAGE_TOKEN
  if (!pageToken) {
    console.error('[Meta] No META_PAGE_TOKEN configured')
    return null
  }

  try {
    const resp = await fetch(
      `https://graph.facebook.com/v25.0/${leadgenId}?access_token=${pageToken}`
    )
    const data = await resp.json()

    if (data.error) {
      console.error('[Meta] Graph API error:', data.error.message)
      return null
    }

    // Parse field_data from Graph API response
    const fields = data.field_data || []
    const getField = (name: string): string => {
      const field = fields.find((f: { name: string; values: string[] }) =>
        f.name.toLowerCase().includes(name.toLowerCase())
      )
      return field?.values?.[0] || ''
    }

    return {
      name: getField('full_name') || getField('name') || 'Lead Meta',
      email: getField('email') || '',
      phone: getField('phone') || getField('phone_number') || '',
      city: getField('city') || getField('cidade') || '',
      state: getField('state') || getField('estado') || '',
      interest: getField('interest') || getField('interesse') || 'Seguro de vida',
    }
  } catch (err) {
    console.error('[Meta] Failed to fetch lead:', err)
    return null
  }
}

/**
 * POST /api/webhook/meta — Receive lead events
 * Meta sends: { entry: [{ changes: [{ value: { leadgen_id, page_id, form_id } }] }] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('[Meta Webhook] POST received:', JSON.stringify(body).slice(0, 500))

    // Always respond 200 quickly (Meta requires fast response)
    const entry = body.entry?.[0]
    if (!entry) {
      console.log('[Meta Webhook] No entry in payload')
      return NextResponse.json({ status: 'ok' })
    }

    const changes = entry.changes?.[0]
    const value = changes?.value || {}
    const leadgenId = value.leadgen_id || value.leadgen_id?.toString()

    if (!leadgenId) {
      console.log('[Meta Webhook] No leadgen_id found')
      return NextResponse.json({ status: 'ok' })
    }

    console.log(`[Meta Webhook] Lead event: leadgen_id=${leadgenId}`)

    const supabase = createAdminClient()

    // Check for duplicate
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('meta_lead_id', leadgenId)
      .single()

    if (existing) {
      console.log(`[Meta Webhook] Duplicate ${leadgenId}`)
      return NextResponse.json({ status: 'duplicate' })
    }

    // Fetch full lead data from Meta Graph API
    const leadData = await fetchLeadFromMeta(leadgenId)

    // Fallback: parse field_data from webhook body (for tests or when Graph API fails)
    const fieldData = value.field_data as Array<{ name: string; values: string[] }> | undefined
    const getField = (name: string): string => {
      if (!fieldData) return ''
      const field = fieldData.find(f => f.name.toLowerCase().includes(name.toLowerCase()))
      return field?.values?.[0] || ''
    }

    const finalName = leadData?.name || getField('full_name') || getField('name') || 'Lead Meta'
    const finalEmail = leadData?.email || getField('email') || ''
    const finalPhone = leadData?.phone || getField('phone') || getField('phone_number') || ''
    const finalCity = leadData?.city || getField('city') || ''
    const finalState = leadData?.state || getField('state') || ''
    const finalInterest = leadData?.interest || getField('interest') || 'Seguro de vida'

    // Save lead
    const { data: newLead, error } = await supabase
      .from('leads')
      .insert({
        meta_lead_id: leadgenId,
        name: finalName,
        email: finalEmail,
        phone: finalPhone,
        city: finalCity,
        state: finalState,
        interest: finalInterest,
        campaign_name: 'Meta Lead Ads',
        form_name: value.form_id?.toString() || '',
        raw_data: body,
        type: 'hot',
        status: 'new',
        product_type: 'lead',
      })
      .select()
      .single()

    if (error || !newLead) {
      console.error('[Meta Webhook] Save failed:', error)
      return NextResponse.json({ error: 'Save failed' }, { status: 500 })
    }

    console.log(`[Meta Webhook] Lead saved: ${newLead.id} - ${leadData?.name}`)

    // Distribute
    const buyer = await distributeLeadToNextBuyer(newLead)
    if (buyer) {
      console.log(`[Meta Webhook] Distributed to ${buyer.name}`)
    }

    return NextResponse.json({ status: 'ok', lead_id: newLead.id })
  } catch (error) {
    console.error('[Meta Webhook] Error:', error)
    return NextResponse.json({ status: 'ok' }) // Always 200 for Meta
  }
}
