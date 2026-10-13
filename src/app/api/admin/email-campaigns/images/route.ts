import {createServerSupabase} from '@/lib/supabase/server'
import {createAdminClient} from '@/lib/supabase/admin'
import {authenticateCampaignAdmin,type CampaignBuyerQuery} from '@/lib/email-campaign-auth'
import {createCampaignImageHandler} from '@/lib/email-campaign-images'
export const dynamic='force-dynamic'
export const maxDuration=30
export const POST=createCampaignImageHandler({
 async authenticate(){const session=await createServerSupabase();return authenticateCampaignAdmin({getUser:()=>session.auth.getUser(),buyers:()=>createAdminClient().from('buyers') as unknown as CampaignBuyerQuery})},
 async upload({bucket,path,bytes,mime,upsert}){
  const storage=createAdminClient().storage.from(bucket)
  const {error}=await storage.upload(path,bytes,{contentType:mime,upsert,cacheControl:'31536000'})
  if(error)throw new Error('campaign_image_upload_failed')
  return{url:storage.getPublicUrl(path).data.publicUrl}
 },
})
