/** Replace {var} placeholders in template body with actual values */

interface Lead {
  name?: string | null
  phone?: string | null
  email?: string | null
  state?: string | null
  interest?: string | null
  city?: string | null
}

interface Agent {
  name?: string | null
  email?: string | null
  phone?: string | null
}

export function renderTemplate(body: string, lead: Lead, agent: Agent): string {
  const firstName = (lead.name || '').split(' ')[0] || ''
  const vars: Record<string, string> = {
    nome: lead.name || '',
    primeiro_nome: firstName,
    telefone: lead.phone || '',
    email: lead.email || '',
    estado: lead.state || '',
    cidade: lead.city || '',
    interesse: lead.interest || 'seguro de vida',
    agente: agent.name || '',
    agente_primeiro_nome: (agent.name || '').split(' ')[0] || '',
    agente_email: agent.email || '',
    agente_telefone: agent.phone || '',
    // apelidos comuns que os corretores escrevem
    primeironome: firstName,
    nome_completo: lead.name || '',
    cliente: firstName,
    lead: firstName,
  }

  // TOLERANTE COM O JEITO QUE CADA CORRETOR ESCREVE (caso Aroldo, 2026-08-10):
  // o formato oficial é {primeiro_nome}, mas foram pro CLIENTE mensagens com
  // "[primeiro_nome]", "(primeiro-nome)" e "{Primeiro Nome}" cruas — o código
  // aparecia na tela do segurado. Agora {x}, {{x}}, [x] e (x) funcionam, com
  // hífen/espaço/acento/maiúscula normalizados. Palavra desconhecida entre
  // parênteses fica intacta — prosa normal não é tocada.
  const normalizar = (k: string) => k.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/[\s-]+/g, '_')
  return body.replace(
    /\{\{\s*([a-zA-ZÀ-ú][a-zA-ZÀ-ú _-]{1,30})\s*\}\}|\{\s*([a-zA-ZÀ-ú][a-zA-ZÀ-ú _-]{1,30})\s*\}|\[\s*([a-zA-ZÀ-ú][a-zA-ZÀ-ú _-]{1,30})\s*\]|\(\s*([a-zA-ZÀ-ú][a-zA-ZÀ-ú _-]{1,30})\s*\)/g,
    (m, a, b, c, d) => {
      const key = normalizar(a || b || c || d || '')
      return key in vars ? vars[key] : m
    })
}

export const AVAILABLE_VARS = [
  { key: '{nome}', desc: 'Nome completo do lead' },
  { key: '{primeiro_nome}', desc: 'Primeiro nome do lead' },
  { key: '{telefone}', desc: 'Telefone do lead' },
  { key: '{email}', desc: 'Email do lead' },
  { key: '{estado}', desc: 'Estado (FL, TX, etc)' },
  { key: '{cidade}', desc: 'Cidade' },
  { key: '{interesse}', desc: 'Interesse do lead' },
  { key: '{agente}', desc: 'Seu nome' },
  { key: '{agente_primeiro_nome}', desc: 'Seu primeiro nome' },
  { key: '{agente_email}', desc: 'Seu email' },
  { key: '{agente_telefone}', desc: 'Seu telefone' },
]
