# /equipe native recruitment booking

## Scope
- `/equipe`, `/equipe/en`, `/equipe/es`: existing CTAs open a native modal. English CTA: **Schedule a call**. No WhatsApp account required.
- Name, email, international phone, visitor timezone, local date/time (12-hour format); UTC slot sent unchanged.
- `/api/equipe/agendar` uses the existing Regiane sales calendar (`regiane@myhomefirst.us`), first stage of its default pipeline, and a meeting follow-up. Recruitment is labeled `landing_equipe` / `Recrutamento — Landing Equipe`, never consultancy.
- UTM fields and `campaign_id` survive language switching and are saved in lead metadata.
- After deployment of migration 080: localized confirmation email to the visitor, WhatsApp notice directly to Regiane's buyer phone/WhatsApp, and a durable email reminder due **1 hour before** the conversation. The five-minute cron normally sends within 0–5 minutes of that due time; provider delivery is not guaranteed. Confirmation on screen confirms the reservation, never message delivery.
- No Google Calendar integration, SMS, meeting link, automatic call, or calendar attachment is added.
- `/nova`, auth, Academy, campaign sending and existing routing remain unchanged.

## Notification deployment gate — not deployed
1. Obtain explicit final publication approval. This PR is not permission to publish.
2. Existing migration `079_equipe_booking.sql` is the prerequisite. Review/apply **080_equipe_notifications.sql before publishing this code**, only after approval. It atomically creates three outbox jobs with each new recruitment appointment. No backfill and no notices for historical appointment edits. RLS denies anon/authenticated access; claims are service-role-only.
3. Existing environment names were confirmed (values never read/copied): `RESEND_API_KEY`, `EMAIL_RECRUIT_FROM_EMAIL` (fallback `EMAIL_CAMPAIGNS_FROM_EMAIL` / `RESEND_FROM_EMAIL`), `WA_BRIDGE_URL`, `WA_BRIDGE_KEY`, `CRON_SECRET`, and Supabase service-role configuration. Regiane's unique buyer row has a notice phone; dispatcher resolves that exact id AND `regiane@myhomefirst.us`, never the bridge admin recipient. Presence does not establish provider health or delivery.
4. Publish only after approval; verify cron registration `/api/cron/equipe-notifications` (`*/5 * * * *`). Do not invoke it in production as a test: it dispatches due real jobs. Real booking/notification smoke tests require separate authorization. No env changes, production migration execution, real sends or deployment were performed in this PR.
5. Rollback requires stopping this cron AND removing the inline dispatch code. Retain outbox evidence; do not replay `unknown` WA jobs or delete real appointments. Existing migration 079/calendar behavior is not rolled back.

## Notification behavior and limits
- Durable database trigger, not an in-memory timer. Due time uses UTC `scheduled_at - interval '1 hour'`; both email types render the original visitor timezone and language (pt/en/es). There is no invented meeting URL or automatic-call promise.
- Reservation is already committed when dispatch runs. Provider/dispatch failures cannot roll it back or change success to a booking failure. Missing/failed configuration is visible as pending/failed outbox status, not a false sent receipt.
- `FOR UPDATE SKIP LOCKED` atomically claims jobs. Unique appointment/channel/kind/slot prevents duplicate enqueue on booking retries. Resend receives a stable per-job idempotency key. Retries are capped at five and within 23 hours **of the first attempt**, not the booking creation; appointments days ahead still receive reminders.
- WhatsApp uses the existing bridge with `noReplay:true`. Ambiguous replies/crashes after claim become `unknown` for manual reconciliation, not automatic retransmission; this intentionally favors no duplicates over guaranteed WA delivery. Provider success records acceptance, not inbox/handset receipt.
- Claims exclude cancelled/completed/past appointments and mismatched old scheduled times. Dispatcher checks appointment state again immediately before transport. Rescheduling a newly tracked appointment invalidates pending old-time jobs and enqueues the new time. Once a provider has accepted a message it cannot be recalled; a cancellation concurrent with an in-flight transport may arrive too late.
- No replay/backfill of historical appointments. Reusing an already-notified exact appointment/time combination is idempotent rather than sending that combination again. Review stale/failed/unknown rows operationally; no new monitoring service is introduced.

## Notification verification (local only)
- RED evidence: missing reminder row (expected 3, observed 2), then localized reminder-subject failure before implementation.
- `node --import tsx --test tests/equipe*.test.ts`: **19 passed, 0 failed, 0 skipped**. Actual booking handler/dispatcher, mocked external providers; SQL migrations in PGlite. Covers partial failure, parallel replay, three locales, UTC/timezone, missing dispatch, reminder 1-hour boundary, appointments days ahead, cancellation/reschedule/past, retry lifetime and service-role grants.
- `tests/equipe-notifications-concurrency.mjs`: **3 cases passed** on real PostgreSQL 16 loopback, its own disposable database: concurrent booking yields exactly three jobs; exclusive immediate claims; exclusive reminder claim. No external provider invoked.
- `tests/equipe-browser.mjs`: Chromium against local production Next server, API mocked; en/pt/es pass, no page errors, correct payload/local times, failure/conflict behavior and honest screen confirmation. Existing ambiguous `getByRole('alert')` selector fixed to `.first()` after conflict exposes two legitimate alerts.
- Webpack production build: **exit 0** with dummy Supabase values, candidate and base. Changed application-file ESLint and `git diff --check` pass.
- Typecheck remains baseline-red: **21 matching diagnostics**, no new diagnostics after equivalent production generation (union member order normalized).
- Full suite is **not certified green**: same 180-second sequential budget, both time out (124). Candidate observed 288 passes / 37 failures; base 284 / 37; no new observed failing test identities. Focused suite above ran to completion after all changes.
- Independent parent review remains required. Worktree: `leadflow-equipe-notifications`; production is unchanged.

## Original booking verification (historical)
- `node --import tsx --test tests/equipe-*.test.ts`: **8 passed, 0 failed**. Includes validation, DST/date-line conversion, occupancy, API errors, atomic write rollback, ownership, source, idempotency, and abuse limits.
- `tests/equipe-concurrency.mjs`: PostgreSQL 16 on loopback only, fresh `equipe_test` database, port 55437. Four cases passed: recruitment/recruitment, ordinary writer first, recruitment first, concurrent identical retry. Verifies waiting for transaction commit and final row counts.
- `tests/equipe-browser.mjs`: production Next server on loopback port 3337, Chromium, mocked API only. All en/pt/es mobile forms passed; UTC payload, local 7 AM, campaign metadata, no WhatsApp link, error/429/conflict without false success, refreshed availability, final success, no browser exceptions. `EQUIPE_TEST_DEPS` optionally points at a scratch install of `playwright` and `pg`; `EQUIPE_CHROMIUM` optionally selects the browser executable. No dependencies were added to the application.
- `npm run build -- --webpack`: exit 0 using placeholder Supabase values. Default Turbopack build was not successful in the shared symlinked-node_modules worktree; webpack production build was the verified alternative.
- Changed application files ESLint and `git diff --check`: pass.
- TypeScript: baseline and candidate both fail existing diagnostics; equivalent generated route checks give identical diagnostic multisets, no new diagnostics.
- Full suite is **not green/certified**. Unbounded default-concurrency runs were terminated (143 / -9). Equivalent sequential runs had a 180-second budget and both timed out (124), each with 116 passes and the same 37 observed failures in pre-existing notification tests. No new observed failure identities, but this is an incomplete full-suite run, not proof of all regressions absent.
- Independent parent review remains required; child agent did not delegate. No production database writes, bookings, notifications, merge or deployment were performed.
