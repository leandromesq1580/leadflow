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
timestamp e o último evento.

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
