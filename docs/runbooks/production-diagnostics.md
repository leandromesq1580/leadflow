# Diagnóstico de produção

> Leitura/investigação = verde (pode executar sozinho). Qualquer restart, deploy
> ou escrita a partir daqui é amarelo — pare e peça autorização.

## 1. "WhatsApp de um cliente caiu / leads pararam de chegar"

O caminho de um lead é Meta → Vercel (API) → Supabase → wa-bridge (VPS-1). Investigue
nessa ordem — SSH sozinho só cobre o último trecho.

```bash
# 1. App está de pé e integrações respondem?
curl -s https://lead4producers.com/api/health   # filtre a saída: pode conter prefixos de credencial

# 2. Poller da Meta está rodando de fato (não só HTTP 200 manual)?
/home/hermes/.hermes/profiles/lead4pro/bin/l4p-sql "select value from settings where key='meta_poll_health'"

# 3. Leads chegando no banco nas últimas horas?
/home/hermes/.hermes/profiles/lead4pro/bin/l4p-sql "select count(*) from leads where created_at > now() - interval '2 hours'"

# 4. wa-bridge do cliente específico está com sessão ativa?
ssh lead4pro-prod 'systemctl status wa-bridge@<cliente> --no-pager | head -8'
ssh lead4pro-prod 'journalctl -u wa-bridge@<cliente> -n 40 --no-pager -o cat'
```

`[QR] Generated` repetido no log = sessão expirada, precisa reescanear no aparelho —
não há conserto por SSH. `READY` histórico não confirma conexão atual; sempre olhe o
timestamp e o último evento. `DISCONNECTED LOGOUT` = o WhatsApp derrubou a sessão
(o bridge apaga a sessão e pede QR novo; 3× em 27/09 — causa fica no celular:
aparelhos conectados fantasmas / app desatualizado).

**Reescanear sem "QR expirou":** o WhatsApp invalida o QR em ~40 s e o bridge só renova
sozinho a cada 10 min. Antes do scan, force um QR novo: `POST /restart` do bridge
(`curl -X POST -H "apikey: $K" http://127.0.0.1:<porta>/restart` — mesma ação do botão
"gerar QR novo" do app) e escaneie em até 40 s.

### 1b. "Desapareceram as notificações" (avisos de lead não chegam)
Todos os avisos (comprador, grupo admin, alarmes) saem pelo **canal de avisos =
`wa-bridge@piroli`** (número 786-744-2126, porta 3456; o nginx na **3457** aponta pra ele;
`WA_BRIDGE_URL` na Vercel está vazio → default `:3457`). Diagnóstico:
```bash
ssh lead4pro-prod 'K=$(grep ^API_KEY= /etc/wa-bridge/piroli.env|cut -d= -f2); curl -s -H "apikey: $K" http://127.0.0.1:3456/status'
ssh lead4pro-prod 'grep -aE "DISCONNECTED|READY|AUTH" /var/log/wa-bridge-piroli.log | tail'
/home/hermes/.hermes/profiles/lead4pro/bin/l4p-sql "select count(*) from leads where assigned_at > now()-interval '3 days' and notified_at is null and meta_lead_id is not null"
```
Desde 27/09 (`src/lib/notifications.ts`): envio que falha 2× no bridge escolhido sai pela
**bridge reserva** (qualquer conta `is_admin` com bridge `ready`, ex.: linha 863-280-8696,
`pickFallbackBridge` em `src/lib/wa-bridge.ts`); alarme de queda vai por WhatsApp (reserva)
+ e-mail + **SMS Twilio** de último recurso; a reconciliação do `poll-leads` reenvia por
**72 h** o que ficou com `notified_at IS NULL` (25 por rodada, a cada 2 min).
Reenvio manual (rota do app, reenvia e-mail também): `POST /api/admin/resend-notifications?secret=<POLL_SECRET>`
com `{ "lead_ids": [...] }` em lotes de 3.

⚠️ Canal comercial "regiane" é `wa-bridge.service` (sem `@`), **não** `wa-bridge@regiane`
(fica disabled de propósito). Nunca dar `enable --now` nessa instância — sobe processo
duplicado na mesma porta e derruba a unit em `failed`.

## 2. Memória/CPU saturados no VPS-1

```bash
ssh lead4pro-prod 'free -h; df -h /; uptime'
ssh root@62.146.229.13 'dmesg -T | grep oom-kill:'
```

Meça sempre antes de atribuir queda a memória — capacidade pode ter mudado.
`CHROME_LEAN=1` já está nas 58 instâncias; não sugerir reaplicar.

## 3. ChatbotX (VPS-2)

```bash
ssh root@13.140.34.199 'docker ps --format "table {{.Names}}\t{{.Status}}"'
ssh root@13.140.34.199 'docker logs --tail 50 <container>'
```

`unhealthy` no Docker pode ser falso positivo de healthcheck mal configurado —
teste o endpoint real antes de reportar quebrado.

## 4. Números estranhos de negócio (leads, conversão, receita)

Nunca recontar `leads` para saldo de crédito, nunca ignorar o fuso `America/New_York`.
Ver semântica completa em `docs/architecture/data-model.md`. Sempre trazer o número
**e** a query usada; se parecer estranho, confirme por um segundo caminho.

## Regra dura de verificação

Nunca declarar "está funcionando" sem colar a saída real do comando. Se não
verificou, escrever "NÃO VERIFICADO" e listar o que falta.
