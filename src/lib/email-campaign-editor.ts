import {renderCampaignBody} from './email-campaign-content'

export function renderCampaignEditor(body:string,language:'pt'|'es') {
  return renderCampaignBody(body,language).replaceAll('<a ','<a contenteditable="false" ')
}
/** Serialize editable text while keeping link destinations, never their visible labels. */
export function campaignBodyFromEditor(root:Node):string {
  let text=''
  function visit(node:Node) {
    if(node.nodeType===3){text+=node.textContent??'';return}
    if(node.nodeType!==1 && node.nodeType!==11)return
    const element=node as Element
    if(element.tagName==='BR'){text+='\n';return}
    if(element.tagName==='A'){
      const href=element.getAttribute('href')??''
      if(/^https?:\/\/[^\s<>]+$/.test(href)){text+=href;return}
    }
    const block=element.tagName==='DIV'||element.tagName==='P'
    if(block && text && !text.endsWith('\n'))text+='\n'
    for(const child of node.childNodes)visit(child)
    if(block && node.nextSibling && !text.endsWith('\n'))text+='\n'
  }
  for(const child of root.childNodes)visit(child)
  return text.replaceAll('\u00a0',' ')
}
