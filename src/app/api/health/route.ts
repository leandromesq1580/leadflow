import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/health — Validates ALL integrations with REAL API calls.
 * Not fake. Not simulated. Each check hits the actual service.
 */
export async function GET() {
  const results: Record<string, { ok: boolean; detail: string }> = {}

  // 1. Supabase DB
  try {
    const db = createAdminClient()
    const { count, error } = await db.from('leads').select('id', { count: 'exact', head: true })
    if (error) throw error
    results['supabase'] = { ok: true, detail: `Connected. ${count} leads in DB.` }
  } catch (e: any) {
    results['supabase'] = { ok: false, detail: e.message }
  }

  // 2. Meta Graph API (validates META_PAGE_TOKEN is clean and working)
  try {
    const token = (process.env.META_PAGE_TOKEN || '').trim().replace(/\\n/g, '')
    if (!token) throw new Error('META_PAGE_TOKEN not set')
    const res = await fetch(`https://graph.facebook.com/v25.0/me?access_token=${token}`)
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)
    results['meta_graph_api'] = { ok: true, detail: `Page: ${data.name} (${data.id})` }
  } catch (e: any) {
    results['meta_graph_api'] = { ok: false, detail: e.message }
  }

  // 3. Meta Webhook Subscription (is Meta actually sending to us?)
  try {
    const appId = '1309945241037713'
    const appSecret = (process.env.META_APP_SECRET || '').trim().replace(/\\n/g, '')
    if (!appSecret) throw new Error('META_APP_SECRET not set')
    const appToken = `${appId}|${appSecret}`
    const res = await fetch(`https://graph.facebook.com/v25.0/${appId}/subscriptions?access_token=${appToken}`)
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)
    const sub = data.data?.find((s: any) => s.object === 'page')
    if (!sub) throw new Error('No page subscription found')
    if (!sub.active) throw new Error('Subscription exists but is NOT active')
    const hasLeadgen = sub.fields?.some((f: any) => f.name === 'leadgen')
    if (!hasLeadgen) throw new Error('Subscription active but leadgen field missing')
    results['meta_webhook'] = { ok: true, detail: `Active. URL: ${sub.callback_url}` }
  } catch (e: any) {
    results['meta_webhook'] = { ok: false, detail: e.message }
  }

  // 4. Distribution (are there eligible buyers with credits?)
  try {
    const db = createAdminClient()
    const { data: buyers, error } = await db.rpc('get_eligible_buyers', {
      p_product_type: 'lead',
      p_state: null,
    })
    if (error) throw error
    const uniqueBuyers = new Set((buyers || []).map((b: any) => b.id))
    const totalCredits = (buyers || []).reduce((sum: number, b: any) => sum + b.remaining, 0)
    if (uniqueBuyers.size === 0) throw new Error('NO eligible buyers with credits')
    results['distribution'] = { ok: true, detail: `${uniqueBuyers.size} buyer(s), ${totalCredits} credits remaining` }
  } catch (e: any) {
    results['distribution'] = { ok: false, detail: e.message }
  }

  // 5. WhatsApp wa-bridge
  try {
    const bridgeUrl = (process.env.WA_BRIDGE_URL || 'http://31.220.97.186:3457').replace(/\/$/, '')
    const bridgeKey = (process.env.WA_BRIDGE_KEY || 'leadflow-bridge-2026').trim()
    const res = await fetch(`${bridgeUrl}/status`, { headers: { apikey: bridgeKey } })
    const data = await res.json()
    if (!data.ready) throw new Error(`Not connected. hasQR: ${data.hasQR}`)
    results['whatsapp'] = { ok: true, detail: `Connected. Number: ${data.number}` }
  } catch (e: any) {
    results['whatsapp'] = { ok: false, detail: e.message }
  }

  // 6. Stripe
  try {
    const stripeKey = (process.env.STRIPE_SECRET_KEY || '').trim()
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY not set')
    const res = await fetch('https://api.stripe.com/v1/balance', {
      headers: { Authorization: `Bearer ${stripeKey}` },
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)
    results['stripe'] = { ok: true, detail: 'API key valid' }
  } catch (e: any) {
    results['stripe'] = { ok: false, detail: e.message }
  }

  // 7. Resend Email
  try {
    const resendKey = (process.env.RESEND_API_KEY || '').trim()
    if (!resendKey) throw new Error('RESEND_API_KEY not set')
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${resendKey}` },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    results['resend_email'] = { ok: true, detail: 'API key valid' }
  } catch (e: any) {
    results['resend_email'] = { ok: false, detail: e.message }
  }

  const allOk = Object.values(results).every(r => r.ok)

  return NextResponse.json({
    status: allOk ? 'ALL_SYSTEMS_GO' : 'ISSUES_DETECTED',
    timestamp: new Date().toISOString(),
    checks: results,
  }, { status: allOk ? 200 : 503 })
}
