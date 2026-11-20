# /equipe phone correction — local verification

## Scope and root cause
The prior validator requires a leading `+`, even for a valid US national phone. A RED test reproduced rejection of synthetic US national input independently of UI language. The screenshot alone does not establish that phone was the only invalid field in the real submitted payload.

- Country/calling-code selector defaults to **US +1**, regardless of language.
- National formatted input uses the selected country; explicit international `+` input takes precedence, without doubling the calling code.
- `libphonenumber-js/max` validates numbering-plan format and returns E.164. No equivalent phone parser existed in dependencies. This does **not** verify ownership or that the number is reachable.
- API field identifiers produce translated inline name/email/phone/slot errors. Generic security failures no longer misleadingly instruct every visitor to add a country code.
- Calendar/grid, auth, SQL, /nova, idempotency and notification behavior are unchanged.

## Evidence
Scratch prefix: `/home/hermes/.hermes/profiles/lead4pro/cache/scratch/`.

- `equipe-phone-red.log`: pre-fix national US test fails with `invalid` (1 fail).
- `node --import tsx --test tests/equipe-*.test.ts`: **12 pass, 0 fail**; `equipe-phone-tests.log`. Includes real validator, API field responses, UUID/honeypot/time rejection and existing PGlite transactional regression tests.
- `npm run build -- --webpack`: **exit 0**, using placeholder public Supabase values; `equipe-phone-build.log`. Existing config/metadata warnings remain; build skips type validation, so type checking is separately reported below.
- Production Next server on loopback **3338**, Chromium: `EQUIPE_TEST_DEPS=/home/hermes/.hermes/profiles/lead4pro/cache/scratch/equipe-browser node --import tsx tests/equipe-phone-browser.mjs`: **exit 0**; `equipe-phone-browser.log`. All en/pt/es mobile forms verify default country, name/email/phone errors without persistence, slot conflict/refresh, US national success, explicit UK/+1, and selected BR national success. Runs the actual POST handler and actual validator, mocking only persistence; 12 mock commits, zero real writes. Asserts no browser page errors.
- Changed application files ESLint and `git diff --check`: **exit 0**.
- `tsc --noEmit`: **exit 2**, 21 diagnostics. Exact `origin/main` archive with same dependencies and copied equivalent generated type checks also gives 21; raw logs `equipe-phone-tsc.log` and `equipe-phone-base-tsc.log`. The only remaining textual difference after root normalization is equivalent union ordering (`NextRequest | Request` versus `Request | NextRequest`) in the existing admin/delivery-queue generated check. No new diagnostic identities.
- Full repository suite was not rerun/certified. Separate two-session PostgreSQL concurrency helper was not rerun: server `initdb` binary unavailable (client present); SQL was not changed. PGlite regression test passed, but is not proof of independent connection locking.

## Review/publication gate
Independent parent review of this branch is required. No push, PR, merge, deploy, production database access, real booking or outbound message was performed. The earlier PR115 publication authorization does **not** authorize publishing this correction: obtain a new explicit **sim**. No migration is part of this correction. Original worktree's modified `docs/equipe-native-booking.md` was preserved.
