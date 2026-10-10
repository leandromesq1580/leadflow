import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCampaignWebhook } from '@/lib/email-campaign-public'
export const dynamic='force-dynamic'
export const POST=createCampaignWebhook({secret:()=>process.env.EMAIL_CAMPAIGN_WEBHOOK_SECRET,db:createAdminClient,
 verify(payload,headers,webhookSecret){const event=new Resend(process.env.RESEND_API_KEY).webhooks.verify({payload,headers,webhookSecret});const data=event.data as {email_id?:unknown;tags?:Record<string,string>};return {type:event.type,created_at:event.created_at,data:typeof data.email_id==='string'?{email_id:data.email_id,tags:data.tags}:undefined}}
})
