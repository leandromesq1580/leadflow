import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCampaignHandlers } from '@/lib/email-campaign-api'
import { authenticateCampaignAdmin, type CampaignBuyerQuery } from '@/lib/email-campaign-auth'
import { campaignConfiguration } from '@/lib/email-campaigns'
import { campaignProvider } from '@/lib/email-campaign-provider'
export const dynamic='force-dynamic'
export const maxDuration=60
const handlers=createCampaignHandlers({
  async authenticate(){
    const session=await createServerSupabase()
    return authenticateCampaignAdmin({getUser:()=>session.auth.getUser(),buyers:()=>createAdminClient().from('buyers') as unknown as CampaignBuyerQuery})
  },
  runtime(){const config=campaignConfiguration(process.env);return {config,db:createAdminClient(),provider:campaignProvider(config)}}
})
export const GET=handlers.GET
export const POST=handlers.POST
