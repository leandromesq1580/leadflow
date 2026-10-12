import {renderCampaignBody} from './email-campaign-content'
import {encodeCampaignHtml,sanitizeCampaignHtml} from './email-campaign-rich'

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

/** Called only after an explicit rich-text command; legacy typing remains plain-text compatible. */
export function campaignHtmlFromEditor(root:HTMLElement):string{return encodeCampaignHtml(root.innerHTML)}

/** Dry-run the exact selection replacement in a detached DOM, without mutating undo/history. */
export function campaignBodyAfterInsertion(root:HTMLElement,selection:Range,html:string,rich:boolean):string {
  const clone=root.cloneNode(true) as HTMLElement
  function locate(node:Node){
    const path:number[]=[]
    while(node!==root){const parent=node.parentNode;if(!parent)throw new Error('selection_outside_editor');path.unshift(Array.prototype.indexOf.call(parent.childNodes,node));node=parent}
    let target:Node=clone;for(const index of path)target=target.childNodes[index];return target
  }
  const range=root.ownerDocument.createRange();range.setStart(locate(selection.startContainer),selection.startOffset);range.setEnd(locate(selection.endContainer),selection.endOffset)
  range.deleteContents();const template=root.ownerDocument.createElement('template');template.innerHTML=sanitizeCampaignHtml(html);range.insertNode(template.content)
  return rich?campaignHtmlFromEditor(clone):campaignBodyFromEditor(clone)
}
