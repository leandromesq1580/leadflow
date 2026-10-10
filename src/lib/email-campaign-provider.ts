import { CampaignConfiguration, CampaignProvider } from './email-campaigns'
// All outbound requests target the fixed provider host, with a bounded timeout.
export function campaignProvider(config:CampaignConfiguration):CampaignProvider {
  const headers={Authorization:`Bearer ${config.key}`,'Content-Type':'application/json'}
  return {
    async verifyDomain(domain){
      let after=''
      const signal=AbortSignal.timeout(12000)
      for(let page=0;page<10;page++){
        const r=await fetch('https://api.resend.com/domains?limit=100'+(after?'&after='+encodeURIComponent(after):''),{headers,cache:'no-store',signal})
        if(!r.ok)return false
        const data=await r.json()
        if(!Array.isArray(data.data))return false
        if(data.data.some((d:{name:string;status:string})=>d.name?.toLowerCase()===domain&&d.status==='verified'))return true
        if(!data.has_more||!data.data.at(-1)?.id)return false
        after=data.data.at(-1).id
      }
      return false
    },
    async send(payload,options){
      const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{...headers,'Idempotency-Key':options.idempotencyKey},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)})
      if(r.ok){const data=await r.json();return {data:typeof data.id==='string'?{id:data.id}:null,error:null}}
      // HTTP 4xx proves this request was rejected; never retry it automatically.
      return {data:null,error:{name:r.status>=400&&r.status<500?'validation_error':'internal_server_error'}}
    },
  }
}
