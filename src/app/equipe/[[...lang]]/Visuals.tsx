import type { Lang } from './copy'

/**
 * Gráficos do CRM em SVG/CSS (sem imagem pesada, nítidos em qualquer tela).
 * Todos os nomes, números e conversas são FICTÍCIOS — a página avisa "ilustração".
 */
const L = {
  pt: {
    dash: 'Sala de comando', kpi: ['Leads novos', 'Contatados', 'Cotações', 'Apólices'], week: 'Leads por dia', days: ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'], funnel: 'Funil da semana', conv: 'Conversão',
    fun: ['Novo', 'Contatado', 'Cotação', 'Fechado'],
    pipe: 'Pipeline', cols: ['Novo', 'Contatado', 'Cotação', 'Fechado'], hot: 'QUENTE',
    wa: 'WhatsApp', waName: 'Mariana S.', waOnline: 'online', m1: 'Oi Mariana! Aqui é da Lead4Pro. Vi que pediu uma cotação de seguro de vida.', m2: 'Oi! Sim, quero saber os valores', m3: 'Perfeito. Qual a sua data de nascimento?', auto: 'Mensagem automática', typing: 'Digite uma mensagem',
    call: 'Ligação em andamento', rec: 'Gravando', steps: ['Abertura', 'Necessidade', 'Cotação', 'Fechamento'], ai: 'IA sugere', aiTxt: '“Por menos de $5 por dia, sua família fica protegida.”', cl: 'Cliente: “Achei caro.”',
    seq: 'Sequência de follow-up', nodes: [['Dia 0', 'WhatsApp'], ['+1 h', 'SMS'], ['Dia 1', 'Ligação'], ['Dia 3', 'E-mail'], ['Dia 7', 'WhatsApp']], seqSub: 'Roda sozinha, enquanto você vende',
    cal: 'Agenda', week7: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'], conf: 'Confirmada', pol: 'Apólices', active: 'Ativa', renew: 'Renovar em 30 dias', ev: ['Carlos', 'Ana', 'Paulo'],
    flowT: ['Anúncio', 'Lead único', 'Seu WhatsApp + CRM'], flowS: ['pedido de cotação', 'só para você', 'em minutos'],
    ring: ['Leads', 'CRM + IA', 'Treino diário', 'Acompanhamento'], ringC: 'MÉTODO', day: ['Treino', 'Prática', 'Ligações', 'Revisão'], dayT: 'Rotina de cada dia',
  },
  en: {
    dash: 'Command center', kpi: ['New leads', 'Contacted', 'Quotes', 'Policies'], week: 'Leads per day', days: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], funnel: 'Week funnel', conv: 'Conversion',
    fun: ['New', 'Contacted', 'Quote', 'Closed'],
    pipe: 'Pipeline', cols: ['New', 'Contacted', 'Quote', 'Closed'], hot: 'HOT',
    wa: 'WhatsApp', waName: 'Mariana S.', waOnline: 'online', m1: 'Hi Mariana! This is Lead4Pro. I saw you asked for a life insurance quote.', m2: 'Hi! Yes, I want to know the prices', m3: 'Great. What is your date of birth?', auto: 'Automatic message', typing: 'Type a message',
    call: 'Call in progress', rec: 'Recording', steps: ['Opening', 'Needs', 'Quote', 'Closing'], ai: 'AI suggests', aiTxt: '“For under $5 a day, your family is protected.”', cl: 'Client: “It’s expensive.”',
    seq: 'Follow-up sequence', nodes: [['Day 0', 'WhatsApp'], ['+1 h', 'SMS'], ['Day 1', 'Call'], ['Day 3', 'Email'], ['Day 7', 'WhatsApp']], seqSub: 'Runs on its own while you sell',
    cal: 'Calendar', week7: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], conf: 'Confirmed', pol: 'Policies', active: 'Active', renew: 'Renew in 30 days', ev: ['Carlos', 'Ana', 'Paulo'],
    flowT: ['Ad', 'One lead', 'Your WhatsApp + CRM'], flowS: ['quote request', 'only for you', 'in minutes'],
    ring: ['Leads', 'CRM + AI', 'Daily training', 'Coaching'], ringC: 'METHOD', day: ['Training', 'Practice', 'Calls', 'Review'], dayT: 'Every day’s routine',
  },
  es: {
    dash: 'Sala de mando', kpi: ['Leads nuevos', 'Contactados', 'Cotizaciones', 'Pólizas'], week: 'Leads por día', days: ['L', 'M', 'M', 'J', 'V', 'S', 'D'], funnel: 'Embudo de la semana', conv: 'Conversión',
    fun: ['Nuevo', 'Contactado', 'Cotización', 'Cerrado'],
    pipe: 'Pipeline', cols: ['Nuevo', 'Contactado', 'Cotización', 'Cerrado'], hot: 'CALIENTE',
    wa: 'WhatsApp', waName: 'Mariana S.', waOnline: 'en línea', m1: '¡Hola Mariana! Soy de Lead4Pro. Vi que pediste una cotización de seguro de vida.', m2: '¡Hola! Sí, quiero saber los precios', m3: 'Perfecto. ¿Cuál es tu fecha de nacimiento?', auto: 'Mensaje automático', typing: 'Escribe un mensaje',
    call: 'Llamada en curso', rec: 'Grabando', steps: ['Apertura', 'Necesidad', 'Cotización', 'Cierre'], ai: 'IA sugiere', aiTxt: '“Por menos de $5 al día, tu familia queda protegida.”', cl: 'Cliente: “Me parece caro.”',
    seq: 'Secuencia de seguimiento', nodes: [['Día 0', 'WhatsApp'], ['+1 h', 'SMS'], ['Día 1', 'Llamada'], ['Día 3', 'Correo'], ['Día 7', 'WhatsApp']], seqSub: 'Corre sola mientras vendes',
    cal: 'Agenda', week7: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'], conf: 'Confirmada', pol: 'Pólizas', active: 'Activa', renew: 'Renovar en 30 días', ev: ['Carlos', 'Ana', 'Paulo'],
    flowT: ['Anuncio', 'Lead único', 'Tu WhatsApp + CRM'], flowS: ['solicitud de cotización', 'solo para ti', 'en minutos'],
    ring: ['Leads', 'CRM + IA', 'Entrenamiento diario', 'Acompañamiento'], ringC: 'MÉTODO', day: ['Entreno', 'Práctica', 'Llamadas', 'Revisión'], dayT: 'La rutina de cada día',
  },
} as const

const Frame = ({ title, children, tag }: { title: string; children: React.ReactNode; tag?: string }) => (
  <div className="vz-frame">
    <div className="vz-bar"><i /><i /><i /><span>{title}</span>{tag && <em>{tag}</em>}</div>
    <div className="vz-body">{children}</div>
  </div>
)

/** Sala de comando: KPIs + gráfico de área + funil + rosca de conversão */
export function DashboardViz({ lang }: { lang: Lang }) {
  const t = L[lang]
  const pts = [14, 22, 18, 31, 27, 38, 34]
  const max = 44
  const xy = pts.map((v, i) => [10 + i * 46.7, 96 - (v / max) * 80])
  const line = xy.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')
  const area = `${line} L${xy[6][0]},100 L${xy[0][0]},100 Z`
  const kv = ['42', '31', '12', '5']
  const fun = [100, 74, 29, 12]
  return (
    <Frame title={t.dash}>
      <div className="vz-kpis">{t.kpi.map((k, i) => <div key={k} className="vz-kpi"><small>{k}</small><b>{kv[i]}</b></div>)}</div>
      <div className="vz-row2">
        <div className="vz-card">
          <small>{t.week}</small>
          <svg viewBox="0 0 300 118" className="vz-svg" role="img" aria-label={t.week}>
            <defs><linearGradient id="vzg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8b5cf6" stopOpacity=".55" /><stop offset="1" stopColor="#8b5cf6" stopOpacity="0" /></linearGradient></defs>
            {[28, 52, 76].map(y => <line key={y} x1="0" x2="300" y1={y} y2={y} stroke="rgba(255,255,255,.07)" />)}
            <path d={area} fill="url(#vzg)" /><path d={line} fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {xy.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.4" fill="#0a0e1a" stroke="#c4b5fd" strokeWidth="2" />)}
            {t.days.map((d, i) => <text key={i} x={10 + i * 46.7} y="115" textAnchor="middle" fontSize="10" fill="#aab4cb">{d}</text>)}
          </svg>
        </div>
        <div className="vz-card vz-donut">
          <small>{t.conv}</small>
          <svg viewBox="0 0 100 100" className="vz-svg-s"><circle cx="50" cy="50" r="36" fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="11" /><circle cx="50" cy="50" r="36" fill="none" stroke="#34d399" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${0.29 * 226} 226`} transform="rotate(-90 50 50)" /><text x="50" y="56" textAnchor="middle" fontSize="19" fontWeight="800" fill="#fff">29%</text></svg>
        </div>
      </div>
      <div className="vz-card">
        <small>{t.funnel}</small>
        <div className="vz-fun">{t.fun.map((f, i) => <div key={f} className="vz-fun-r"><span>{f}</span><div><u style={{ width: `${fun[i]}%`, opacity: 1 - i * 0.14 }} /></div><b>{[42, 31, 12, 5][i]}</b></div>)}</div>
      </div>
    </Frame>
  )
}

/** Pipeline kanban com contadores, tag de lead quente e barra de progresso */
export function PipelineViz({ lang }: { lang: Lang }) {
  const t = L[lang]
  const cards: { n: string; w: string; c: number; hot?: boolean; h: string }[] = [
    { n: 'Mariana S.', w: 'Orlando, FL', c: 0, hot: true, h: '4 min' }, { n: 'Roberto L.', w: 'Tampa, FL', c: 0, h: '1 h' },
    { n: 'Carlos F.', w: 'Miami, FL', c: 1, hot: true, h: '3 h' }, { n: 'Juliana C.', w: 'Kissimmee, FL', c: 1, h: '1 d' },
    { n: 'Fam. Duarte', w: 'Boca Raton, FL', c: 2, h: '2 d' }, { n: 'Paulo M.', w: 'Naples, FL', c: 3, h: '✓' }, { n: 'Ana R.', w: 'Doral, FL', c: 3, h: '✓' },
  ]
  const color = ['#60a5fa', '#fbbf24', '#a78bfa', '#34d399']
  return (
    <Frame title={t.pipe}>
      <div className="vz-cols">
        {t.cols.map((c, ci) => (
          <div key={c} className="vz-col" style={{ ['--cc' as string]: color[ci] }}>
            <h5><i />{c}<b>{cards.filter(k => k.c === ci).length}</b></h5>
            {cards.filter(k => k.c === ci).map(k => (
              <div key={k.n} className="vz-kc">
                <div className="vz-av">{k.n[0]}</div>
                <div><strong>{k.n}</strong><small>{k.w}</small></div>
                {k.hot ? <em>{t.hot}</em> : <span>{k.h}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Frame>
  )
}

/** Celular com conversa de WhatsApp dentro do CRM */
export function WhatsViz({ lang }: { lang: Lang }) {
  const t = L[lang]
  return (
    <div className="vz-phone">
      <div className="vz-ph-top"><div className="vz-av vz-av-g">M</div><div><strong>{t.waName}</strong><small>{t.waOnline}</small></div><span>📞</span></div>
      <div className="vz-chat">
        <div className="vz-b vz-b-o">{t.m1}<small>{t.auto} · 10:02 ✓✓</small></div>
        <div className="vz-b vz-b-i">{t.m2}<small>10:04</small></div>
        <div className="vz-b vz-b-o">{t.m3}<small>10:05 ✓✓</small></div>
      </div>
      <div className="vz-ph-in">{t.typing}<span>➤</span></div>
    </div>
  )
}

/** Tela de ligação: onda, cronômetro, roteiro e sugestão da IA */
export function CallViz({ lang }: { lang: Lang }) {
  const t = L[lang]
  const bars = Array.from({ length: 34 }, (_, i) => 6 + Math.abs(Math.sin(i * 0.9) * 20) + ((i * 7) % 5))
  return (
    <Frame title={t.call} tag={`● ${t.rec}`}>
      <div className="vz-call">
        <div className="vz-call-top"><div className="vz-av vz-av-g">M</div><div><strong>{t.waName}</strong><small>Orlando, FL</small></div><b>04:32</b></div>
        <svg viewBox="0 0 340 44" className="vz-wave">{bars.map((h, i) => <rect key={i} x={i * 10} y={22 - h / 2} width="5" height={h} rx="2.5" fill={i < 22 ? '#a78bfa' : 'rgba(255,255,255,.18)'} />)}</svg>
        <div className="vz-steps">{t.steps.map((s, i) => <div key={s} className={i < 2 ? 'done' : i === 2 ? 'now' : ''}><i>{i < 2 ? '✓' : i + 1}</i>{s}</div>)}</div>
        <div className="vz-cli">{t.cl}</div>
        <div className="vz-aisug"><b>🤖 {t.ai}</b>{t.aiTxt}</div>
      </div>
    </Frame>
  )
}

/** Linha do tempo da sequência de follow-up por canal */
export function SequenceViz({ lang }: { lang: Lang }) {
  const t = L[lang]
  const ico: Record<string, string> = { WhatsApp: '💬', SMS: '✉️', Ligação: '📞', Call: '📞', Llamada: '📞', 'E-mail': '📧', Email: '📧', Correo: '📧' }
  const col = ['#34d399', '#60a5fa', '#a78bfa', '#fbbf24', '#34d399']
  return (
    <Frame title={t.seq}>
      <div className="vz-seq">
        <div className="vz-seq-line" />
        {t.nodes.map(([d, c], i) => (
          <div key={d + c} className="vz-seq-n" style={{ ['--cc' as string]: col[i] }}>
            <div className="vz-seq-i">{ico[c] || '•'}</div><b>{d}</b><small>{c}</small>
          </div>
        ))}
      </div>
      <p className="vz-note">⚡ {t.seqSub}</p>
    </Frame>
  )
}

/** Agenda semanal + apólices */
export function AgendaViz({ lang }: { lang: Lang }) {
  const t = L[lang]
  const ev = [[0, 1, 0], [2, 2, 1], [3, 0, 2], [4, 1, 0]] as const
  return (
    <Frame title={`${t.cal} · ${t.pol}`}>
      <div className="vz-cal">
        {t.week7.map((d, i) => (
          <div key={d} className="vz-cal-c"><small>{d}</small>
            {ev.filter(e => e[0] === i).map((e, k) => <div key={k} className="vz-ev" style={{ marginTop: e[1] * 18 }}>{t.ev[e[2]]}</div>)}
          </div>
        ))}
      </div>
      <div className="vz-pol">
        {[['Duarte', 'ok', t.active], ['Paulo M.', 'ok', t.active], ['Ana R.', 'warn', t.renew]].map(([n, s, l]) => <div key={n} className="vz-pol-r"><span className={`vz-dot ${s}`} />{n}<em className={s}>{l}</em></div>)}
      </div>
    </Frame>
  )
}

/** Fluxo do lead: anúncio -> lead único -> seu WhatsApp + CRM */
export function FlowViz({ lang }: { lang: Lang }) {
  const t = L[lang]
  const ic = ['📣', '🎯', '📱']
  return (
    <div className="vz-flow">
      {t.flowT.map((x, i) => (
        <div key={x} className="vz-flow-s">
          <div className="vz-flow-i">{ic[i]}</div><strong>{x}</strong><small>{t.flowS[i]}</small>
          {i < 2 && <svg viewBox="0 0 40 12" className="vz-arrow"><path d="M0 6h34M28 1l7 5-7 5" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" /></svg>}
        </div>
      ))}
    </div>
  )
}

/** Rotina diária: Treino -> Prática -> Ligações -> Revisão */
export function RoutineViz({ lang }: { lang: Lang }) {
  const t = L[lang]
  const ic = ['🎓', '🎭', '📞', '👀']
  return (
    <div className="vz-routine">
      <small>{t.dayT}</small>
      <div>{t.day.map((d, i) => <div key={d} className="vz-rt"><i>{ic[i]}</i><b>{d}</b>{i < 3 && <span>→</span>}</div>)}</div>
    </div>
  )
}

/** Anel do Método 20K: 4 pilares em volta do "20K" */
export function RingViz({ lang }: { lang: Lang }) {
  const t = L[lang]
  const c = ['#a78bfa', '#60a5fa', '#34d399', '#fbbf24']
  const R = 74, C = 2 * Math.PI * R, seg = C / 4 - 8
  return (
    <svg viewBox="-80 0 420 260" className="vz-ring" role="img" aria-label="20K">
      <defs><radialGradient id="vzr" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#7c3aed" stopOpacity=".35" /><stop offset="1" stopColor="#7c3aed" stopOpacity="0" /></radialGradient></defs>
      <circle cx="130" cy="130" r="120" fill="url(#vzr)" />
      {c.map((col, i) => <circle key={i} cx="130" cy="130" r={R} fill="none" stroke={col} strokeWidth="16" strokeLinecap="round" strokeDasharray={`${seg} ${C - seg}`} transform={`rotate(${-90 + i * 90 + 4} 130 130)`} />)}
      <text x="130" y="128" textAnchor="middle" fontSize="46" fontWeight="900" fill="#fff">20K</text>
      <text x="130" y="152" textAnchor="middle" fontSize="12" letterSpacing="3" fill="#b3bdd3">{t.ringC}</text>
      {[-45, 45, 135, 225].map((deg, i) => {
        const rad = (deg * Math.PI) / 180
        const x = 130 + Math.cos(rad) * 104, y = 130 + Math.sin(rad) * 104 + 4
        return <text key={i} x={x} y={y} textAnchor={Math.cos(rad) > 0 ? 'start' : 'end'} fontSize="15" fontWeight="800" fill={c[i]}>{t.ring[i]}</text>
      })}
    </svg>
  )
}
