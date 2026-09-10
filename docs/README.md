# Índice de conhecimento — Lead4Pro

Ver `AGENTS.md` na raiz para o manual operacional de entrada. Este diretório é a
base de conhecimento técnico versionado do projeto.

- `architecture/` — como o sistema é feito (overview, infraestrutura, modelo de dados).
- `runbooks/` — procedimentos operacionais (diagnóstico, deploy, disaster recovery).
- `decisions/` — ADRs: por que decisões técnicas importantes foram tomadas.
- `incidents/` — investigações de produção documentadas (causa confirmada vs hipótese).
- `integrations/` — como cada integração externa funciona (Meta, wa-bridge, etc.).
- `features/` — comportamento de features específicas que o código sozinho não explica
  claramente (regras de negócio, edge cases).

## Regra de manutenção

Depois de qualquer tarefa relevante, pergunte: "aprendemos algo reutilizável?"
- Fato pequeno e permanente → Memory do agente (fora deste repo).
- Procedimento reutilizável → Skill do agente, ou runbook aqui se for específico do projeto.
- Conhecimento arquitetural → `architecture/`.
- Decisão técnica → `decisions/` (ADR).
- Incidente de produção → `incidents/`.
- Comportamento de integração externa → `integrations/`.
- Comportamento de feature → `features/`.

Nunca documente hipótese como fato. Marque `Status: Hypothesis` quando não confirmado,
ou não persista. Nunca registre valores de segredo — só que a credencial existe e
onde é gerenciada.
