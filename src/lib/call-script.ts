/**
 * ROTEIRO DE LIGAÇÃO (Fase 1 do apoio de venda — 2026-08-08).
 *
 * O corretor liga pelo softphone e segue um script de vendas por ETAPAS ao lado da
 * ligação: cada etapa tem objetivo, as falas prontas e o gatilho pra avançar. A ideia
 * é que qualquer atendente conduza a conversa até o fim sem se perder.
 *
 * OPT-IN: desligado por padrão. Cada corretor ativa em Configurações — decisão do
 * dono (2026-08-08): "eu tenho que aceitar se eu quero ou não quero esse apoio".
 *
 * O roteiro vive em settings (key `call_script:<buyerId>`) — sem migration, seguindo
 * o padrão de nl_agent/policies_access. `{{nome}}` nas falas vira o nome do lead.
 *
 * Fase 2 (não construída): transcrição ao vivo + detecção automática de etapa.
 */

export interface EtapaScript {
  id: string
  titulo: string
  /** o que esta etapa precisa conseguir antes de avançar */
  objetivo: string
  /** falas prontas, na ordem — `{{nome}}` é substituído pelo nome do lead */
  falas: string[]
  /** momentos de ESCUTAR (o corretor cala e deixa o cliente falar) */
  escutas?: string[]
  /** o que indica que dá pra ir pra próxima etapa */
  gatilho?: string
}

export interface CallScript {
  nome: string
  etapas: EtapaScript[]
  updated_at?: string
}

export const aplicarNome = (texto: string, nome?: string | null) =>
  texto.replace(/\{\{nome\}\}/g, (nome || '').trim().split(' ')[0] || 'cliente')

/** Roteiro padrão — IUL, fornecido pelo dono em 08/08/2026 (docx traduzido PT-BR). */
export const SCRIPT_IUL_PADRAO: CallScript = {
  nome: 'Venda IUL (padrão)',
  etapas: [
    {
      id: 'abertura',
      titulo: 'Quebrar o gelo e abrir a ligação',
      objetivo: 'Criar conexão e levantar idade + saúde',
      falas: [
        'Que bom ouvir isso, fico muito feliz.',
        'Bom, {{nome}}, para que eu possa lhe passar todas as informações, me conte: o que mais chamou a sua atenção no anúncio?',
        'Sim, sim, 100%. Eu estou justamente aqui para esclarecer todas as suas dúvidas e fazer uma consultoria o mais personalizada possível.',
        'Para isso, me conte, por favor: qual é a sua idade atualmente? E como está a sua saúde?',
      ],
      escutas: ['Depois do "o que chamou sua atenção?" — deixe falar', 'Idade e saúde — anote'],
      gatilho: 'Cliente contou idade e como está de saúde',
    },
    {
      id: 'apresentacao',
      titulo: 'Apresentar o IUL e a acumulação',
      objetivo: 'Explicar a conta de acumulação e a diferença pro banco',
      falas: [
        'Perfeito, {{nome}}, fico feliz que você esteja bem de saúde.',
        'O IUL tem três benefícios principais. O primeiro, e o que mais chama a atenção, é a parte da acumulação de dinheiro.',
        'Parte do valor que você vai contribuir vai diretamente para uma conta de acumulação vinculada a um índice do mercado, e pode crescer acompanhando esse índice, normalmente entre 9% e 15% ao ano.',
        'Aqui está a grande diferença em relação ao banco: quando você coloca dinheiro no banco, ele quase não cresce; o máximo que um banco costuma pagar fica em torno de 0,3%.',
        'Com qual banco você trabalha atualmente?',
        'Claro, esse banco também não paga muito. Então, com o IUL, o seu dinheiro cresce com juros compostos: você recebe juros sobre os juros.',
        'E o mais importante: se o mercado cair, o valor creditado na sua conta não acompanha diretamente essa queda. O que você já acumulou permanece ali e, quando o índice volta a subir, o seu dinheiro pode retomar o crescimento.',
      ],
      escutas: ['Qual banco usa — responda com empatia'],
      gatilho: 'Cliente entendeu a acumulação',
    },
    {
      id: 'primeiro-plano',
      titulo: 'Validar se é o primeiro plano',
      objetivo: 'Reforçar a decisão e elogiar o momento',
      falas: [
        '{{nome}}, deixa eu te perguntar: esse seria o seu primeiro plano de acumulação e proteção financeira?',
        'Muito bem, isso diz muito sobre você. Você é uma pessoa responsável e está começando em uma idade muito boa.',
      ],
      escutas: ['Escute e reforce'],
      gatilho: 'Respondeu sobre o primeiro plano',
    },
    {
      id: 'protecao',
      titulo: 'Proteção em vida (doença/acidente)',
      objetivo: 'Living benefits + puxar família/filhos',
      falas: [
        'Além da acumulação, se o plano for aprovado, você também poderá ter proteção em vida, conforme os benefícios e riders previstos na apólice.',
        'Caso, Deus não permita, você venha a sofrer um acidente ou tenha uma doença crítica, crônica ou terminal elegível, a apólice pode disponibilizar benefícios em vida, de acordo com os termos e limites contratados.',
        'É como ter uma proteção financeira de emergência, caso algo grave impeça você de continuar trabalhando.',
        'Como você se sentiria sabendo que possui uma proteção financeira disponível para situações graves?',
        'Claro, a gente se sente muito mais tranquilo. Imagino que você tenha responsabilidades financeiras em casa. Você tem filhos?',
        'Os filhos nunca deixam de ser nossos protegidos, não é mesmo? Então, se alguma coisa acontecer com você, em vez de deixar uma carga financeira para a sua família, você pode deixar uma proteção financeira.',
        'E, em caso de falecimento, o benefício por morte previsto na apólice é destinado aos beneficiários indicados. Ou seja, desde agora você também pode deixá-los protegidos.',
      ],
      escutas: ['"Como você se sentiria..." — deixe responder (ex.: "mais tranquila") e reforce', 'Tem filhos? — anote'],
      gatilho: 'Falou da família e reagiu à proteção',
    },
    {
      id: 'duvidas',
      titulo: 'Fechar a explicação e qualificar',
      objetivo: 'Checar entendimento e preparar a qualificação',
      falas: [
        'Bom, {{nome}}, basicamente é assim que o IUL funciona: acumulação de valor, proteção em vida conforme a apólice e proteção para os seus beneficiários.',
        'Me conta: o programa está fazendo sentido para você? Que dúvidas você tem até agora?',
        'Perfeito. Agora, o objetivo desta ligação é verificar a sua qualificação, porque nem todo mundo é aprovado.',
        'Precisamos preencher uma solicitação e enviá-la para que a seguradora analise o seu caso e determine se você é elegível para o programa.',
        'Você comentou comigo que está bem de saúde e que não está tomando nenhum medicamento forte, correto?',
        'Você é cidadã, residente ou está em processo?',
      ],
      escutas: ['Dúvidas — responda todas antes de seguir', 'Status migratório — anote'],
      gatilho: 'Dúvidas respondidas + saúde e status confirmados',
    },
    {
      id: 'credenciais',
      titulo: 'Enviar credenciais',
      objetivo: 'Gerar confiança com identificação e licença',
      falas: [
        'O próximo passo é que eu vou lhe enviar as minhas credenciais profissionais, para que você saiba com quem está falando, e depois vamos passar para os números.',
        'Acabei de enviar a minha identificação e a minha licença profissional do estado. Por favor, me confirme quando receber.',
      ],
      escutas: ['Aguarde a confirmação de recebimento'],
      gatilho: 'Cliente confirmou que recebeu',
    },
    {
      id: 'orcamento',
      titulo: 'Orçamento e valor da contribuição',
      objetivo: 'Chegar a UM valor mensal confortável (5–10% da renda)',
      falas: [
        'Perfeito, {{nome}}. Agora sim, vamos fazer os números.',
        'Eu normalmente aconselho meus clientes a avaliar uma contribuição entre 5% e 10% da renda mensal, desde que seja confortável no orçamento.',
        'Quanto você ganha por mês, aproximadamente? Não precisa ser exato; é apenas para fazermos uma estimativa.',
        'Entre esses dois valores, com qual quantia você se sentiria mais confortável, entendendo que esse planejamento é de longo prazo?',
        'Se tivesse que escolher apenas um valor para começar, com qual você se sentiria confortável?',
        'É melhor começar com um valor sustentável — por exemplo US$ 120 ou US$ 150 — e fazer ajustes com planejamento quando a situação melhorar.',
      ],
      escutas: ['Renda mensal — calcule 5% e 10% em voz alta', 'Deixe o cliente ESCOLHER o valor'],
      gatilho: 'Valor mensal definido pelo cliente',
    },
    {
      id: 'simulador',
      titulo: 'Mostrar a tela e a ilustração',
      objetivo: 'Cliente vendo a projeção junto com você',
      falas: [
        'Acabei de enviar uma mensagem de texto com um link para você visualizar a minha tela e fazermos os números juntos. Me avise quando conseguir entrar.',
        'Muito bem, já vejo que você está conectada. Com esses valores mensais, a ilustração mostra a proteção inicial — vamos conferir exatamente qual seria o valor disponível e em quais condições.',
        'Como você se sente com esse nível de proteção?',
        'Também quero que você veja como o valor da apólice pode evoluir ao longo do tempo, acompanhando um índice como o S&P 500, conforme a estratégia da apólice.',
        'É importante observar na ilustração as taxas, caps, floors e valores garantidos e não garantidos.',
      ],
      escutas: ['Aguarde entrar no link', 'Reação à proteção — reforce'],
      gatilho: 'Cliente viu a ilustração',
    },
    {
      id: 'fechamento',
      titulo: 'Fechamento para a solicitação',
      objetivo: 'Transformar o interesse em aplicação enviada',
      falas: [
        'No ano 5, a projeção mostra o acumulado aqui na tela; no ano 10, este valor. Esses números são projeções e podem variar conforme o índice e as condições da apólice.',
        'Até aqui, os números estão fazendo sentido para você? Tem alguma pergunta?',
        'Fico feliz que esteja fazendo sentido. O mais importante agora é que a seguradora analise a solicitação e determine a sua elegibilidade, porque nem todo mundo é aprovado para um IUL.',
        'Eu estou aqui para ajudar você durante esse processo. O próximo passo é preencher a solicitação com os seus dados e enviá-la para análise.',
        'Vamos completar agora as suas informações básicas.',
      ],
      escutas: ['Última rodada de dúvidas'],
      gatilho: 'Cliente topou preencher a aplicação → aba Forms do lead',
    },
  ],
}
