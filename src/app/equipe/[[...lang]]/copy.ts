/**
 * Texto da página pública de recrutamento (/equipe · /equipe/en · /equipe/es).
 * Afirmações dadas pelo dono (03/11/2026): outras agências começam em 45% de comissão; Lead4Pro a partir de 65%;
 * CRM próprio mais avançado do mercado para Life Insurance; leads qualificados com subsídio para a equipe;
 * treinamento diário e acompanhamento; Método 20K ($20K/mês). Números de operação vêm da home (public/nova).
 * Sem preço de lead e sem promessa de ganho — ver os avisos (disc).
 */
export type Lang = 'pt' | 'en' | 'es'
type Item = { i: string; h: string; p: string }

export interface Copy {
  title: string; desc: string; cta: string; wa: string; navCta: string
  kicker: string; h1a: string; h1b: string; sub: string; chips: string[]; stats: { n: string; l: string }[]
  cmpK: string; cmpH: string; cmpSub: string
  othersT: string; othersBig: string; othersP: string; othersList: string[]
  usT: string; usBig: string; usP: string; usList: string[]
  calc: { h: string; sub: string; label: string; others: string; us: string; month: string; year: string; disc: string }
  crmK: string; crmH: string; crmSub: string; feats: Item[]
  mock: { tag: string; cols: string[]; cards: { n: string; w: string; col: number }[]; ill: string }
  ai: { h: string; p: string; said: string; says: string; sug: string; ill: string }
  leadsK: string; leadsH: string; leadsSub: string; leads: Item[]
  trK: string; trH: string; trSub: string; tr: Item[]
  mK: string; mH: string; mSub: string; formula: string[]; mDisc: string
  howH: string; how: string[]
  finalH: string; finalSub: string; note: string; privacy: string; disc: string
  other: { href: string; label: string }[]
}

export const COPY: Record<Lang, Copy> = {
  pt: {
    title: 'Venha para o time Lead4Pro',
    desc: 'Comissão a partir de 65%, o CRM mais avançado para Life Insurance, leads qualificados com subsídio para a equipe, treinamento diário e o Método 20K.',
    cta: 'Quero conversar agora', navCta: 'Falar com a gente',
    wa: 'Olá! Vi a página da equipe Lead4Pro e quero conhecer os benefícios.',
    kicker: 'PARA AGENTES DE LIFE INSURANCE',
    h1a: 'Outras agências começam em 45%.', h1b: 'Aqui você começa em 65%.',
    sub: 'Mais comissão no seu bolso, o CRM mais avançado do mercado, leads qualificados com subsídio da casa e treinamento todos os dias para você chegar nos $20K por mês.',
    chips: ['Comissão a partir de 65%', 'CRM + IA na ligação', 'Leads com preço de equipe', 'Método 20K'],
    stats: [{ n: '65%+', l: 'comissão desde o primeiro dia' }, { n: '2.300+', l: 'clientes entregues, um a um' }, { n: '32.000+', l: 'conversas de WhatsApp' }, { n: '2.400+', l: 'ligações em 1 clique, gravadas' }],
    cmpK: 'O COMPARATIVO', cmpH: 'A mesma venda. Uma comissão bem maior.', cmpSub: 'A diferença não é detalhe: é dinheiro que fica com você em toda apólice que você fecha.',
    othersT: 'Outras agências', othersBig: '45%', othersP: 'é onde a comissão costuma começar',
    othersList: ['Comissão inicial a partir de 45%', 'CRM, leads e treinamento: variam de agência para agência'],
    usT: 'Time Lead4Pro', usBig: '65%+', usP: 'de comissão desde o começo',
    usList: ['Comissão a partir de 65%', 'CRM próprio, feito para Life Insurance', 'Leads qualificados com subsídio da casa', 'Treinamento diário e acompanhamento', 'Método 20K para toda a equipe'],
    calc: { h: 'Faça a conta', sub: 'Arraste e veja quanto a diferença de comissão vale no seu mês.', label: 'Comissão bruta gerada por mês (paga pela seguradora)', others: 'Agência com 45%', us: 'Lead4Pro com 65%', month: 'a mais por mês', year: 'a mais por ano', disc: 'Simulação aritmética (65% menos 45% da comissão bruta). Não é promessa de resultado.' },
    crmK: 'O CRM', crmH: 'O CRM mais avançado e eficiente do mercado para quem vende Life Insurance.', crmSub: 'Não é planilha nem sistema genérico. É uma máquina inteira de vendas, em português, inglês e espanhol, que já trabalha para você.',
    feats: [
      { i: '📊', h: 'Sala de comando', p: 'Sua carteira numa tela: quem esquentou, quem parou, quem fecha essa semana.' },
      { i: '📋', h: 'Pipeline visual', p: 'Cada cliente na etapa certa, do primeiro contato até a apólice.' },
      { i: '💬', h: 'WhatsApp integrado', p: 'Seu número conectado, cada conversa grudada no cliente certo, do computador ou do celular.' },
      { i: '📞', h: 'Telefone dentro do sistema', p: 'Ligação em 1 clique, com número local do cliente, gravação e registro automático.' },
      { i: '🤖', h: 'IA na ligação', p: 'Escuta a conversa e sugere a resposta na hora da objeção. Você decide o que falar.' },
      { i: '📜', h: 'Roteiro passo a passo', p: 'O script andando do lado durante a ligação. Nunca mais travar.' },
      { i: '🔁', h: 'Follow-up automático', p: 'Sequências por WhatsApp, SMS e e-mail que cobram, lembram e confirmam por você.' },
      { i: '⚡', h: 'Automações e modelos', p: 'Mensagens prontas e regras que trabalham sozinhas enquanto você vende.' },
      { i: '📅', h: 'Agenda com confirmação', p: 'Reunião marcada vira confirmação e lembrete automáticos. Menos bolo.' },
      { i: '🛡️', h: 'Gestão de apólices', p: 'Depois da venda, acompanha a apólice e avisa antes de virar problema.' },
      { i: '🧑‍🏫', h: 'Especialista de IA 24/7', p: 'Dúvida de produto às 22h? Pergunta em português e a resposta vem em segundos.' },
      { i: '🧮', h: 'Calculadora e notas', p: 'Faça a conta com o cliente e registre tudo na mesma ficha.' },
    ],
    mock: { tag: 'Pipeline', cols: ['Novo cliente', 'Contatado', 'Cotação', 'Fechado'], cards: [{ n: 'Mariana S.', w: 'Orlando, FL', col: 0 }, { n: 'Roberto L.', w: 'Tampa, FL', col: 0 }, { n: 'Carlos F.', w: 'Miami, FL', col: 1 }, { n: 'Família Duarte', w: 'Boca Raton, FL', col: 2 }, { n: 'Paulo M.', w: 'Kissimmee, FL', col: 3 }], ill: 'Ilustração com nomes fictícios' },
    ai: { h: 'A IA que sopra a resposta na hora certa', p: 'O cliente diz “tá caro”. A resposta aparece na sua tela, dentro do seu roteiro. Um gerente experiente ao seu lado em todas as ligações.', said: 'Cliente', says: '“Gostei, mas achei caro. Não sei se cabe agora.”', sug: 'IA sugere: “Entendo. Por menos de $5 por dia, sua família não fica desprotegida. Posso te mostrar como cabe no seu orçamento?”', ill: 'Cenário ilustrativo da mecânica' },
    leadsK: 'OS LEADS', leadsH: 'Os leads mais qualificados do mercado, com enorme subsídio para a nossa equipe.', leadsSub: 'Quem está no time compra leads com preço diferenciado. A casa banca boa parte do custo para você vender mais e gastar menos.',
    leads: [
      { i: '🎯', h: 'Lead único', p: 'Cada lead vai para um agente. Não é revendido nem dividido com outros.' },
      { i: '⚡', h: 'Chega em minutos', p: 'Do pedido de cotação ao seu pipeline em minutos, com aviso no seu WhatsApp.' },
      { i: '🗺️', h: 'Respeita sua licença', p: 'A distribuição considera o seu estado e o seu horário de atendimento.' },
      { i: '💸', h: 'Preço de equipe', p: 'Enorme subsídio para o time. Os valores são passados na conversa.' },
    ],
    trK: 'TREINAMENTO E ACOMPANHAMENTO', trH: 'Você não aprende sozinho, por tentativa e erro.', trSub: 'Muita gente desiste porque ninguém ensina o caminho. Aqui tem treino todos os dias e alguém olhando o seu resultado.',
    tr: [
      { i: '🎓', h: 'Treinamento diário', p: 'Prática todos os dias: abordagem, objeções, fechamento e rotina de vendas.' },
      { i: '👀', h: 'Acompanhamento de perto', p: 'Alguém da equipe acompanha os seus números e te ajuda a corrigir a rota.' },
      { i: '📚', h: 'Biblioteca de aulas', p: 'Curso dentro da plataforma, organizado por temas, para rever quando quiser.' },
      { i: '🏆', h: 'Comunidade e ranking', p: 'Time de agentes, ranking mensal e vitórias reais todo dia. Você nunca vende sozinho.' },
    ],
    mK: 'MÉTODO 20K', mH: 'Toda a nossa equipe é treinada para faturar $20K por mês.', mSub: 'O Método 20K junta tudo o que você viu aqui em uma rotina: lead qualificado, CRM trabalhando por você, treino diário e acompanhamento.',
    formula: ['Leads qualificados', 'CRM + IA', 'Treino diário', 'Acompanhamento', 'Método 20K'],
    mDisc: 'O Método 20K é o treinamento da equipe. Os resultados dependem do esforço e da rotina de cada agente e não são garantidos.',
    howH: 'Como entrar no time', how: ['Você fala com a gente, sem compromisso.', 'Explicamos as condições da equipe e como começar.', 'Você ganha acesso ao CRM, aos leads com preço de equipe e ao treinamento.'],
    finalH: 'Pronto para ganhar mais por cada apólice?', finalSub: 'Chame no WhatsApp. A conversa é rápida e sem compromisso.',
    note: 'Condições detalhadas, incluindo seguradoras e valores dos leads, são passadas na conversa.',
    privacy: 'Privacidade', disc: 'Comparativo baseado na comissão inicial praticada pelas agências citadas como “outras agências”. Condições da equipe Lead4Pro sujeitas às regras de cada seguradora.',
    other: [{ href: '/equipe/en', label: 'English' }, { href: '/equipe/es', label: 'Español' }],
  },
  en: {
    title: 'Join the Lead4Pro team',
    desc: 'Commission starting at 65%, the most advanced CRM for life insurance, qualified leads with a big team subsidy, daily training and the 20K Method.',
    cta: 'Let’s talk now', navCta: 'Talk to us',
    wa: 'Hi! I saw the Lead4Pro team page and I want to learn about the benefits.',
    kicker: 'FOR LIFE INSURANCE AGENTS',
    h1a: 'Other agencies start at 45%.', h1b: 'Here you start at 65%.',
    sub: 'More commission in your pocket, the most advanced CRM on the market, qualified leads with a house subsidy, and daily training to get you to $20K a month.',
    chips: ['Commission from 65%', 'CRM + AI on the call', 'Team pricing on leads', '20K Method'],
    stats: [{ n: '65%+', l: 'commission from day one' }, { n: '2,300+', l: 'clients delivered, one by one' }, { n: '32,000+', l: 'WhatsApp conversations' }, { n: '2,400+', l: 'one-click calls, recorded' }],
    cmpK: 'THE COMPARISON', cmpH: 'Same sale. A much bigger commission.', cmpSub: 'The gap is not a detail: it is money that stays with you on every policy you close.',
    othersT: 'Other agencies', othersBig: '45%', othersP: 'is where commission usually starts',
    othersList: ['Starting commission from 45%', 'CRM, leads and training: vary by agency'],
    usT: 'Lead4Pro team', usBig: '65%+', usP: 'commission from the start',
    usList: ['Commission starting at 65%', 'Our own CRM, built for life insurance', 'Qualified leads with a house subsidy', 'Daily training and coaching', '20K Method for the whole team'],
    calc: { h: 'Do the math', sub: 'Drag and see what the commission gap is worth in your month.', label: 'Gross commission generated per month (paid by the carrier)', others: 'Agency at 45%', us: 'Lead4Pro at 65%', month: 'more per month', year: 'more per year', disc: 'Arithmetic simulation (65% minus 45% of gross commission). Not a promise of results.' },
    crmK: 'THE CRM', crmH: 'The most advanced and efficient CRM on the market for life insurance professionals.', crmSub: 'Not a spreadsheet and not a generic tool. A full sales machine, in English, Portuguese and Spanish, already working for you.',
    feats: [
      { i: '📊', h: 'Command center', p: 'Your book on one screen: who heated up, who stalled, who closes this week.' },
      { i: '📋', h: 'Visual pipeline', p: 'Every client in the right stage, from first contact to policy.' },
      { i: '💬', h: 'Built-in WhatsApp', p: 'Your number connected, each conversation attached to the right client, from desktop or phone.' },
      { i: '📞', h: 'Phone inside the system', p: 'One-click calling with a local number, recording and automatic logging.' },
      { i: '🤖', h: 'AI on the call', p: 'Listens and suggests the answer at the moment of the objection. You decide what to say.' },
      { i: '📜', h: 'Step-by-step script', p: 'The script walks along during the call. Never freeze again.' },
      { i: '🔁', h: 'Automatic follow-up', p: 'WhatsApp, SMS and email sequences that chase, remind and confirm for you.' },
      { i: '⚡', h: 'Automations and templates', p: 'Ready messages and rules that work on their own while you sell.' },
      { i: '📅', h: 'Calendar with confirmation', p: 'A booked meeting becomes an automatic confirmation and reminder. Fewer no-shows.' },
      { i: '🛡️', h: 'Policy management', p: 'After the sale, it tracks the policy and warns you before it becomes a problem.' },
      { i: '🧑‍🏫', h: 'AI specialist 24/7', p: 'Product question at 10 pm? Ask and get the answer in seconds.' },
      { i: '🧮', h: 'Calculator and notes', p: 'Run the numbers with the client and log everything on the same record.' },
    ],
    mock: { tag: 'Pipeline', cols: ['New client', 'Contacted', 'Quote', 'Closed'], cards: [{ n: 'Mariana S.', w: 'Orlando, FL', col: 0 }, { n: 'Roberto L.', w: 'Tampa, FL', col: 0 }, { n: 'Carlos F.', w: 'Miami, FL', col: 1 }, { n: 'Duarte family', w: 'Boca Raton, FL', col: 2 }, { n: 'Paulo M.', w: 'Kissimmee, FL', col: 3 }], ill: 'Illustration with fictional names' },
    ai: { h: 'The AI that whispers the answer at the right time', p: 'The client says “it’s expensive”. The answer shows up on your screen, inside your script. An experienced manager next to you on every call.', said: 'Client', says: '“I liked it, but it’s expensive. Not sure it fits right now.”', sug: 'AI suggests: “I understand. For less than $5 a day, your family is not left unprotected. Can I show you how it fits your budget?”', ill: 'Illustrative scenario of how it works' },
    leadsK: 'THE LEADS', leadsH: 'The most qualified leads on the market, with a huge subsidy for our team.', leadsSub: 'Team members buy leads at special pricing. The house covers a big part of the cost so you sell more and spend less.',
    leads: [
      { i: '🎯', h: 'One lead, one agent', p: 'Each lead goes to a single agent. Not resold, not split with others.' },
      { i: '⚡', h: 'Arrives in minutes', p: 'From quote request to your pipeline in minutes, with a WhatsApp alert.' },
      { i: '🗺️', h: 'Respects your license', p: 'Distribution takes into account your state and your working hours.' },
      { i: '💸', h: 'Team pricing', p: 'Big subsidy for the team. Prices are shared in the conversation.' },
    ],
    trK: 'TRAINING AND COACHING', trH: 'You don’t learn alone, by trial and error.', trSub: 'Many agents quit because nobody shows the way. Here there is training every day and someone watching your results.',
    tr: [
      { i: '🎓', h: 'Daily training', p: 'Practice every day: approach, objections, closing and sales routine.' },
      { i: '👀', h: 'Close follow-up', p: 'Someone on the team tracks your numbers and helps you correct course.' },
      { i: '📚', h: 'Lesson library', p: 'A course inside the platform, organized by topic, to revisit any time.' },
      { i: '🏆', h: 'Community and ranking', p: 'A team of agents, monthly ranking and real wins every day. You never sell alone.' },
    ],
    mK: '20K METHOD', mH: 'Our whole team is trained to bill $20K a month.', mSub: 'The 20K Method puts everything you saw here into one routine: qualified leads, a CRM working for you, daily training and coaching.',
    formula: ['Qualified leads', 'CRM + AI', 'Daily training', 'Coaching', '20K Method'],
    mDisc: 'The 20K Method is the team’s training program. Results depend on each agent’s effort and routine and are not guaranteed.',
    howH: 'How to join the team', how: ['You talk to us, no commitment.', 'We explain the team terms and how to start.', 'You get access to the CRM, team-priced leads and training.'],
    finalH: 'Ready to earn more on every policy?', finalSub: 'Message us on WhatsApp. The conversation is quick and no commitment.',
    note: 'Full terms, including carriers and lead prices, are shared during the conversation.',
    privacy: 'Privacy', disc: 'Comparison based on the starting commission offered by the agencies referred to as “other agencies”. Lead4Pro team terms are subject to each carrier’s rules.',
    other: [{ href: '/equipe', label: 'Português' }, { href: '/equipe/es', label: 'Español' }],
  },
  es: {
    title: 'Únete al equipo Lead4Pro',
    desc: 'Comisión desde el 65%, el CRM más avanzado para seguros de vida, leads calificados con gran subsidio para el equipo, entrenamiento diario y el Método 20K.',
    cta: 'Quiero hablar ahora', navCta: 'Hablar con nosotros',
    wa: '¡Hola! Vi la página del equipo Lead4Pro y quiero conocer los beneficios.',
    kicker: 'PARA AGENTES DE SEGUROS DE VIDA',
    h1a: 'Otras agencias empiezan en 45%.', h1b: 'Aquí empiezas en 65%.',
    sub: 'Más comisión en tu bolsillo, el CRM más avanzado del mercado, leads calificados con subsidio de la casa y entrenamiento todos los días para llegar a $20K al mes.',
    chips: ['Comisión desde 65%', 'CRM + IA en la llamada', 'Leads con precio de equipo', 'Método 20K'],
    stats: [{ n: '65%+', l: 'comisión desde el primer día' }, { n: '2.300+', l: 'clientes entregados, uno a uno' }, { n: '32.000+', l: 'conversaciones de WhatsApp' }, { n: '2.400+', l: 'llamadas en 1 clic, grabadas' }],
    cmpK: 'EL COMPARATIVO', cmpH: 'La misma venta. Una comisión mucho mayor.', cmpSub: 'La diferencia no es un detalle: es dinero que se queda contigo en cada póliza que cierras.',
    othersT: 'Otras agencias', othersBig: '45%', othersP: 'es donde suele empezar la comisión',
    othersList: ['Comisión inicial desde 45%', 'CRM, leads y entrenamiento: varían según la agencia'],
    usT: 'Equipo Lead4Pro', usBig: '65%+', usP: 'de comisión desde el inicio',
    usList: ['Comisión desde 65%', 'CRM propio, hecho para seguros de vida', 'Leads calificados con subsidio de la casa', 'Entrenamiento diario y acompañamiento', 'Método 20K para todo el equipo'],
    calc: { h: 'Haz la cuenta', sub: 'Arrastra y mira cuánto vale la diferencia de comisión en tu mes.', label: 'Comisión bruta generada por mes (pagada por la aseguradora)', others: 'Agencia con 45%', us: 'Lead4Pro con 65%', month: 'más por mes', year: 'más por año', disc: 'Simulación aritmética (65% menos 45% de la comisión bruta). No es promesa de resultados.' },
    crmK: 'EL CRM', crmH: 'El CRM más avanzado y eficiente del mercado para profesionales de seguros de vida.', crmSub: 'No es una hoja de cálculo ni un sistema genérico. Es una máquina de ventas completa, en español, inglés y portugués, que ya trabaja para ti.',
    feats: [
      { i: '📊', h: 'Sala de mando', p: 'Tu cartera en una pantalla: quién se calentó, quién se detuvo, quién cierra esta semana.' },
      { i: '📋', h: 'Pipeline visual', p: 'Cada cliente en la etapa correcta, del primer contacto a la póliza.' },
      { i: '💬', h: 'WhatsApp integrado', p: 'Tu número conectado y cada conversación pegada al cliente correcto, desde la computadora o el celular.' },
      { i: '📞', h: 'Teléfono dentro del sistema', p: 'Llamada en 1 clic, con número local, grabación y registro automático.' },
      { i: '🤖', h: 'IA en la llamada', p: 'Escucha y sugiere la respuesta en el momento de la objeción. Tú decides qué decir.' },
      { i: '📜', h: 'Guion paso a paso', p: 'El guion avanza a tu lado durante la llamada. Nunca más te bloqueas.' },
      { i: '🔁', h: 'Seguimiento automático', p: 'Secuencias por WhatsApp, SMS y correo que cobran, recuerdan y confirman por ti.' },
      { i: '⚡', h: 'Automatizaciones y plantillas', p: 'Mensajes listos y reglas que trabajan solas mientras vendes.' },
      { i: '📅', h: 'Agenda con confirmación', p: 'La reunión agendada genera confirmación y recordatorio automáticos. Menos plantones.' },
      { i: '🛡️', h: 'Gestión de pólizas', p: 'Después de la venta, vigila la póliza y te avisa antes de que sea un problema.' },
      { i: '🧑‍🏫', h: 'Especialista de IA 24/7', p: '¿Duda de producto a las 10 pm? Pregunta y recibe la respuesta en segundos.' },
      { i: '🧮', h: 'Calculadora y notas', p: 'Haz la cuenta con el cliente y registra todo en la misma ficha.' },
    ],
    mock: { tag: 'Pipeline', cols: ['Nuevo cliente', 'Contactado', 'Cotización', 'Cerrado'], cards: [{ n: 'Mariana S.', w: 'Orlando, FL', col: 0 }, { n: 'Roberto L.', w: 'Tampa, FL', col: 0 }, { n: 'Carlos F.', w: 'Miami, FL', col: 1 }, { n: 'Familia Duarte', w: 'Boca Raton, FL', col: 2 }, { n: 'Paulo M.', w: 'Kissimmee, FL', col: 3 }], ill: 'Ilustración con nombres ficticios' },
    ai: { h: 'La IA que te sopla la respuesta en el momento justo', p: 'El cliente dice “está caro”. La respuesta aparece en tu pantalla, dentro de tu guion. Un gerente con experiencia a tu lado en cada llamada.', said: 'Cliente', says: '“Me gustó, pero me parece caro. No sé si me conviene ahora.”', sug: 'IA sugiere: “Entiendo. Por menos de $5 al día, tu familia no queda desprotegida. ¿Te muestro cómo cabe en tu presupuesto?”', ill: 'Escenario ilustrativo de cómo funciona' },
    leadsK: 'LOS LEADS', leadsH: 'Los leads más calificados del mercado, con un enorme subsidio para nuestro equipo.', leadsSub: 'Quien está en el equipo compra leads con precio diferenciado. La casa cubre buena parte del costo para que vendas más y gastes menos.',
    leads: [
      { i: '🎯', h: 'Un lead, un agente', p: 'Cada lead va a un solo agente. No se revende ni se comparte.' },
      { i: '⚡', h: 'Llega en minutos', p: 'De la solicitud de cotización a tu pipeline en minutos, con aviso en tu WhatsApp.' },
      { i: '🗺️', h: 'Respeta tu licencia', p: 'La distribución considera tu estado y tu horario de atención.' },
      { i: '💸', h: 'Precio de equipo', p: 'Gran subsidio para el equipo. Los valores se explican en la conversación.' },
    ],
    trK: 'ENTRENAMIENTO Y ACOMPAÑAMIENTO', trH: 'No aprendes solo, a prueba y error.', trSub: 'Muchos abandonan porque nadie les enseña el camino. Aquí hay entrenamiento todos los días y alguien mirando tus resultados.',
    tr: [
      { i: '🎓', h: 'Entrenamiento diario', p: 'Práctica todos los días: abordaje, objeciones, cierre y rutina de ventas.' },
      { i: '👀', h: 'Acompañamiento cercano', p: 'Alguien del equipo sigue tus números y te ayuda a corregir el rumbo.' },
      { i: '📚', h: 'Biblioteca de clases', p: 'Curso dentro de la plataforma, organizado por temas, para repasar cuando quieras.' },
      { i: '🏆', h: 'Comunidad y ranking', p: 'Equipo de agentes, ranking mensual y victorias reales cada día. Nunca vendes solo.' },
    ],
    mK: 'MÉTODO 20K', mH: 'Todo nuestro equipo se entrena para facturar $20K al mes.', mSub: 'El Método 20K junta todo lo que viste aquí en una rutina: lead calificado, CRM trabajando por ti, entrenamiento diario y acompañamiento.',
    formula: ['Leads calificados', 'CRM + IA', 'Entrenamiento diario', 'Acompañamiento', 'Método 20K'],
    mDisc: 'El Método 20K es el programa de entrenamiento del equipo. Los resultados dependen del esfuerzo y la rutina de cada agente y no están garantizados.',
    howH: 'Cómo entrar al equipo', how: ['Hablas con nosotros, sin compromiso.', 'Te explicamos las condiciones del equipo y cómo empezar.', 'Recibes acceso al CRM, a los leads con precio de equipo y al entrenamiento.'],
    finalH: '¿Listo para ganar más por cada póliza?', finalSub: 'Escríbenos por WhatsApp. La conversación es rápida y sin compromiso.',
    note: 'Las condiciones detalladas, incluyendo aseguradoras y valores de los leads, se explican en la conversación.',
    privacy: 'Privacidad', disc: 'Comparativo basado en la comisión inicial que ofrecen las agencias referidas como “otras agencias”. Las condiciones del equipo Lead4Pro están sujetas a las reglas de cada aseguradora.',
    other: [{ href: '/equipe', label: 'Português' }, { href: '/equipe/en', label: 'English' }],
  },
}
