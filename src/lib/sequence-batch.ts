import type { BridgeConfig } from './wa-bridge'

export class SequenceWaiting extends Error {
  constructor() { super('sequence_waiting') }
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
    const phone=canonicalSender(status.phone)
    if (bridge.phone && canonicalSender(bridge.phone)!==phone) throw new SequenceWaiting()
    return {...bridge,phone}
  } catch {
    // Do not retain raw network/body errors, which may contain private details.
    throw new SequenceWaiting()
  }
}
