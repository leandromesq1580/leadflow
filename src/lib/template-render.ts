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
  }
  return body.replace(/\{([a-z_]+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
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
