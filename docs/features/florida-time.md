# Horário oficial do sistema: Flórida (America/New_York)

Regra: **R-LIC-03** em `regras-de-negocio.md`.

## O que muda para o usuário
- Todo horário na interface (dashboard, admin, `/m`) é horário da Flórida (EST/EDT, horário de verão automático), com aviso fixo no topo: *"Horários do sistema: Flórida (costa leste) · America/New_York · EST/EDT · horário de verão automático"*.
- Lead: **"Entrada do lead"** (`created_at`) e **"Entregue no WhatsApp"** (`notified_at`, o mesmo horário que o cliente vê no celular). Sem `notified_at`, mostra **"Entregue ao cliente (CRM)"** (`assigned_at`).
- Agenda (desktop, mobile, admin, pipeline, follow-up): data/hora digitada é **horário da Flórida** (rótulo nos campos). Criar às 10:00 de um navegador no Brasil grava e mostra 10:00.
- Reagendar sem editar mantém o horário (prefill em Flórida).
- Visões dia/semana/mês, "Hoje" e a janela de 30 dias do mobile seguem o dia da Flórida (inclui 23:00-23:59 ET).
- KPIs "leads hoje" / "compromissos hoje" (`/api/home`) viram à meia-noite da Flórida.
- Lembretes (`/api/cron/reminders`), e-mail de agendamento (`notifications.ts`), automações (`automation-engine.ts`) e a confirmação de reunião enviada ao lead marcam o fuso: "(ET)" / "(horário da Flórida)".

## O que NÃO muda
- Nenhum timestamp gravado é reescrito; sem migration.
- `distribute.ts`, `availability.ts` (fuso por estado do buyer), cron firing e rotas `nova/*` (America/Sao_Paulo, equipe de vendas) intactos.

## Helpers (`src/lib/florida-time.ts`)
| Função | Uso |
|---|---|
| `formatFloridaDateTime(value, locale, options)` | exibição; data-only mantém o dia literal; inválido → `—` |
| `floridaParts(value)` | `{date:'YYYY-MM-DD', time:'HH:mm'}` para prefill de formulários |
| `floridaToday()` / `addFloridaDays(day, n)` | dia da Flórida e aritmética de calendário sem fuso |
| `floridaWallClockToISO(date, time)` | hora digitada (Flórida) → instante UTC; gap de DST rola para frente, hora repetida usa a 1ª ocorrência |
| `floridaDayRange(day, days)` | `{fromIso, toIso}` (to exclusivo) para consultas `gte/lt` |

## API
- `GET /api/appointments/calendar?from&to`: `to` agora é **exclusivo** (`.lt`). Callers (desktop e mobile) atualizados.

## Testes
```bash
TZ=America/Sao_Paulo npx tsx --test tests/florida-time.test.ts tests/florida-display.test.ts
TZ=America/Sao_Paulo node --test tests/florida-display.cjs
```

## Riscos conhecidos
- Compromissos antigos criados por corretores fora da Flórida foram gravados no fuso do navegador deles; agora aparecem em horário da Flórida (leitura correta do que foi salvo). Reagendar manualmente se incomodar.
- Ainda em fuso do host (fora do escopo desta entrega): data da lista em `/dashboard/whatsapp`, filtros "hoje/este mês" em `dashboard-kpis.tsx` e `pipeline/page.tsx`, agrupamento por dia UTC em `analytics/route.ts`.
