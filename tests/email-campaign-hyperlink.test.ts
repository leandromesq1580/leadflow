import test from 'node:test'
import assert from 'node:assert/strict'
import { campaignConfiguration, renderCampaignEmail } from '../src/lib/email-campaigns'

const url = 'https://wa.me/17867442126?text=Ol%C3%A1!%20Gostaria%20de%20saber%20mais%20sobre%20seguros%20e%20pedir%20uma%20cota%C3%A7%C3%A3o'
const config = campaignConfiguration({
  RESEND_API_KEY: 'synthetic-only', RESEND_FROM_EMAIL: 'test@example.invalid',
  MANUAL_EMAIL_POSTAL_ADDRESS: 'Synthetic postal address', EMAIL_CAMPAIGN_WEBHOOK_SECRET: 'synthetic-only',
  EMAIL_CAMPAIGNS_ENABLED: 'false',
})
function render(body: string, language: 'pt' | 'es' = 'pt', name = 'Maria') {
  return renderCampaignEmail({
    campaign: { name: 'Campanha sintética', filters: {}, subject_pt: 'Olá {{nome}}', body_pt: body, subject_es: 'Hola {{nome}}', body_es: body },
    name, language, unsubscribe_token: '00000000-0000-0000-0000-000000000011',
  }, config)
}
const visible = (html: string) => html.replace(/<[^>]*>/g, '')

test('link exato do pedido aparece com o rótulo solicitado, sem URL visível no HTML', () => {
  const result = render('Olá {{nome}}!\n\nVamos conversar.\n\n' + url)
  assert.match(result.html, />clique aqui para falar comigo<\/a>/)
  assert.ok(result.html.includes(`href="${url}"`), 'Destino e texto pré-preenchido devem ser preservados exatamente')
  assert.doesNotMatch(visible(result.html), /https:\/\/wa\.me|%20|%C3/)
  assert.match(visible(result.html), /Olá Maria![\s\S]*Vamos conversar\./)
  assert.match(result.subject, /Olá Maria/)
})

test('campanha em espanhol recebe rótulo espanhol sem modificar seu destino', () => {
  const result = render('Hola {{nome}}!\n\n' + url, 'es')
  assert.match(result.html, />haz clic aquí para hablar conmigo<\/a>/)
  assert.doesNotMatch(visible(result.html), /clique aqui|https:\/\/wa\.me/)
  assert.ok(result.html.includes(`href="${url}"`))
})

test('texto simples conserva destino acessível e rodapé quando o leitor não usa HTML', () => {
  const result = render('Olá!\n\n' + url)
  assert.ok(result.text.includes(url))
  assert.match(result.text, /Synthetic postal address/)
  assert.match(result.text, /Cancelar recebimento: https:/)
  assert.match(result.headers['List-Unsubscribe-Post'], /List-Unsubscribe=One-Click/)
  assert.match(result.html, />Cancelar recebimento<\/a>/)
})

test('link novo e link já salvo são formatados sem editar o conteúdo da campanha', () => {
  const body = 'Texto da campanha existente\n' + url
  const result = render(body)
  assert.match(result.html, />clique aqui para falar comigo<\/a>/)
  assert.ok(result.text.startsWith(body))
  assert.match(result.html, /Texto da campanha existente/)
})

test('somente wa.me real com telefone válido recebe o rótulo de conversa', () => {
  for (const link of ['https://wa.me.example.invalid/17867442126', 'https://wa.me@other.example.invalid/17867442126',
    'https://wa.me/invalid', 'https://wa.me:8443/17867442126', 'https://synthetic:fixture@wa.me/15555550109',
    'http://wa.me/17867442126', 'https://example.invalid/quote']) {
    const result = render(link)
    assert.doesNotMatch(result.html, />clique aqui para falar comigo<\/a>/, link)
    assert.ok(visible(result.html).includes(link), link)
  }
})

test('WhatsApp personalizado continua com o número e mensagem escolhidos pelo administrador', () => {
  const link = 'https://wa.me/15555550109?text=Mensagem%20sintetica&source=campaign'
  const result = render(link)
  assert.match(result.html, />clique aqui para falar comigo<\/a>/)
  assert.ok(result.html.includes('href="https://wa.me/15555550109?text=Mensagem%20sintetica&amp;source=campaign"'))
  assert.ok(result.text.includes(link))
})

test('nome, texto e atributos não viram HTML executável', () => {
  const body = 'Olá {{nome}}!\n<img src=x onerror=alert(1)>\n' + url + '&a="onclick=evil"\n<script>bad()</script>'
  const result = render(body, 'pt', '<svg onload=evil()>')
  assert.doesNotMatch(result.html, /<img|<svg|<script|href="[^"]*"onclick=/)
  assert.match(result.html, /&lt;img/)
  assert.match(result.html, /&lt;svg onload=evil\(\)&gt;/)
  assert.match(result.html, /&lt;script/)
  assert.match(result.html, /&quot;onclick=evil&quot;/)
  assert.match(result.html, />clique aqui para falar comigo<\/a>/)
})

test('quebras e diferentes links são mantidos; só WhatsApp perde a URL visível', () => {
  const other = 'https://example.invalid/quote?x=1&y=2'
  const result = render('Primeira linha\nSegunda linha\n\n' + other + '\n' + url)
  assert.match(result.html, /Primeira linha<br\/>Segunda linha<br\/><br\/>/)
  assert.ok(result.html.includes(`href="${other.replaceAll('&', '&amp;')}"`))
  assert.ok(visible(result.html).includes(other.replaceAll('&', '&amp;')))
  assert.match(result.html, />clique aqui para falar comigo<\/a>/)
  assert.equal((result.html.match(/href="https:\/\/wa\.me/g) || []).length, 1)
})
