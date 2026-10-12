import {CampaignAIError,generateCampaignCopy,parseCampaignAIInput,type CampaignAICopy} from './email-campaign-ai'
interface Dependencies {
  authenticate:(request:Request)=>Promise<{id:string}|Response>
  generate?:(input:unknown)=>Promise<CampaignAICopy>
}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}})
async function readInput(request:Request):Promise<unknown> {
  if (request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json' || !request.body) throw new CampaignAIError('input')
  const reader=request.body.getReader(),chunks:Uint8Array[]=[]
  let total=0
  try {
    while (true) {
      const {done,value}=await reader.read()
      if (done) break
      total+=value.length
      if (total>16384) { await reader.cancel();throw new CampaignAIError('input') }
      chunks.push(value)
    }
    const bytes=new Uint8Array(total)
    let offset=0
    for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
  } catch { throw new CampaignAIError('input') } finally { reader.releaseLock() }
}
export function createCampaignAIHandler(deps:Dependencies) {
  // Best-effort per-instance burst guard, not a global spending quota across serverless instances.
  const bursts=new Map<string,{start:number;count:number}>()
  return async(request:Request):Promise<Response>=>{
    const origin=request.headers.get('Origin')
    if (origin && origin!==new URL(request.url).origin) return json({error:'Origem não autorizada.'},403)
    const actor=await deps.authenticate(request)
    if (actor instanceof Response) return actor
    try {
      const input=await readInput(request)
      parseCampaignAIInput(input)
      const now=Date.now()
      for(const [id,row] of bursts) if(now-row.start>=60000) bursts.delete(id)
      const row=bursts.get(actor.id)??{start:now,count:0}
      if (row.count>=6) return json({error:'Você já gerou várias sugestões. Aguarde um minuto antes de tentar novamente.'},429)
      row.count++;bursts.set(actor.id,row)
      const copy=await (deps.generate??generateCampaignCopy)(input)
      return json({copy})
    } catch(error) {
      const safe=error instanceof CampaignAIError?error:new CampaignAIError('provider')
      const status=safe.code==='input'?400:safe.code==='unavailable'?503:safe.code==='rate_limit'?429:safe.code==='timeout'?504:502
      return json({error:safe.message,code:safe.code},status)
    }
  }
}
