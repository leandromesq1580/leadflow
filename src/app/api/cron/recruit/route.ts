import { createAdminClient } from '@/lib/supabase/admin'
import { createCampaignCron } from '@/lib/email-campaign-public'
import { campaignConfiguration } from '@/lib/email-campaigns'
import { campaignProvider } from '@/lib/email-campaign-provider'
import { dispatchRecruit } from '@/lib/recruit-agents'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
// Disparo das campanhas de recrutamento (1 e-mail por vez, no máx. 10/min). Nada sai se não houver campanha AGENDADA.
export const GET = createCampaignCron({
  secret: () => process.env.CRON_SECRET,
  runtime() { const config = campaignConfiguration(process.env); return { config, db: createAdminClient(), provider: campaignProvider(config) } },
  dispatch: dispatchRecruit,
})
