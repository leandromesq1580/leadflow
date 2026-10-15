# Idioma explícito no cadastro manual de lead

## Escopo
Adicionar seletor obrigatório de idioma no modal Adicionar Lead com 🇧🇷 Português, 🇺🇸 English e 🇪🇸 Español. A interface começa sem seleção para não inferir idioma do contato pelo idioma do corretor, nome, telefone ou localização. Bandeiras são identificadores visuais conforme a referência do usuário, não afirmações de nacionalidade.

- O formulário envia `lead_language` para `/api/leads/manual`.
- API aceita somente pt/en/es explícitos; campo ausente em clientes antigos preserva o default pt da migration 044. Valor explícito vazio, null ou inválido retorna 400 antes de inserir.
- Dono do lead continua obtido da sessão autenticada; não aceita atribuição enviada pelo cliente.
- O badge existente passa a exibir 🇺🇸 para inglês, além de sigla e nome legível.
- Migração 069 amplia somente o CHECK de `leads.lead_language` para pt/es/en. Default e registros existentes preservados. Créditos/pagamentos continuam com suas regras próprias; não se está vendendo leads em inglês.
- CSV, automações, campanhas, SMS, telefonia e registros existentes não foram alterados.

## Validação local realizada
- API: 14 testes cobrindo três idiomas, dados inválidos, compatibilidade, sessão, proprietário e erro de banco.
- PostgreSQL PGlite: o esquema anterior rejeitou en (teste vermelho); depois da migration aplicada duas vezes, en aceito; fr rejeitado; histórico/null/default preservados e inglês continua rejeitado em credits/payments.
- Badge React: bandeiras e nomes nas três interfaces; seleção desconhecida continua globo.
- Navegador Chromium com componente e CSS reais, APIs simuladas e dados fictícios: seis cenários (1280/390 px, UI pt/en/es), idioma do contato diferente da UI, sem envio antes da escolha, payload correto, UI sem mudança de idioma e sem overflow horizontal.
- Capturas auditadas com vision_analyze em desktop/mobile: campo e bandeira legíveis, sem sobreposição, botões visíveis. Um erro desatualizado após selecionar foi corrigido e retestado. Ressalvas preexistentes: campo de email estreito no mobile, baixo contraste secundário e pequena diferença de altura entre Estado/Cidade.
- Build: passou após npm ci sincronizar node_modules com o lockfile existente (primeira tentativa encontrou dependências de campanhas ausentes). Nenhuma alteração em package.json/lockfile.
- Suíte completa executada: 821 testes, 808 passaram, 13 falharam inicialmente. Falhas de dependências tratadas com npm ci; repetição focada de campanhas e idioma: 132 passaram, zero falhas. Falha conhecida automation-scheduling continua, arquivos idênticos a origin/main, fora do escopo.
- Lint comparado com origin/main nos arquivos tocados: nenhum diagnóstico novo.
- tsc independente ainda falha em arquivos não alterados. Nenhum diagnóstico nos arquivos desta mudança. Build existente pula checagem de tipos; não afirmar tsc verde.

## Publicação pendente
Nenhum deploy, migration em produção ou cadastro real foi realizado. Necessária autorização específica para migration/publicação desta funcionalidade; a autorização anterior dizia respeito a SMS.

Antes de aplicar, operador autorizado deve conferir schema real e constraints de leads.lead_language. A fonte versionada 044 contém leads_lead_language_check com pt/es; estado real em produção NÃO VERIFICADO neste perfil. Revalidar numeração 069 e main antes de merge. Aplicar a migration antes do deploy; lock_timeout de cinco segundos causa rollback em contenção, sem alteração parcial.

Não copiar credenciais de outro perfil. No perfil diretor, acesso ao banco de produção continua pendente de configuração autorizada ou execução por operador com acesso. A liberação no chat não substitui credencial.

Rollback preferível: reverter a aplicação, mantendo suporte a en no schema para preservar registros que possam ter sido criados. Não restaurar CHECK pt/es após criação de leads en nem reclassificar leads silenciosamente.

## Evidências
Logs locais em `/home/hermes/.hermes/profiles/diretor/cache/scratch/manual-language-*`; screenshots e resultados em `manual-language-ui/`. As capturas são demonstração local com backend simulado, não prova de produção.
