import type { BridgeConfig } from './wa-bridge'

export class SequenceWaiting extends Error {
  constructor() { super('sequence_waiting') }
}
/** Only raised after the dedicated rejection RPC has acknowledged settlement. */
export class SequenceRejectedSettled extends Error {
  constructor() { super('send_rejected_before_send') }
}
type SequenceOperation = { id:string; lease_token:string; current_step:number; enrolled_at?:string }
type SequenceProof = { version:2; operation_id:string; sender:string; outcome:'rejected_before_send'; code:string }
type SequenceSendResult = { outcome:'confirmed'; id:string } | { outcome:'rejected_before_send'; proof:SequenceProof } | { outcome:'unknown' }
const rejectionStatus:Record<string,number> = { bridge_not_ready:503, recipient_unavailable:404, invalid_payload:400 }

/** HTTP status/error text alone is NEVER evidence of non-invocation. */
export function classifySequenceSend(value:unknown,status:number,operation:string,sender:string):SequenceSendResult {
  if (!value || typeof value!=='object') return {outcome:'unknown'}
  const r=value as Record<string,unknown>
  if (!r.sequence || typeof r.sequence!=='object') return {outcome:'unknown'}
  const c=r.sequence as Record<string,unknown>
  if(c.version!==2 || c.operation_id!==operation || c.sender!==sender) return {outcome:'unknown'}
  if(c.outcome==='confirmed' && status===200 && r.success===true && typeof r.id==='string' && r.id.length>0 && r.id.length<=512 && !/\s/.test(r.id)) return {outcome:'confirmed',id:r.id}
  if(c.outcome==='rejected_before_send' && r.success===false && r.id===null && typeof c.code==='string' && Object.hasOwn(rejectionStatus,c.code) && rejectionStatus[c.code]===status) {
    return {outcome:'rejected_before_send',proof:{version:2,operation_id:operation,sender,outcome:'rejected_before_send',code:c.code}}
  }
  return {outcome:'unknown'}
}

/** One POST, no replay. A lost/missing rejection RPC falls back to quarantine. */
export async function sendSequenceMessage(
  bridge:BridgeConfig & {phone:string}, e:SequenceOperation, number:string, message:string,
  rpc:(name:string,args:Record<string,unknown>)=>Promise<unknown>, timeout:number,
):Promise<string> {
  const response=await fetch(`${bridge.url}/send`,{
    method:'POST',headers:{apikey:bridge.key,'Content-Type':'application/json'},signal:AbortSignal.timeout(timeout),
    body:JSON.stringify({number,message,sequence:{version:2,operation_id:e.lease_token,sender:bridge.phone}}),
  })
  const result=classifySequenceSend(await response.json(),response.status,e.lease_token,bridge.phone)
  if(result.outcome==='confirmed') return result.id
  if(result.outcome==='rejected_before_send' && e.enrolled_at && await rpc('reject_sequence_batch',{
    p_id:e.id,p_token:e.lease_token,p_cycle:e.enrolled_at,p_step:e.current_step,p_sender:bridge.phone,p_proof:result.proof,
  })===true) throw new SequenceRejectedSettled()
  throw new Error('Delivery not confirmed')
}
export function canonicalSender(value: unknown): string {
  if (typeof value !== 'string' || !/^\+?[\d ()-]+$/.test(value)) throw new SequenceWaiting()
  const phone=value.replace(/\D/g,'')
  if (!/^[1-9]\d{7,14}$/.test(phone)) throw new SequenceWaiting()
  return phone
}
/** No global fallback; identity must come from this authenticated bridge's live status. */
export async function verifiedSequenceBridge(bridge: BridgeConfig | null, request: typeof fetch = fetch): Promise<BridgeConfig & {phone:string}> {
  // Status is a pre-send availability check, never a generation attempt.
  try {
    if (!bridge) throw new SequenceWaiting()
    const response=await request(`${bridge.url}/status`,{headers:{apikey:bridge.key},signal:AbortSignal.timeout(5000)})
    if (!response.ok) throw new SequenceWaiting()
    const status=await response.json()
    if (status?.ready!==true) throw new SequenceWaiting()
    // The deployed server returns `number`. Accept older phone-only bridges,
    // but never hide an invalid primary field or a conflicting alternate identity.
    const hasNumber=Object.hasOwn(status,'number')
    const phone=canonicalSender(hasNumber ? status.number : status.phone)
    if (hasNumber && Object.hasOwn(status,'phone') && canonicalSender(status.phone)!==phone) throw new SequenceWaiting()
    if (bridge.phone!==undefined && canonicalSender(bridge.phone)!==phone) throw new SequenceWaiting()
    return {...bridge,phone}
  } catch {
    // Do not retain raw network/body errors, which may contain private details.
    throw new SequenceWaiting()
  }
}
