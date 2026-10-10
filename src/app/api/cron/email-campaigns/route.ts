import { createAdminClient } from '@/lib/supabase/admin'
import { createCampaignCron } from '@/lib/email-campaign-public'
import { campaignConfiguration } from '@/lib/email-campaigns'
import { campaignProvider } from '@/lib/email-campaign-provider'
export const dynamic='force-dynamic'
export const maxDuration=60
export const GET=createCampaignCron({secret:()=>process.env.CRON_SECRET,runtime(){const config=campaignConfiguration(process.env);return {config,db:createAdminClient(),provider:campaignProvider(config)}}})
