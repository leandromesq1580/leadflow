import sanitizeHtml from 'sanitize-html'
import {decodeHTML} from 'entities'

export const CAMPAIGN_RICH_PREFIX='<!--lead4pro-rich:v1-->'
export const CAMPAIGN_BODY_LIMIT=20000
export const isRichCampaignBody=(body:string)=>body.startsWith(CAMPAIGN_RICH_PREFIX)
export function escapeCampaignHtml(value:string){return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))}
/** Validate, do not rewrite destinations or allow active/file/data URLs. Images are HTTPS only. */
export function safeCampaignUrl(value:string,image=false):string|null {
 if(!value || value.length>4096 || /[\s\\\u0000-\u001f\u007f]/.test(value) || value.includes('{{'))return null
 try{const u=new URL(value);return (image?u.protocol==='https:':['https:','http:'].includes(u.protocol))&&!u.username&&!u.password?value:null}catch{return null}
}
export function sanitizeCampaignHtml(html:string):string {
 return sanitizeHtml(html,{
  allowedTags:['p','br','strong','em','u','s','a','img','ul','ol','li','h2','h3','blockquote','span'],
  allowedAttributes:{a:['href','target','rel','class'],img:['src','alt','style']},
  allowedSchemes:['https','http'],allowedSchemesByTag:{img:['https']},allowProtocolRelative:false,
  allowedStyles:{img:{'max-width':[/^100%$/],height:[/^auto$/],display:[/^block$/]}},
  transformTags:{
   b:'strong',i:'em',div:'p',
   a:(_tag,attrs)=>{const href=safeCampaignUrl(attrs.href??'');return href?{tagName:'a',attribs:{href,target:'_blank',rel:'noopener noreferrer',class:'underline underline-offset-2 text-blue-700 dark:text-blue-300'}}:{tagName:'span',attribs:{}}},
   img:(_tag,attrs)=>({tagName:'img',attribs:{src:safeCampaignUrl(attrs.src??'',true)??'',alt:(attrs.alt??'Imagem da campanha').slice(0,300),style:'max-width:100%;height:auto;display:block'}}),
  },
  exclusiveFilter:frame=>frame.tag==='img'&&!frame.attribs.src,
 })
}
export function encodeCampaignHtml(html:string):string{return CAMPAIGN_RICH_PREFIX+sanitizeCampaignHtml(html)}
export function campaignRichHtml(body:string):string{return sanitizeCampaignHtml(body.slice(CAMPAIGN_RICH_PREFIX.length))}
export function campaignBodyToText(body:string):string {
 if(!isRichCampaignBody(body))return body
 const safe=campaignRichHtml(body)
 const spaced=safe.replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g,(_match,href,label)=>`${label} (${href})`)
  .replace(/<img\b[^>]*alt="([^"]*)"[^>]*\/?\s*>/g,(_match,alt)=>alt?`[${alt}]`:'')
  .replace(/<br\s*\/?\s*>|<\/(?:p|li|h2|h3|blockquote|ul|ol)>/g,'\n')
 return decodeHTML(sanitizeHtml(spaced,{allowedTags:[],allowedAttributes:{}})).replace(/\n{3,}/g,'\n\n').trim()
}
export function personalizeCampaignBody(body:string,name:string):string {
 const replacement=isRichCampaignBody(body)?escapeCampaignHtml(name.slice(0,200)):name.slice(0,200)
 return body.replace(/{{\s*nome\s*}}/g,()=>replacement)
}
