import { CAMPAIGN_COPYWRITER_SYSTEM, CAMPAIGN_EDITORIAL_CLICHES, CAMPAIGN_EDITORIAL_REWRITE } from './email-campaign-copywriting'

export interface CampaignAICopy {
  name: string
  subject_pt: string
  body_pt: string
  subject_es: string
  body_es: string
}
export interface CampaignAIInput { insurance: string; theme: string; phone: string }
interface AIIO { key?: string; fetch?: typeof globalThis.fetch; timeoutMs?: number }
export type CampaignAIErrorCode = 'input' | 'unavailable' | 'rate_limit' | 'timeout' | 'provider' | 'invalid_copy'
const MESSAGES: Record<CampaignAIErrorCode,string> = {
  input:'Confira o tipo de seguro, a orientação geral e o WhatsApp com código do país. Não inclua dados de pessoas.',
  unavailable:'A geração por IA ainda não está configurada.',
  rate_limit:'A IA está recebendo muitas solicitações. Aguarde um pouco e tente novamente.',
  timeout:'A IA demorou para responder. Seu rascunho foi preservado; tente novamente.',
  provider:'Não foi possível gerar os textos agora. Seu rascunho foi preservado; tente novamente.',
  invalid_copy:'A sugestão não passou pela validação. Seu rascunho foi preservado; tente gerar outra versão.',
}
export class CampaignAIError extends Error {
  constructor(public readonly code: CampaignAIErrorCode) { super(MESSAGES[code]); this.name='CampaignAIError' }
}
const normalize = (value:string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const contacts = /(?:https?:|www\.|mailto:|@|\d{4}|\b(?:cpf|ssn|nascimento|birthdate|fecha de nacimiento)\b)/i
const attribution = /(?:\b(?:nome|nombre|name)\s*:|\b(?:se chama|se llama|chamado|chamada)\b|\b(?:ele|ela|cliente|lead|he|she|el|ella)\b.{0,50}\b(?:tem|tiene|has|ganha|gana|earns|income|renda|renta|nasceu|nascido|nacido)\b)/i
const unsafeCopy = /(?:\d|https?:|www\.|mailto:|@|[<>`]|\{\{|\b(?:cpf|ssn|garantid[oa]s?|garantizad[oa]s?|guaranteed|sem exame|sin examen|solo hoy|so hoje|ultima chance|ultimas vagas|desconto|descuento|economiz\w*|ahorr\w*)\b)/i

export function parseCampaignAIInput(value: unknown): CampaignAIInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CampaignAIError('input')
  const raw=value as Record<string,unknown>
  if (typeof raw.insurance!=='string' || typeof raw.theme!=='string' || typeof raw.phone!=='string') throw new CampaignAIError('input')
  if (raw.insurance.length>100 || raw.theme.length>500 || raw.phone.length>32 || /[\u0000-\u001f\u007f]/.test(raw.insurance+raw.phone) || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(raw.theme)) throw new CampaignAIError('input')
  const insurance=raw.insurance.trim(),theme=raw.theme.trim()
  // Explicit international number only; never guess a country or strip arbitrary characters.
  if (!insurance || !/^[\p{L}\s()/-]+$/u.test(insurance) || !/^\+?[\d ()-]+$/.test(raw.phone.trim())) throw new CampaignAIError('input')
  const phone=raw.phone.replace(/[+ ()-]/g,'')
  if (!/^[1-9]\d{7,14}$/.test(phone) || (!raw.phone.trim().startsWith('+') && !phone.startsWith('1')) || (phone.startsWith('1') && (phone.length!==11 || !/^1[2-9]\d{2}[2-9]\d{6}$/.test(phone)))) throw new CampaignAIError('input')
  const brief=normalize(insurance+' '+theme)
  if (contacts.test(brief) || attribution.test(brief)) throw new CampaignAIError('input')
  return {insurance,theme,phone}
}

const SYSTEM = CAMPAIGN_COPYWRITER_SYSTEM

function validateCopy(value:unknown,input:CampaignAIInput): CampaignAICopy {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new CampaignAIError('invalid_copy')
  const raw=value as Record<string,unknown>,result={} as CampaignAICopy
  for (const field of ['name','subject_pt','body_pt','subject_es','body_es'] as const) {
    const text=raw[field],body=field.startsWith('body_')
    if (typeof text!=='string' || text.trim().length<(body?20:3) || text.length>(body?1600:100) || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(text) || (!body && /[\r\n]/.test(text)) || unsafeCopy.test(normalize(text))) throw new CampaignAIError('invalid_copy')
    if (/^seguros?(?: geral| em geral)?$/.test(normalize(input.insurance)) && /\b(?:casa|hogar|imovel|imoveis|carro|auto|automovel|vehiculo|saude|salud|seguro de vida)\b/.test(normalize(text))) throw new CampaignAIError('invalid_copy')
    // Editorial rejection uses the same bounded retry as technical rejection.
    // Check only displayed copy, not the internal campaign name.
    const editorialText=normalize(text).replace(/\s+/g,' ')
    if (field!=='name' && CAMPAIGN_EDITORIAL_CLICHES.some(phrase=>editorialText.includes(phrase))) throw new CampaignAIError('invalid_copy')
    result[field]=text.trim()
  }
  return result
}

export async function generateCampaignCopy(value: unknown, io: AIIO = {}): Promise<CampaignAICopy> {
  const input=parseCampaignAIInput(value)
  const key=(io.key ?? process.env.OPENAI_API_KEY ?? '').trim()
  if (!key) throw new CampaignAIError('unavailable')
  const controller=new AbortController()
  let timer:ReturnType<typeof setTimeout>|undefined
  try {
    const job=async()=>{
      // One bounded rewrite on invalid output, within the SAME timeout budget.
      // Never echo refused content: it can contain private data or injected instructions.
      for(let attempt=0;attempt<2;attempt++) {
        try {
          const messages=[{role:'system',content:SYSTEM+'\n\n'+CAMPAIGN_EDITORIAL_REWRITE},{role:'user',content:JSON.stringify({insurance:input.insurance,theme:input.theme})}]
          if(attempt>0) messages.push({role:'system',content:'A primeira sugestão não passou na validação da aplicação. Reescreva os dois idiomas a partir da mesma ideia comercial, mantendo a intenção. Regras de validação OBRIGATÓRIAS: JSON completo com os cinco campos; textos simples sem números, links, contatos, marcação ou placeholders. Não use palavras com as raízes econom ou ahorr (incluindo economia, ahorro e ahorrar), nem garantias, aprovação, desconto ou gratuidade, mesmo numa comparação ou frase negativa. Se a ideia do usuário comparar seguro com poupança, explique o conceito de valor de resgate / valor de rescate de algumas modalidades, sempre condicionado à apólice; não apresente o seguro como conta poupança nem prometa rendimento. Não invente condições, elegibilidade, cobertura ou benefícios adicionais. Se o tipo for genérico, não deduza a categoria. Confira essas regras antes de devolver o JSON; não peça ao usuário para reformular a ideia.\n\n'+CAMPAIGN_EDITORIAL_REWRITE})
          const response=await (io.fetch ?? globalThis.fetch)('https://api.openai.com/v1/chat/completions', {
            method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},
            body:JSON.stringify({model:'gpt-4o-mini',temperature:attempt===0?0.7:0.3,max_tokens:1000,response_format:{type:'json_object'},messages}),
          })
          if (!response.ok) throw new CampaignAIError(response.status===429?'rate_limit':'provider')
          const data=await response.json()
          const choice=data?.choices?.[0]
          if (choice?.finish_reason!=='stop' || typeof choice?.message?.content!=='string' || choice.message.content.length>12000) throw new CampaignAIError('invalid_copy')
          let output:unknown
          try { output=JSON.parse(choice.message.content) } catch { throw new CampaignAIError('invalid_copy') }
          return validateCopy(output,input)
        } catch(error) {
          if(!(error instanceof CampaignAIError) || error.code!=='invalid_copy' || attempt===1 || controller.signal.aborted) throw error
        }
      }
      throw new CampaignAIError('invalid_copy')
    }
    const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new CampaignAIError('timeout'))},io.timeoutMs??20000)})
    const copy=await Promise.race([job(),timeout])
    for (const lang of ['pt','es'] as const) {
      const text=lang==='pt'?'Olá! Gostaria de saber mais sobre seguros e pedir uma cotação.':'¡Hola! Me gustaría saber más sobre seguros y solicitar una cotización.'
      copy[`body_${lang}`]+=`\n\nhttps://wa.me/${input.phone}?text=${encodeURIComponent(text)}`
    }
    return copy
  } catch (error) {
    if (error instanceof CampaignAIError) throw error
    throw new CampaignAIError('provider')
  } finally { if (timer) clearTimeout(timer) }
}
