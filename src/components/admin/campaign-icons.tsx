import type { SVGProps } from 'react'
type Props=Omit<SVGProps<SVGSVGElement>,'name'>&{size?:number}
const paths={Mail:<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,Plus:<path d="M12 5v14M5 12h14"/>,ArrowLeft:<path d="m12 5-7 7 7 7M5 12h14"/>,RefreshCw:<><path d="M20 7v5h-5M4 17v-5h5"/><path d="M7 5a8 8 0 0 1 13 7M17 19A8 8 0 0 1 4 12"/></>,CheckCircle2:<><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>,AlertCircle:<><circle cx="12" cy="12" r="9"/><path d="M12 8v5m0 3h.01"/></>,Pause:<><path d="M8 5v14M16 5v14"/></>,Play:<path d="m8 5 11 7-11 7Z"/>,Ban:<><circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/></>,Eye:<><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7"/><circle cx="12" cy="12" r="3"/></>,ChevronDown:<path d="m6 9 6 6 6-6"/>}
function Icon({name,size=24,...props}:Props&{name:keyof typeof paths}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>}
export const Mail=(p:Props)=><Icon name="Mail" {...p}/>
export const Plus=(p:Props)=><Icon name="Plus" {...p}/>
export const ArrowLeft=(p:Props)=><Icon name="ArrowLeft" {...p}/>
export const RefreshCw=(p:Props)=><Icon name="RefreshCw" {...p}/>
export const CheckCircle2=(p:Props)=><Icon name="CheckCircle2" {...p}/>
export const AlertCircle=(p:Props)=><Icon name="AlertCircle" {...p}/>
export const Pause=(p:Props)=><Icon name="Pause" {...p}/>
export const Play=(p:Props)=><Icon name="Play" {...p}/>
export const Ban=(p:Props)=><Icon name="Ban" {...p}/>
export const Eye=(p:Props)=><Icon name="Eye" {...p}/>
export const ChevronDown=(p:Props)=><Icon name="ChevronDown" {...p}/>
