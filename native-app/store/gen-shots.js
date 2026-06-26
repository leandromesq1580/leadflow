const fs = require('fs')
const W = 1290, H = 2796
const FF = "Helvetica, 'Helvetica Neue', Arial, sans-serif"
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const T = (x, y, size, fill, w, s, a = 'start', ls = '') => `<text x="${x}" y="${y}" font-family="${FF}" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${a}"${ls ? ` letter-spacing="${ls}"` : ''}>${esc(s)}</text>`
const R = (x, y, w, h, rx, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`
const C = (cx, cy, r, fill) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`
const AV = (cx, cy, rad, grad, ini) => C(cx, cy, rad, `url(#${grad})`) + T(cx, cy + rad * 0.34, rad * 0.8, '#fff', 700, ini, 'middle')
const pill = (x, y, w, h, fill, txt, tcol) => R(x, y, w, h, h / 2, fill) + T(x + w / 2, y + h * 0.66, h * 0.42, tcol, 700, txt, 'middle')

const SX = 261, SY = 846, SW = 768
const cx0 = SX + 36, cw = SW - 72

const defs = () => `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#241c47"/><stop offset="0.45" stop-color="#151225"/><stop offset="1" stop-color="#0a0a10"/></linearGradient>
  <linearGradient id="bgG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#173f39"/><stop offset="0.45" stop-color="#121a22"/><stop offset="1" stop-color="#0a0a10"/></linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0" r="0.8"><stop offset="0" stop-color="#6366f1" stop-opacity="0.34"/><stop offset="0.7" stop-color="#6366f1" stop-opacity="0"/></radialGradient>
  <linearGradient id="hero" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient>
  <linearGradient id="a1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient>
  <linearGradient id="a2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0ea5e9"/><stop offset="1" stop-color="#6366f1"/></linearGradient>
  <linearGradient id="a3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14b8a6"/><stop offset="1" stop-color="#6366f1"/></linearGradient>
  <linearGradient id="a4" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f59e0b"/><stop offset="1" stop-color="#ec4899"/></linearGradient>
  <clipPath id="screen"><rect x="${SX}" y="${SY}" width="${SW}" height="1768" rx="88"/></clipPath>
</defs>`

const frame = bg => R(0, 0, W, H, 0, `url(#${bg})`) + R(0, 0, W, 900, 0, 'url(#glow)')
  + R(235, 820, 820, 1820, 110, '#000', 'stroke="rgba(255,255,255,0.08)" stroke-width="2"')
  + R(SX, SY, SW, 1768, 88, '#0b0b12') + R(SX + SW / 2 - 52, SY + 18, 104, 30, 15, '#000')

const header = (eyebrow, l1, l2, sub) => T(W / 2, 250, 40, '#a5b4fc', 800, eyebrow, 'middle', '7')
  + T(W / 2, 372, 104, '#ffffff', 800, l1, 'middle') + T(W / 2, 488, 104, '#c4b5fd', 800, l2, 'middle')
  + T(W / 2, 600, 46, 'rgba(244,244,248,0.62)', 500, sub, 'middle')

const statusbar = T(cx0, SY + 70, 30, '#f4f4f8', 700, '9:41')
  + C(SX + SW - 92, SY + 60, 7, 'rgba(244,244,248,0.85)') + C(SX + SW - 66, SY + 60, 7, 'rgba(244,244,248,0.85)') + R(SX + SW - 52, SY + 50, 36, 20, 6, 'rgba(244,244,248,0.85)')

const icbAccent = (x, y) => R(x, y, 54, 54, 16, 'rgba(139,92,246,0.28)') + R(x + 16, y + 16, 22, 22, 7, '#c4b5fd')

function sInicio() {
  let y = SY + 110
  let s = R(cx0, y, cw, 250, 34, 'url(#hero)')
  s += T(cx0 + 32, y + 56, 30, 'rgba(255,255,255,0.85)', 500, 'Bom dia,') + T(cx0 + 32, y + 104, 46, '#fff', 800, 'Fabiany')
  s += T(cx0 + 32, y + 192, 70, '#fff', 800, '5') + T(cx0 + 112, y + 192, 30, 'rgba(255,255,255,0.8)', 500, 'leads disponíveis')
  y += 290
  const hw = (cw - 24) / 2
  s += R(cx0, y, hw, 190, 26, 'rgba(255,255,255,0.05)') + R(cx0 + hw + 24, y, hw, 190, 26, 'rgba(255,255,255,0.05)')
  s += icbAccent(cx0 + 28, y + 30) + T(cx0 + 28, y + 140, 50, '#fff', 800, '3') + T(cx0 + 28, y + 176, 26, 'rgba(244,244,248,0.55)', 500, 'Leads hoje')
  s += icbAccent(cx0 + hw + 52, y + 30) + T(cx0 + hw + 52, y + 140, 50, '#fff', 800, '28%') + T(cx0 + hw + 52, y + 176, 26, 'rgba(244,244,248,0.55)', 500, 'Conversão')
  y += 250
  s += T(cx0, y, 32, '#fff', 800, 'Leads recentes'); y += 34
  for (const [ini, g, nm, meta, sc] of [['SP', 'a1', 'Sharon Peoples', 'FL · Seguro de vida', '92'], ['MO', 'a2', 'Maria Oliveira', 'TX · Seguro de vida', '78']]) {
    s += R(cx0, y, cw, 130, 26, 'rgba(255,255,255,0.05)') + AV(cx0 + 60, y + 65, 42, g, ini)
    s += T(cx0 + 124, y + 56, 32, '#f4f4f8', 700, nm) + T(cx0 + 124, y + 98, 27, 'rgba(244,244,248,0.55)', 500, meta)
    s += pill(cx0 + cw - 90, y + 44, 66, 44, 'url(#hero)', sc, '#fff'); y += 148
  }
  return s
}
function leadRow(y, ini, g, nm, meta, tag) {
  return R(cx0, y, cw, 130, 26, 'rgba(255,255,255,0.05)') + AV(cx0 + 60, y + 65, 44, g, ini)
    + T(cx0 + 128, y + 56, 32, '#f4f4f8', 700, nm) + T(cx0 + 128, y + 98, 26, 'rgba(244,244,248,0.55)', 500, meta)
    + pill(cx0 + cw - 150, y + 44, 126, 44, 'rgba(255,255,255,0.08)', tag, 'rgba(244,244,248,0.72)')
}
function sLeads() {
  let y = SY + 130
  let s = T(cx0, y, 40, '#fff', 800, 'Meus leads'); y += 40
  s += R(cx0, y, cw, 80, 22, 'rgba(255,255,255,0.05)') + T(cx0 + 30, y + 52, 30, 'rgba(244,244,248,0.42)', 500, 'Buscar lead...'); y += 110
  s += pill(cx0, y, 130, 56, 'url(#hero)', 'Todos', '#fff') + pill(cx0 + 146, y, 130, 56, 'rgba(255,255,255,0.04)', 'Novos', 'rgba(244,244,248,0.7)') + pill(cx0 + 292, y, 150, 56, 'rgba(255,255,255,0.04)', 'Quentes', 'rgba(244,244,248,0.7)'); y += 84
  for (const a of [['SP', 'a1', 'Sharon Peoples', '+1 (407) 963-8956', 'Novo'], ['JC', 'a1', 'John Carter', '+1 (415) 555-0142', 'Quente'], ['AB', 'a3', 'Ana Beatriz', '+1 (305) 555-0176', 'Novo'], ['RL', 'a4', 'Robert Lee', '+1 (212) 555-0119', 'Agendado']]) { s += leadRow(y, ...a); y += 148 }
  return s
}
function sPipeline() {
  let y = SY + 130
  let s = T(cx0, y, 40, '#fff', 800, 'Pipeline'); y += 50
  s += pill(cx0, y, 200, 58, 'url(#hero)', 'Novo · 4', '#fff') + pill(cx0 + 216, y, 260, 58, 'rgba(255,255,255,0.04)', 'Contatado · 2', 'rgba(244,244,248,0.7)'); y += 90
  for (const [ini, g, nm, meta] of [['SP', 'a1', 'Sharon Peoples', 'FL · Seguro de vida'], ['AB', 'a3', 'Ana Beatriz', 'FL · Seguro de vida'], ['RL', 'a4', 'Robert Lee', 'NY · Seguro de vida']]) {
    s += R(cx0, y, cw, 140, 26, 'rgba(255,255,255,0.05)') + R(cx0, y, 8, 140, 4, '#8b5cf6') + AV(cx0 + 70, y + 70, 44, g, ini)
    s += T(cx0 + 138, y + 60, 32, '#f4f4f8', 700, nm) + T(cx0 + 138, y + 102, 26, 'rgba(244,244,248,0.55)', 500, meta)
    s += C(cx0 + cw - 40, y + 56, 5, 'rgba(244,244,248,0.4)') + C(cx0 + cw - 40, y + 72, 5, 'rgba(244,244,248,0.4)') + C(cx0 + cw - 40, y + 88, 5, 'rgba(244,244,248,0.4)'); y += 160
  }
  return s
}
function bubble(y, txt, out) {
  const bw = Math.min(cw * 0.8, 70 + txt.length * 16)
  const x = out ? cx0 + cw - bw : cx0
  return R(x, y, bw, 76, 22, out ? 'url(#hero)' : 'rgba(255,255,255,0.07)') + T(x + 28, y + 48, 28, out ? '#fff' : '#f4f4f8', 500, txt)
}
function chrome(title, sub, ini, g, robot) {
  let s = robot ? (R(cx0, SY + 100, 64, 64, 18, 'url(#hero)') + T(cx0 + 32, SY + 142, 26, '#fff', 800, 'IA', 'middle')) : AV(cx0 + 34, SY + 130, 34, g, ini)
  s += T(cx0 + 86, SY + 122, 32, '#f4f4f8', 800, title)
  if (sub) s += T(cx0 + 86, SY + 160, 26, '#34d399', 600, sub)
  s += R(SX, SY + 1658, SW, 110, 0, 'rgba(13,13,22,0.95)') + R(cx0, SY + 1678, cw - 80, 68, 18, 'rgba(255,255,255,0.06)')
  const scx = cx0 + cw - 34, scy = SY + 1712
  s += C(scx, scy, 34, 'url(#hero)') + `<path d="M${scx - 12} ${scy - 15} L${scx + 16} ${scy} L${scx - 12} ${scy + 15} Z" fill="#fff"/>`
  return s
}
function sWhats() {
  let s = chrome('Sharon Peoples', 'online', 'SP', 'a1', false), y = SY + 240
  s += bubble(y, 'Bom dia! Tudo bem?', false); y += 100
  s += bubble(y, 'Bom dia, Sharon! Vamos agendar?', true); y += 100
  s += bubble(y, 'Pode ser hoje às 14h?', false); y += 100
  s += bubble(y, 'Perfeito, combinado então', true); return s
}
function sAI() {
  let s = chrome('Especialista AI', '', '', '', true), y = SY + 240
  s += bubble(y, 'Posso ajudar com objeções e scripts.', false); y += 100
  s += bubble(y, 'Como quebro a objeção de preço?', true); y += 100
  s += bubble(y, 'Foque no custo de não ter proteção.', false); y += 112
  s += pill(cx0, y, 330, 56, 'rgba(255,255,255,0.05)', 'Script de 1ª ligação', 'rgba(244,244,248,0.7)') + pill(cx0 + 350, y, 180, 56, 'rgba(255,255,255,0.05)', 'Lead frio', 'rgba(244,244,248,0.7)')
  return s
}

const slides = [
  { bg: 'bg', hdr: ['LEAD4PRO', 'Leads de seguro,', 'frescos todo dia', 'Contatos exclusivos, direto no celular.'], scr: sInicio },
  { bg: 'bg', hdr: ['SEUS LEADS', 'Todos num', 'só lugar', 'Busque, filtre e abra com um toque.'], scr: sLeads },
  { bg: 'bg', hdr: ['PIPELINE', 'Cada negócio', 'até fechar', 'Mova por etapa, sem perder follow-up.'], scr: sPipeline },
  { bg: 'bgG', hdr: ['WHATSAPP', 'Responda', 'sem sair do app', 'A conversa do lead, dentro do CRM.'], scr: sWhats },
  { bg: 'bg', hdr: ['ESPECIALISTA AI', 'Um especialista', 'no seu bolso', 'Quebre objeções e feche mais apólices.'], scr: sAI },
]
slides.forEach((sl, i) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + defs() + frame(sl.bg) + header(...sl.hdr) + statusbar + `<g clip-path="url(#screen)">` + sl.scr() + `</g></svg>`
  fs.writeFileSync(`/tmp/lf2/native-app/store/slide-${i + 1}.svg`, svg)
})
console.log('5 SVGs gerados')
