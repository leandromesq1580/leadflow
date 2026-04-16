import { NextRequest, NextResponse } from 'next/server'

const AD_ACCOUNT_ID = 'act_2374409502997954'
const LEAD_PRICE = 22 // selling price per lead

/**
 * GET /api/admin/ads-insights — Fetch Meta Ads campaign data
 * ?period=last_7d|last_30d|last_90d|today
 * ?level=campaign|adset|ad
 * ?breakdown=region
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const period = url.searchParams.get('period') || 'last_7d'
  const level = url.searchParams.get('level') || 'campaign'
  const breakdown = url.searchParams.get('breakdown') || ''

  const token = (process.env.META_PAGE_TOKEN || '').trim().replace(/\\n/g, '')
  if (!token) return NextResponse.json({ error: 'No META_PAGE_TOKEN' }, { status: 500 })

  const baseFields = 'spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type'
  const levelFields = breakdown
    ? baseFields  // breakdowns don't use level-specific fields
    : level === 'ad' ? `${baseFields},campaign_name,adset_name,ad_name,ad_id`
    : level === 'adset' ? `${baseFields},campaign_name,adset_name,adset_id`
    : `${baseFields},campaign_name,campaign_id`

  const params = new URLSearchParams({
    fields: levelFields,
    date_preset: period,
    limit: '100',
    access_token: token,
  })

  if (breakdown) {
    params.set('breakdowns', breakdown)
  } else {
    params.set('level', level)
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v25.0/${AD_ACCOUNT_ID}/insights?${params}`,
      { next: { revalidate: 300 } } // cache 5 min
    )
    const raw = await res.json()

    if (raw.error) {
      return NextResponse.json({ error: raw.error.message }, { status: 400 })
    }

    // Process rows
    const rows = (raw.data || []).map((row: any) => {
      const spend = parseFloat(row.spend || '0')
      const impressions = parseInt(row.impressions || '0')
      const clicks = parseInt(row.clicks || '0')
      const ctr = parseFloat(row.ctr || '0')
      const cpc = parseFloat(row.cpc || '0')

      // Extract lead count and CPL
      // 'lead' is the canonical type but region breakdown only has 'onsite_conversion.lead_grouped'
      let leads = 0
      let cpl = 0
      for (const a of row.actions || []) {
        if (a.action_type === 'lead' || (leads === 0 && a.action_type === 'onsite_conversion.lead_grouped')) {
          leads = parseInt(a.value || '0')
        }
      }
      for (const c of row.cost_per_action_type || []) {
        if (c.action_type === 'lead' || (cpl === 0 && c.action_type === 'onsite_conversion.lead_grouped')) {
          cpl = parseFloat(c.value || '0')
        }
      }

      const revenue = leads * LEAD_PRICE
      const margin = revenue - spend
      const roi = spend > 0 ? revenue / spend : 0

      return {
        name: row.ad_name || row.adset_name || row.campaign_name || row.region || 'Total',
        campaign_name: row.campaign_name || '',
        adset_name: row.adset_name || '',
        ad_name: row.ad_name || '',
        region: row.region || '',
        spend,
        impressions,
        clicks,
        ctr: Math.round(ctr * 100) / 100,
        cpc: Math.round(cpc * 100) / 100,
        leads,
        cpl: Math.round(cpl * 100) / 100,
        revenue,
        margin,
        roi: Math.round(roi * 100) / 100,
      }
    })

    // Totals
    const totals = {
      spend: rows.reduce((s: number, r: any) => s + r.spend, 0),
      impressions: rows.reduce((s: number, r: any) => s + r.impressions, 0),
      clicks: rows.reduce((s: number, r: any) => s + r.clicks, 0),
      leads: rows.reduce((s: number, r: any) => s + r.leads, 0),
      revenue: 0,
      margin: 0,
      cpl: 0,
      roi: 0,
    }
    totals.revenue = totals.leads * LEAD_PRICE
    totals.margin = totals.revenue - totals.spend
    totals.cpl = totals.leads > 0 ? totals.spend / totals.leads : 0
    totals.roi = totals.spend > 0 ? totals.revenue / totals.spend : 0

    return NextResponse.json({ rows, totals, period, level: breakdown || level })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
