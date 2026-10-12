import {randomUUID} from 'node:crypto'
export const CAMPAIGN_IMAGE_BUCKET='campaign-images'
export const CAMPAIGN_IMAGE_LIMIT=3*1024*1024
const types:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}
type Upload={bucket:string;path:string;bytes:Uint8Array;mime:string;upsert:false}
type Dependencies={authenticate:()=>Promise<{id:string}|Response>;upload:(input:Upload)=>Promise<{url:string}>}
function matchesImage(bytes:Buffer,mime:string){
 if(mime==='image/png')return bytes.length>=33&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR'&&bytes.toString('ascii',bytes.length-8,bytes.length-4)==='IEND'
 if(mime==='image/jpeg')return bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217
 if(mime==='image/webp')return bytes.length>=20&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'&&bytes.readUInt32LE(4)+8===bytes.length
 if(mime==='image/gif')return bytes.length>=14&&['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6))&&bytes[bytes.length-1]===59
 return false
}
export function createCampaignImageHandler(deps:Dependencies){return async(request:Request)=>{
 const actor=await deps.authenticate();if(actor instanceof Response)return actor
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Origem não autorizada.'},{status:403})
 if(Number(request.headers.get('content-length'))>CAMPAIGN_IMAGE_LIMIT+65536)return Response.json({error:'Use uma imagem de até 3 MB.'},{status:413})
 try{
  const form=await request.formData(),file=form.get('image')
  if(!(file instanceof File)||file.size===0||file.size>CAMPAIGN_IMAGE_LIMIT||!types[file.type])return Response.json({error:'Use JPG, PNG, WEBP ou GIF de até 3 MB.'},{status:400})
  const bytes=Buffer.from(await file.arrayBuffer())
  if(!matchesImage(bytes,file.type))return Response.json({error:'O arquivo não é uma imagem válida no formato informado.'},{status:400})
  const path=`${actor.id}/${randomUUID()}.${types[file.type]}`
  const result=await deps.upload({bucket:CAMPAIGN_IMAGE_BUCKET,path,bytes,mime:file.type,upsert:false})
  const url=new URL(result.url);if(url.protocol!=='https:'||url.username||url.password)throw new Error('unsafe_storage_url')
  return Response.json({url:result.url},{headers:{'Cache-Control':'no-store'}})
 }catch{return Response.json({error:'Não foi possível carregar a imagem. Tente novamente; nenhum e-mail foi enviado.'},{status:503})}
}}
