import {campaignRichHtml,isRichCampaignBody} from './email-campaign-rich'

function escapeHtml(text: string) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

/** Legacy text stays escaped; explicitly marked rich drafts are sanitized at every render. */
export function renderCampaignBody(body: string, language: 'pt' | 'es', rich=isRichCampaignBody(body)) {
  // Callers personalizing a draft pin this mode from the saved source, never recipient data.
  if(rich)return campaignRichHtml(body)
  const label = language === 'es' ? 'haz clic aquí para hablar conmigo' : 'clique aqui para falar comigo'
  let html = '', cursor = 0
  for (const match of body.matchAll(/https?:\/\/[^\s<>]+/g)) {
    const url = match[0], index = match.index!
    html += escapeHtml(body.slice(cursor, index))
    let title = url
    try {
      const parsed = new URL(url)
      if (parsed.origin === 'https://wa.me' && !parsed.username && !parsed.password && /^\/[1-9]\d{7,14}\/?$/.test(parsed.pathname)) title = label
    } catch { /* Invalid links keep their original visible text; never infer a destination. */ }
    html += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2 text-blue-700 dark:text-blue-300">${escapeHtml(title)}</a>`
    cursor = index + url.length
  }
  html += escapeHtml(body.slice(cursor))
  return html.replace(/\r?\n/g, '<br/>')
}
