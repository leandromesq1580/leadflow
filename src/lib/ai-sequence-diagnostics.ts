export const generationErrors = {
  AI_LOCALE_INVALID: {status:400,message:'Idioma não identificado. Escolha português, inglês ou espanhol; no envio automático, revise o idioma do lead.'},
  AI_BRIEF_INVALID: {status:400,message:'Brief ou apresentação inválidos: use contexto comercial e seu próprio jeito de se apresentar, sem dados de leads, contatos, credenciais, promessas ou instruções ao sistema.'},
  AI_INSTRUCTIONS_INVALID: {status:400,message:'Instruções inválidas: remova contatos e dados privados de leads. Use apenas orientações gerais de propósito, abordagem e tom.'},
  AI_KEY_MISSING: {status:503,message:'Geração IA indisponível: peça ao administrador para configurar a chave OpenAI.'},
  AI_PROVIDER_AUTH: {status:503,message:'A OpenAI recusou a credencial. Peça ao administrador para revisar a chave.'},
  AI_PROVIDER_FORBIDDEN: {status:503,message:'A OpenAI bloqueou o acesso. Peça ao administrador para revisar as permissões do projeto e do modelo.'},
  AI_MODEL_UNAVAILABLE: {status:503,message:'O modelo escolhido não está disponível para esta conta. Escolha outro modelo ou peça ao administrador para verificar o acesso.'},
  AI_QUOTA_EXCEEDED: {status:503,message:'A cota da OpenAI foi esgotada. Peça ao administrador para revisar créditos e limites de uso.'},
  AI_RATE_LIMITED: {status:429,message:'O limite temporário da OpenAI foi atingido. Aguarde um pouco antes de tentar novamente.'},
  AI_PROVIDER_REQUEST: {status:502,message:'A OpenAI recusou os parâmetros da geração. Avise o suporte para revisar a integração do modelo.'},
  AI_PROVIDER_UNAVAILABLE: {status:503,message:'A OpenAI está temporariamente indisponível. Tente novamente mais tarde.'},
  AI_NETWORK_ERROR: {status:503,message:'Não foi possível conectar à OpenAI. Tente novamente mais tarde.'},
  AI_TIMEOUT: {status:504,message:'A geração excedeu o tempo limite. Tente novamente; se persistir, escolha outro modelo.'},
  AI_BAD_JSON: {status:502,message:'A IA retornou JSON inválido. Gere outro exemplo; se persistir, avise o suporte.'},
  AI_INVALID_TEXT: {status:502,message:'Resposta IA inválida: o texto não passou nas verificações de formato, idioma ou segurança. Revise o brief comercial e gere outro exemplo.'},
  AI_REPEATED_TEXT: {status:502,message:'Resposta IA repetida. Gere outro exemplo ou revise o brief comercial.'},
  AI_INTERNAL_ERROR: {status:503,message:'Não foi possível gerar o exemplo. Tente novamente; se persistir, avise o suporte.'},
} as const
export const rejectionReasons = ['finish_reason','schema','length','contact_or_markup','claim_or_identity','question_format','goal','multiple_intents','private_data','instruction','language'] as const
export type RejectionReason = typeof rejectionReasons[number]
export type AISequenceErrorCode = keyof typeof generationErrors
const reasonLabels: Record<RejectionReason,string> = {
 finish_reason:'Resposta incompleta.',schema:'Formato inesperado.',length:'Tamanho inválido.',contact_or_markup:'Contato ou marcação não permitidos.',claim_or_identity:'Afirmação ou identidade não permitida.',question_format:'Pergunta final inválida.',goal:'A pergunta final não corresponde ao objetivo.',multiple_intents:'Mais de uma intenção.',private_data:'Dados privados detectados.',instruction:'Instrução indevida no texto.',language:'Idioma não confirmado.',
}
const stopLabels: Record<string,string> = {
 generation_unavailable:'Falha de geração antiga, sem diagnóstico detalhado. Revise a configuração e teste uma prévia.',
 configuration_failed:'Não foi possível validar a configuração. Revise a sequência.',
 bridge_or_rate_unavailable:'WhatsApp indisponível ou limite de envio atingido.',
 outside_window:'Aguardando a janela de atendimento.', delivery_unknown:'Entrega não confirmada. Confira no WhatsApp; não há reenvio automático.',
 retry_exhausted:'Limite de três tentativas atingido. Revisão humana necessária.',
 replied:'Lead respondeu.',optout:'Lead pediu para não receber mensagens.',manual_stop:'Parada manual.',
 sold:'Lead convertido.',stage_exit:'Lead saiu do estágio.',sequence_disabled:'Sequência desativada.',
}
export function enrollmentReason(reason:string|null):string {
 if(!reason)return '—'
 const [code,detail]=reason.split(':')
 if(Object.hasOwn(generationErrors,code)) {
  const explanation=detail && Object.hasOwn(reasonLabels,detail) ? ` ${reasonLabels[detail as RejectionReason]}` : ''
  return generationErrors[code as AISequenceErrorCode].message + explanation + ' Nenhuma mensagem enviada nesta tentativa.'
 }
 return Object.hasOwn(stopLabels,reason) ? stopLabels[reason] : 'Execução interrompida. Revise a inscrição.'
}
