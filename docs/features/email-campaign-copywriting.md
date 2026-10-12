# Voz das campanhas geradas por IA

O gerador usa `src/lib/email-campaign-copywriting.ts` como orientação de sistema. A base foi preparada pelo perfil Copywriter a pedido de Leandro, revisada para as regras do produto e aplicada com autorização explícita. Não é pesquisa de consumidores, validação jurídica ou garantia de conversão.

## Intenção editorial

Transformar a ideia do admin em um email informal, específico e útil para pessoas nos EUA que falam português ou espanhol. Escolher um problema ou objeção e uma pequena ação: continuar pelo WhatsApp. Variar a abertura e o ritmo; não repetir fórmulas como “você sabia”, “descubra as vantagens” ou “ficarei feliz em ajudar”. O espanhol conserva o sentido e os limites sem exigir tradução literal.

Usar, conforme o tema, curiosidade honesta, utilidade antes do convite, objeção explícita e microcompromisso. Aluguel, hipoteca e continuidade das despesas são contextos possíveis, não informações sobre o destinatário. Seguro genérico não permite inferir uma categoria. Seguro de vida não deve sugerir cobertura contra desemprego; valor de resgate não é conta poupança ou promessa de liquidez/rendimento.

## Conhecimento e exemplos

Referências conceituais: níveis de consciência (Eugene Schwartz), AIDA/PAS/BAB, Jobs to Be Done e reciprocidade/compromisso/afinidade (Cialdini). São ferramentas editoriais, não evidência de eficácia nesta base. Prova social, autoridade ou escassez não entram sem fatos verificados. Dois pares sintéticos demonstram o ritmo para seguro genérico e valor de resgate; exemplos são estilo, não fatos de apólices e não devem ser copiados como resposta fixa.

## Limites preservados

Contrato JSON e campos atuais; mesmo modelo, temperatura, limite de tokens e prazo. Input tem somente insurance/theme enviados ao modelo; telefone é usado localmente para o link. As regras de entrada/saída não foram relaxadas. Continua existindo até uma reescrita automática, no mesmo prazo global, se a sugestão for inválida. Não salva/agendas/envia campanha. A mudança não cria migração nem configuração nova.

A orientação de sistema é mais longa e aumenta o volume de texto enviado ao provedor; não aumenta o número máximo de tentativas. Custos e conversão não foram medidos nesta alteração.

## Verificação

Teste de regressão verifica que a orientação efetivamente chega ao provedor junto do contexto correto e sem telefone. Testes antigos continuam cobrindo segurança, erro e reescrita. Mock comprova o fluxo, não a qualidade de gerações reais: verificar geração no provedor e em produção com contextos sintéticos, sem salvar nem enviar campanha. Qualidade editorial requer leitura dos dois idiomas; compatibilidade mecânica não garante que o próximo texto será bom. Clique da tela e resultado comercial são verificações separadas.
