import { createAdminClient } from '@/lib/supabase/admin'
import { createCampaignUnsubscribe } from '@/lib/email-campaign-public'
export const dynamic='force-dynamic'
const handler=createCampaignUnsubscribe({db:createAdminClient})
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){return handler(request,(await params).token)}
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){return handler(request,(await params).token)}
