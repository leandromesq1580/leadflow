import { dispatchEquipeNotifications } from '@/lib/equipe-notifications'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
export async function GET(req: Request) {
 if(!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return Response.json({error:'unauthorized'},{status:401})
 try { await dispatchEquipeNotifications(); return Response.json({ok:true}) }
 catch { return Response.json({error:'unavailable'},{status:503}) }
}
