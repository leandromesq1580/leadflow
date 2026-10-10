import { createHash, timingSafeEqual } from 'node:crypto'
import { CAMPAIGN_UUID, CampaignConfiguration, CampaignDb, CampaignProvider, campaignRpc, dispatchCampaigns } from './email-campaigns'
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}})
export function createCampaignCron(deps:{secret:()=>string|undefined;runtime:()=>{db:CampaignDb;provider:CampaignProvider;config:CampaignConfiguration}}){
 return async(request:Request)=>{
  const secret=(deps.secret()||'').trim();if(!secret)return json({error:'Agendador não configurado.'},503)
  const hash=(s:string)=>createHash('sha256').update(s).digest()
  if(!timingSafeEqual(hash(request.headers.get('authorization')||''),hash('Bearer '+secret)))return json({error:'Não autorizado.'},401)
  try{const {db,provider,config}=deps.runtime();return json(await dispatchCampaigns(db,provider,config))}
  catch{return json({error:'Processamento interrompido. Resultados incertos não serão reenviados.'},503)}
 }
}
const events=new Set(['email.sent','email.delivered','email.opened','email.clicked','email.bounced','email.complained','email.failed','email.suppressed'])
export function createCampaignWebhook(deps:{secret:()=>string|undefined;verify:(payload:string,headers:{id:string;timestamp:string;signature:string},secret:string)=>{type:string;data?:{email_id?:string;tags?:Record<string,string>};created_at?:string};db:()=>CampaignDb}){
 return async(request:Request)=>{
  const secret=(deps.secret()||'').trim();if(!secret)return json({error:'Retornos não configurados.'},503)
  const headers={id:request.headers.get('svix-id')||'',timestamp:request.headers.get('svix-timestamp')||'',signature:request.headers.get('svix-signature')||''}
  let event:ReturnType<typeof deps.verify>
  try{
   const raw=await request.text();if(raw.length>25000)return json({error:'Pedido muito grande.'},413)
   event=deps.verify(raw,headers,secret)
  }catch{return json({error:'Assinatura inválida.'},401)}
  if(!events.has(event.type)||event.data?.tags?.module!=='admin_insurance_campaigns'||!CAMPAIGN_UUID.test(event.data?.tags?.recipient||''))return json({ignored:true})
  const provider=event.data?.email_id,at=event.created_at
  if(!headers.id||headers.id.length>200||!provider||provider.length>128||!at||!Number.isFinite(Date.parse(at)))return json({error:'Evento inválido.'},400)
  try{await campaignRpc(deps.db(),'ec_event',{p_event:headers.id,p_provider:provider,p_kind:event.type,p_at:at,p_recipient:event.data!.tags!.recipient});return json({received:true})}
  catch{return json({error:'Falha ao registrar retorno.'},503)}
 }
}
function unsubscribePage(token:string,done=false,status=200){
 const title=done?'Recebimento cancelado · Suscripción cancelada':'Cancelar recebimento · Cancelar suscripción'
 const body=done?'<p>Você não receberá novas campanhas de e-mail da Lead4Pro. / No recibirás nuevas campañas de correo de Lead4Pro.</p>':'<p>Confirme para parar de receber campanhas de e-mail da Lead4Pro.<br/>Confirma para dejar de recibir campañas de correo de Lead4Pro.</p><form method="post" action="/api/email-campaigns/unsubscribe/'+token+'"><input type="hidden" name="confirm" value="1"/><button>Confirmar / Confirmar</button></form>'
 return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title><style>body{font:16px/1.6 Arial,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:32px}main{max-width:560px;margin:8vh auto;background:white;border:1px solid #e2e8f0;border-radius:16px;padding:32px}h1{font-size:24px}button{background:#059669;color:white;border:0;padding:12px 24px;border-radius:8px;cursor:pointer}</style><main><h1>${title}</h1>${body}</main></html>`,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'}})
}
export function createCampaignUnsubscribe(deps:{db:()=>CampaignDb}){
 return async(request:Request,token:string)=>{
  if(!CAMPAIGN_UUID.test(token))return new Response('Link inválido.',{status:404})
  // Link scanners and mailbox prefetches MUST NOT unsubscribe on GET.
  if(request.method==='GET')return unsubscribePage(token)
  if(request.method!=='POST')return new Response('Método inválido.',{status:405})
  const raw=await request.text();if(raw.length>200)return new Response('Pedido inválido.',{status:400})
  const form=new URLSearchParams(raw)
  if(form.get('List-Unsubscribe')!=='One-Click'&&form.get('confirm')!=='1')return new Response('Confirmação necessária.',{status:400})
  try{const done=await campaignRpc(deps.db(),'ec_unsubscribe',{p_token:token});return done?unsubscribePage(token,true):new Response('Link inválido.',{status:404})}
  catch{return new Response('Não foi possível cancelar agora. Tente novamente. / Inténtalo de nuevo.',{status:503})}
 }
}
