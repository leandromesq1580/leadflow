# Incidente: resposta de SMS entrava na conversa do cliente errado

Date: 2026-09-22/23 (America/New_York)
System: webhook de resposta de SMS (Twilio)
Severity: mistura de conversa entre contas de clientes diferentes
Status: causa de software reproduzida e corrigida; ação/dado histórico não alterado

## Symptoms / Impact
Leandro mandou SMS pro lead "Andi Salustiano" a partir da própria conta e ela
respondeu — mas a resposta nunca apareceu no canal dele.

## Detection / Investigation
Consulta ao banco mostrou **dois cadastros de lead com o mesmo telefone**,
atribuídos a donos diferentes:
- `245c35de...` (criado 2026-04-15) → Leandro Mesquita — foi daqui que o SMS
  original saiu (`sms_messages` direction=out, 2026-09-22 22:39).
- `f8ae11b5...` (criado 2026-04-20, mais recente) → outro comprador (Davi Vaz).

O webhook `/api/webhook/twilio-sms` casava a resposta pelo telefone e pegava
sempre `order('created_at', desc).limit(1)` — ou seja, **o cadastro mais
recente**, não o que efetivamente trocou aquela conversa. As respostas da Andi
foram gravadas contra o lead do Davi.

## Root Cause
**Confirmado (reproduzido com teste real do handler):** ambiguidade de
telefone entre dois leads de contas diferentes era resolvida por
"mais recente", sem checar qual dos dois já tinha conversa em andamento.

## Resolution / Code affected
- `src/app/api/webhook/twilio-sms/route.ts`: nova função
  `resolveLeadForInboundSms` — busca até 10 candidatos pelo telefone e escolhe
  o lead que já tem histórico de SMS **outbound** (a pergunta sendo
  respondida). Critério de desempate, em ordem:
  1. Único candidato → usa direto (sem query extra).
  2. Exatamente um candidato com outbound → usa esse.
  3. Mais de um com outbound → usa o do outbound mais recente (o que está
     sendo respondido agora).
  4. Nenhum com outbound (sem sinal de conversa) → usa o cadastro **mais
     antigo**, não o mais novo — inverte o viés que causou o bug.
- Não altera o schema, não migra dados já gravados incorretamente (fora do
  escopo: mensagens antigas continuam associadas ao lead que ficou registrado
  na hora).

## Prevention / Detection next time
`tests/sms-reply-lead-match.test.cjs`: reproduz o caso real (Andi/Leandro/Davi)
e cobre o caminho sem ambiguidade. Rodar `npm test` antes de publicar mudanças
no webhook de SMS.

## Limits / Related
Esta correção não move as mensagens já gravadas no lead errado — só evita que
o bug se repita nas próximas respostas. Se um cliente relatar histórico
"sumido" antes desta correção, verificar manualmente em `sms_messages` pelo
`from_phone`/`to_phone`, não presumir que já foi migrado.
- `src/app/api/webhook/wa-bridge/route.ts` já tinha lógica equivalente
  (âncora de segurança por dono de bridge) para o canal WhatsApp — este
  incidente é o equivalente do canal SMS, que não tinha essa proteção.
