# Agente Hermes `lead4pro` — fonte da verdade

Os arquivos do agente vivem AQUI e são copiados para o servidor do Hermes automaticamente:

| Repo | Servidor (usuário `hermes`) |
|---|---|
| `agents/hermes/lead4pro/SOUL.md` | `~/.hermes/profiles/lead4pro/SOUL.md` |
| `agents/hermes/lead4pro/SKILL.md` | `~/.hermes/skills/devops/lead4pro/SKILL.md` |

`agents/hermes/sync.sh` roda a cada 10 min (`systemctl --user status lead4pro-sync.timer`,
log em `~/.hermes/sync-lead4pro.log`): puxa a `main` na cópia `~/DEV-APPS/leadflow-agent`,
roda `npm ci` se o lock mudou e sobrescreve SOUL/SKILL se diferirem da `origin/main`
(mantém 5 backups `.bak-*`).

**Regra:** mudou regra de negócio, infra ou procedimento → edite o SOUL/SKILL aqui, no
mesmo PR do código. Editar direto no servidor é perdido no próximo sync.
