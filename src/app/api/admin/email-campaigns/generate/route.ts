import {createServerSupabase} from '@/lib/supabase/server'
import {createAdminClient} from '@/lib/supabase/admin'
import {authenticateCampaignAdmin,type CampaignBuyerQuery} from '@/lib/email-campaign-auth'
import {createCampaignAIHandler} from '@/lib/email-campaign-ai-api'
export const maxDuration=30
export const POST=createCampaignAIHandler({
  async authenticate(){
    const session=await createServerSupabase()
    return authenticateCampaignAdmin({getUser:()=>session.auth.getUser(),buyers:()=>createAdminClient().from('buyers') as unknown as CampaignBuyerQuery})
  },
})
