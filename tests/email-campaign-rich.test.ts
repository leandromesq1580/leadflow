import test from 'node:test'
import assert from 'node:assert/strict'
import {encodeCampaignHtml, campaignBodyToText, personalizeCampaignBody, isRichCampaignBody, safeCampaignUrl} from '../src/lib/email-campaign-rich'
import {renderCampaignBody} from '../src/lib/email-campaign-content'
import {validateCampaign,renderCampaignEmail,campaignConfiguration} from '../src/lib/email-campaigns'
const url='https://wa.me/17867442126?text=Ol%C3%A1%20cotacao'
const draft={name:'Teste',subject_pt:'Olá {{nome}}',subject_es:'Hola {{nome}}',body_pt:'Texto',body_es:'Texto',filters:{}}
const cfg=campaignConfiguration({EMAIL_CAMPAIGNS_ENABLED:'true',RESEND_API_KEY:'synthetic',EMAIL_CAMPAIGN_WEBHOOK_SECRET:'synthetic',EMAIL_CAMPAIGNS_FROM_EMAIL:'contato@example.org',MANUAL_EMAIL_POSTAL_ADDRESS:'123 Test Street, FL 12345'})
test('HTML seguro preserva negrito, link com nome, imagem e parágrafos',()=>{
 const body=encodeCampaignHtml('<p>Seguro <b>de vida</b></p><p><a href="'+url+'">Minha cotação</a></p><img src="https://example.org/foto.png" alt="Família">')
 assert.ok(isRichCampaignBody(body));const html=renderCampaignBody(body,'pt')
 assert.match(html,/<strong>de vida<\/strong>/);assert.match(html,/href="https:\/\/wa.me\/17867442126\?text=Ol%C3%A1%20cotacao"/);assert.match(html,/>Minha cotação<\/a>/)
 assert.match(html,/<img src="https:\/\/example.org\/foto.png" alt="Família"/);assert.match(html,/max-width:100%/)
 assert.equal(validateCampaign({...draft,body_pt:body,body_es:body}).ok,true)
})
test('HTML arbitrário sem marcador continua rejeitado; textos antigos e IA permanecem compatíveis',()=>{
 assert.equal(validateCampaign({...draft,body_pt:'<strong>vida</strong>'}).ok,false)
 const html=renderCampaignBody('Mensagem\n\n'+url,'pt');assert.match(html,/>clique aqui para falar comigo<\/a>/)
 assert.match(renderCampaignBody('<img src=x onerror=alert(1)>','pt'),/&lt;img/)
})
test('sanitização remove scripts, eventos, embeds, URLs perigosas, CSS e SVG em todos os renderizadores',()=>{
 const evil='<script>alert(1)</script><iframe src="https://example.org"></iframe><svg onload="alert(2)"></svg><p onclick="alert(3)" style="background:url(javascript:alert(4))">Seguro</p><a href="javascript:alert(5)">x</a><a href="data:text/html,abc">y</a><img src="data:image/svg+xml,bad" onerror="alert(6)"><img src="http://example.org/x.png"><img src="//example.org/x.png"><a href="https://user:pass@example.org">z</a>'
 const body=encodeCampaignHtml(evil);const html=renderCampaignBody(body,'pt')
 assert.doesNotMatch(html,/script|iframe|svg|onload|onclick|onerror|javascript|data:|background|user:pass|http:\/\/example/)
 assert.equal(safeCampaignUrl('javascript:alert(1)'),null);assert.equal(safeCampaignUrl('https://user:pass@example.org'),null)
 assert.equal(safeCampaignUrl('http://example.org/a',true),null);assert.equal(safeCampaignUrl('https://example.org/a',true),'https://example.org/a')
})
test('texto alternativo do email mantém conteúdo, nomes dos links e destinos sem marcador HTML',()=>{
 const body=encodeCampaignHtml('<p>Olá {{nome}}, <strong>seguro de vida</strong>.</p><p><a href="'+url+'">Pedir cotação</a></p><img src="https://example.org/x.png" alt="Proteção familiar">')
 const row={campaign:{...draft,body_pt:body},name:'Ana <script> & "',language:'pt' as const,unsubscribe_token:'11111111-1111-4111-8111-111111111111'}
 const result=renderCampaignEmail(row,cfg)
 assert.match(result.html,/<strong>seguro de vida<\/strong>/);assert.match(result.html,/Ana &lt;script&gt; &amp; "/);assert.doesNotMatch(result.html,/<script\b/)
 assert.match(result.text,/Olá Ana <script> & "/);assert.match(result.text,/Pedir cotação/);assert.ok(result.text.includes(url));assert.doesNotMatch(result.text,/<p>|<strong>|lead4pro-rich/)
 assert.ok(result.html.includes('Cancelar recebimento'));assert.ok(result.headers['List-Unsubscribe'])
 assert.equal(campaignBodyToText('Texto & simples'), 'Texto & simples')
 assert.ok(personalizeCampaignBody(body,'<img src=x>').includes('&lt;img src=x&gt;'))
})
test('nome de destinatário não muda formato legado nem introduz links/imagens no email',()=>{
 const attacker='<!--lead4pro-rich:v1--><a href="https://attacker.invalid/collect">Pague aqui</a><img src="https://attacker.invalid/pixel" alt="">'
 const row={campaign:{...draft,body_pt:'{{nome}}, confira sua cotação.'},name:attacker,language:'pt' as const,unsubscribe_token:'11111111-1111-4111-8111-111111111111'}
 const result=renderCampaignEmail(row,cfg)
 assert.doesNotMatch(result.html,/<img\b|href="https:\/\/attacker.invalid\/collect"|>Pague aqui<\/a>/);assert.match(result.html,/&lt;!--lead4pro-rich:v1--&gt;/)
 assert.equal(result.text.startsWith(attacker+', confira sua cotação.'),true)
 const rich=renderCampaignEmail({...row,campaign:{...draft,body_pt:encodeCampaignHtml('<p>{{nome}}, confira sua cotação.</p>')}},cfg)
 assert.doesNotMatch(rich.html,/<img\b|<a\b[^>]*href="https:\/\/attacker.invalid/)
})

test('HTML vazio, só código removido e tamanho excessivo não viram campanha válida',()=>{
 for(const html of ['', '<script>alert(1)</script>', '<p> </p>']) assert.equal(validateCampaign({...draft,body_pt:encodeCampaignHtml(html)}).ok,false)
 assert.equal(validateCampaign({...draft,body_pt:encodeCampaignHtml('<strong>'+'a'.repeat(20000)+'</strong>')}).ok,false)
})
