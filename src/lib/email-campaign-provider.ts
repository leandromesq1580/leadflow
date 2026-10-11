import { CampaignConfiguration, CampaignProvider, TrackingStatus, trackingUnknown } from './email-campaigns'
const HOSTNAME=/^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?)*$/
const hostname=(v:unknown)=>{const s=typeof v==='string'?v.trim().toLowerCase().replace(/\.$/,''):'';return s.length>0&&s.length<=253&&HOSTNAME.test(s)?s:null}
// Resend keeps open/click tracking inactive until the Tracking CNAME for the tracking subdomain is verified; the booleans alone are
// a wish, not a fact. Opens/clicks are reported effective only when domain, sending status, subdomain and the verified CNAME all agree.
// Output carries no record names/values: just the effective flags and an allowlisted issue.
export function effectiveTracking(domain:string,detail:unknown):TrackingStatus {
  const checked_at=new Date().toISOString()
  if(!detail||typeof detail!=='object')return {...trackingUnknown(),issue:'incomplete_response'}
  const d=detail as Record<string,unknown>
  const name=hostname(d.name),wanted=hostname(domain)
  if(!name||!wanted||typeof d.status!=='string')return {...trackingUnknown(),issue:'incomplete_response'}
  if(name!==wanted)return {open:null,click:null,status:'not_verified',checked_at,issue:'domain_mismatch'}
  const flag=(v:unknown)=>typeof v==='boolean'?v:null
  const open=flag(d.open_tracking),click=flag(d.click_tracking)
  if(!Array.isArray(d.records))return {open:open===null?null:false,click:click===null?null:false,status:'not_verified',checked_at,issue:'incomplete_response'}
  const sub=hostname(d.tracking_subdomain)
  // The record name may be relative ("track") or absolute ("track.example.invalid"); the subdomain may be either as well.
  const relative=sub?.endsWith('.'+name)?sub.slice(0,-(name.length+1)):sub
  const coherent=new Set(sub&&relative?[sub,relative,relative+'.'+name]:[])
  const dnsVerified=Boolean(sub)&&d.records.some(r=>r&&typeof r==='object'&&(r as Record<string,unknown>).record==='Tracking'&&(r as Record<string,unknown>).type==='CNAME'&&(r as Record<string,unknown>).status==='verified'&&coherent.has(hostname((r as Record<string,unknown>).name)||''))
  if(d.status!=='verified'||!dnsVerified)return {open:open===null?null:false,click:click===null?null:false,status:'not_verified',checked_at,...(d.status==='verified'?{issue:'tracking_dns_not_verified' as const}:{})}
  return {open,click,status:'verified',checked_at}
}
// All outbound requests target the fixed provider host, with a bounded timeout.
export function campaignProvider(config:CampaignConfiguration):CampaignProvider {
  const headers={Authorization:`Bearer ${config.key}`,'Content-Type':'application/json'}
  // Read-only, paginated domain lookup. Returns null when the provider cannot be read.
  async function findDomain(domain:string,signal:AbortSignal):Promise<{id:string;name:string;status:string}|null|undefined>{
    let after=''
    for(let page=0;page<10;page++){
      const r=await fetch('https://api.resend.com/domains?limit=100'+(after?'&after='+encodeURIComponent(after):''),{headers,cache:'no-store',signal})
      if(!r.ok)return undefined
      const data=await r.json()
      if(!Array.isArray(data.data))return undefined
      const found=data.data.find((d:{name?:string})=>d.name?.toLowerCase()===domain)
      if(found)return found
      if(!data.has_more||!data.data.at(-1)?.id)return null
      after=data.data.at(-1).id
    }
    return undefined
  }
  return {
    async verifyDomain(domain){
      try{const d=await findDomain(domain,AbortSignal.timeout(12000));return d?.status==='verified'}catch{return false}
    },
    async trackingStatus(domain){
      // Never throws and never includes provider payloads or errors: the caller treats "unknown" as blocking.
      try{
        const signal=AbortSignal.timeout(12000)
        const d=await findDomain(domain,signal)
        if(d===undefined)return trackingUnknown()
        if(d===null)return {...trackingUnknown(),status:'not_found'}
        const r=await fetch('https://api.resend.com/domains/'+encodeURIComponent(d.id),{headers,cache:'no-store',signal})
        if(!r.ok)return trackingUnknown()
        return effectiveTracking(domain,await r.json())
      }catch{return trackingUnknown()}
    },
    async send(payload,options){
      const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{...headers,'Idempotency-Key':options.idempotencyKey},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)})
      if(r.ok){const data=await r.json();return {data:typeof data.id==='string'?{id:data.id}:null,error:null}}
      // HTTP 4xx proves this request was rejected; never retry it automatically.
      return {data:null,error:{name:r.status>=400&&r.status<500?'validation_error':'internal_server_error'}}
    },
  }
}
