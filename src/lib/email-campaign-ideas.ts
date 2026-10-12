import type {CampaignAICopy} from './email-campaign-ai'

export const CAMPAIGN_CREATIVE_ANGLES = [
  'Curiosidade honesta: uma pergunta concreta sobre o produto e algo útil para entender antes de decidir.',
  'Cotidiano: uma cena curta da rotina, uma necessidade concreta e como o produto informado pode ajudar, conforme a apólice.',
  'Objeção: a dúvida que faz adiar a decisão, com explicação simples e um primeiro passo pelo WhatsApp.',
  'Planejamento: uma escolha para o futuro, ligada ao produto, sem prometer retorno ou resultados.',
  'Mudança de fase: uma situação possível da vida que faz rever necessidades, sem atribuir essa situação ao leitor.',
  'Clareza antes da escolha: uma condição do produto que vale perguntar antes de contratar, sem aula técnica.',
] as const

/** Keep only editorial text; the application-generated contact never goes to the model. */
export function campaignCopyForHistory(copy:CampaignAICopy):CampaignAICopy {
  return {...copy,body_pt:copy.body_pt.replace(/\n\nhttps:\/\/wa\.me\/[^\s]+$/,'').trim(),body_es:copy.body_es.replace(/\n\nhttps:\/\/wa\.me\/[^\s]+$/,'').trim()}
}
const normalized=(text:string)=>text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\s]/gu,' ').replace(/\s+/g,' ').trim()
function similar(left:string,right:string) {
  const a=normalized(left),b=normalized(right)
  if(a===b)return true
  // Compare opening scenes as well as the body. A changed subject/CTA isn't a new idea.
  const opening=(text:string)=>text.split(/[.!?¿¡]/).find(s=>s.trim())?.trim()??''
  if(normalized(opening(left))===normalized(opening(right)))return true
  const grams=(text:string)=>{const words=text.split(' ');return new Set(words.slice(0,-1).map((word,index)=>word+' '+words[index+1]))}
  const x=grams(a),y=grams(b),intersection=[...x].filter(word=>y.has(word)).length
  return intersection/Math.max(1,Math.min(x.size,y.size))>=0.75
}
export function campaignCopyRepeats(copy:CampaignAICopy,previous:CampaignAICopy) {
  return (['pt','es'] as const).some(language=>similar(copy[`body_${language}`],previous[`body_${language}`]))
}
