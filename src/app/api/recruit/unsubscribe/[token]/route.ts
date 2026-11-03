import { createAdminClient } from '@/lib/supabase/admin'
import { createCampaignUnsubscribe } from '@/lib/email-campaign-public'
export const dynamic = 'force-dynamic'
// Descadastro do recrutamento (GET só mostra a confirmação; o POST descadastra de fato).
const handler = createCampaignUnsubscribe({ db: createAdminClient, rpc: 'rc_unsubscribe' })
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) { return handler(request, (await params).token) }
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) { return handler(request, (await params).token) }
