# /equipe native recruitment booking

## Scope
- `/equipe`, `/equipe/en`, `/equipe/es`: existing CTAs open a native modal. English CTA: **Schedule a call**. No WhatsApp account required.
- Name, email, international phone, visitor timezone, local date/time (12-hour format); UTC slot sent unchanged.
- `/api/equipe/agendar` uses the existing Regiane sales calendar (`regiane@myhomefirst.us`), first stage of its default pipeline, and a meeting follow-up. Recruitment is labeled `landing_equipe` / `Recrutamento — Landing Equipe`, never consultancy.
- UTM fields and `campaign_id` survive language switching and are saved in lead metadata.
- No automatic email, SMS or WhatsApp is sent. Confirmation is on screen and explicitly says so. Follow-up is an unscheduled internal meeting record, not an automatic notification.
- `/nova`, auth, Academy, campaign sending and existing routing remain unchanged.

## Deployment gate — not deployed
1. Obtain explicit final publication approval. This PR is not permission to publish.
2. Review/apply `supabase/migrations/079_equipe_booking.sql` **before frontend publication**. It adds a service-role-only transactional RPC and an appointment trigger; no new credentials or tables. The trigger serializes Regiane's calendar and blocks overlaps involving recruitment, including concurrent ordinary calendar writers. Ordinary non-recruitment overlap policy stays unchanged.
3. Confirm the buyer exists uniquely with a default pipeline and at least one stage. Existing `SUPABASE_SERVICE_ROLE_KEY` is sufficient. Hosted IP hashing assumes Vercel's overwritten `x-vercel-forwarded-for`; outside Vercel requests share a conservative bucket.
4. Publish after migration, then smoke-check availability and modal for all languages. A real booking or outbound notification needs separate scope/authorization. Rollback frontend independently; do not delete real booked leads.

## Verification performed locally
- `node --import tsx --test tests/equipe-*.test.ts`: **8 passed, 0 failed**. Includes validation, DST/date-line conversion, occupancy, API errors, atomic write rollback, ownership, source, idempotency, and abuse limits.
- `tests/equipe-concurrency.mjs`: PostgreSQL 16 on loopback only, fresh `equipe_test` database, port 55437. Four cases passed: recruitment/recruitment, ordinary writer first, recruitment first, concurrent identical retry. Verifies waiting for transaction commit and final row counts.
- `tests/equipe-browser.mjs`: production Next server on loopback port 3337, Chromium, mocked API only. All en/pt/es mobile forms passed; UTC payload, local 7 AM, campaign metadata, no WhatsApp link, error/429/conflict without false success, refreshed availability, final success, no browser exceptions. `EQUIPE_TEST_DEPS` optionally points at a scratch install of `playwright` and `pg`; `EQUIPE_CHROMIUM` optionally selects the browser executable. No dependencies were added to the application.
- `npm run build -- --webpack`: exit 0 using placeholder Supabase values. Default Turbopack build was not successful in the shared symlinked-node_modules worktree; webpack production build was the verified alternative.
- Changed application files ESLint and `git diff --check`: pass.
- TypeScript: baseline and candidate both fail existing diagnostics; equivalent generated route checks give identical diagnostic multisets, no new diagnostics.
- Full suite is **not green/certified**. Unbounded default-concurrency runs were terminated (143 / -9). Equivalent sequential runs had a 180-second budget and both timed out (124), each with 116 passes and the same 37 observed failures in pre-existing notification tests. No new observed failure identities, but this is an incomplete full-suite run, not proof of all regressions absent.
- Independent parent review remains required; child agent did not delegate. No production database writes, bookings, notifications, merge or deployment were performed.
