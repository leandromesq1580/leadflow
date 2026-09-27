# Incidente 25–27/09/2026 — canal de avisos deslogado, 29 leads sem aviso

## O que aconteceu
- 25/09 ~17:43 EDT: o WhatsApp **786-744-2126** (instância `piroli`, único canal por onde saem TODOS os avisos — comprador, grupo admin e alarmes) perdeu a sessão (`LOOKUP_DEAD` → recover → QR). Ficou em QR todo o dia 26/09 (1.721 QR gerados).
- 27/09: reconectado 2× de manhã e deslogado pelo WhatsApp em seguida (`DISCONNECTED LOGOUT`, 3× no dia); o bridge apaga a sessão a cada LOGOUT → aparelhos "fantasma" no celular.
- Resultado: **29 leads Meta** (26/09: 15; 27/09: 14) entregues a Paulo Faria Junior (16) e Samuel Alves Costa (13) sem aviso no WhatsApp. E-mail "Novo lead" saiu normal.

## Por que ninguém soube
1. O alarme "bridge caiu" era um e-mail de `onboarding@resend.dev` (1×/30 min) — passou batido.
2. O alarme por WhatsApp (`notifyAdmins`) saía **pela própria bridge que tinha caído** → falhava em silêncio.
3. A reconciliação automática (`poll-leads`) só reenviava leads das **últimas 6 h** → depois de 2 dias, nada seria reenviado nunca.
4. Reconectar: o QR do WhatsApp morre em ~40 s e o bridge só renovava a cada 10 min → "QR expirou".

## O que mudou (commit desta data)
- `src/lib/wa-bridge.ts`: `readyAdminBridges` / `pickFallbackBridge` — bridges de contas admin que estão `ready` (cache 60 s).
- `src/lib/notifications.ts`: `sendWhatsApp` que falha 2× no bridge escolhido reenvia 1× pela **bridge reserva** (ex.: linha 863-280-8696); `notifyAdmins` que falha em tudo manda **SMS (Twilio)** pro admin; `checkBridgeHealthAndAlert` alerta por WhatsApp (reserva) + SMS + e-mail do domínio verificado.
- `src/app/api/poll-leads/route.ts`: reconciliação passa a olhar **72 h** (25 leads por rodada, a cada 2 min).
- Ferramenta local `qrproxy.py` (preview `wa-qr`) mostra o QR com idade e botão "Gerar QR novo"; patch da VPS (`wa-bridge-idle-qr.sh`, pendente de execução pelo dono) renova o QR a cada 75 s enquanto alguém olha.

## O que NÃO está resolvido
- O WhatsApp pode deslogar de novo (causa no celular/WhatsApp, fora do sistema). Agora o efeito é: avisos saem pela reserva + alarme chega por 3 caminhos + reenvio automático por 72 h.
- Patch da VPS ainda não aplicado (48 canais em QR, ~90 GB de RAM; QR expira antes de escanear).

## Como reenviar avisos à mão
`POST https://lead4producers.com/api/admin/resend-notifications?secret=<POLL_SECRET>` com `{ "lead_ids": [...] }` em lotes de 3 (a rota reenvia e-mail também).
