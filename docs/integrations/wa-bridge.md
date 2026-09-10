# wa-bridge — integração WhatsApp

> Ver `docs/runbooks/disaster-recovery.md` para restauração completa do VPS.
> Ver `docs/runbooks/production-diagnostics.md` para diagnóstico de canal fora do ar.

## Como funciona

- Serviço Node.js (`whatsapp-web.js`) rodando via **systemd** no VPS-1
  (`62.146.229.13`, **sem Docker**). Uma instância `wa-bridge@<cliente>.service`
  por cliente (58 hoje), mais `wa-bridge.service` (canal comercial "regiane",
  porta 3466) e `wa-bridge-admin` (porta 3458, autoridade de portas).
- App (Vercel) fala com wa-bridge via HTTP, `WA_BRIDGE_URL` (default no código
  `http://62.146.229.13:3457`, ver `src/lib/wa-bridge.ts`, `src/lib/notifications.ts`).
- **Envio**: `POST /api/whatsapp/messages` no app → chama a bridge do cliente
  (`resolveSendBridge`, `src/lib/wa-bridge.ts`) → wa-bridge envia via WhatsApp Web.
- **Recebimento**: wa-bridge detecta mensagem → `POST /api/webhook/wa-bridge` no app
  com `apikey` → matching por telefone (exato, últimos 10/11 dígitos, com/sem `+`) →
  grava em `whatsapp_messages`.

## Matching de dono do lead

Um comprador com wa-bridge próprio pode ter mensagens roteadas para si mesmo mesmo
que `leads.assigned_to` aponte para outro — ver comentários em `src/lib/lead-ownership.ts`.
Não presuma que `assigned_to` sozinho decide quem vê a conversa.

## Erros permanentes vs retentáveis

`sequence-engine.ts` trata "número sem WhatsApp" (`No LID` / wa-bridge retornando 404)
como erro permanente — para o processamento, não faz retry. Outros erros HTTP da
bridge (`wa-bridge {status}`) são tratados como falha transitória.

## UNKNOWN

- Valor atual de `WA_BRIDGE_URL` na Vercel (variável `Encrypted`, não lida por
  regra de segurança) — confirme com `l4p-admin GET /api/admin/wa-health` antes de
  presumir qual porta está em uso.
