# Recipient language for lead messages

## Behavior

- PT/ES/EN language badges appear in desktop/mobile pipeline cards, lead details,
  lead lists and conversations. The badge label follows the interface language;
  the contact language does not.
- Known Meta form mapping is authoritative, then the lead's stored language.
  Never guess language from a name, phone, state, or producer locale.
- Automations, sequences (including custom text), automatic missed-call SMS,
  queued SMS campaigns, meeting confirmations and template sends resolve the
  recipient language before transport. Pending SMS is rechecked at dispatch.
- Built-in templates use reviewed PT/ES/EN catalogs. Custom text uses the existing
  translation provider, before template variables are rendered. Protected
  placeholders, numbers, links and email addresses are masked and validated.
- Content-addressed translation cache lives in admin-only `settings`; editing
  the source creates a different cache key. Translation does not rewrite the
  user's original template or the historical messages.
- Missing language / unavailable or invalid translation fails before sending.
  Automation retries are allowed only for these pre-transport failures, with an
  atomic claim and a five-minute backoff; successful sends are never reopened.
- Deliberately typed manual messages stay as written. Internal notifications to
  producers continue using the producer locale.
- No change to lead purchases, credits, priority, routing or ownership.

## Verification

- `node --import tsx --test tests/lead-message-language.test.ts tests/sms-auto-locale.test.ts`:
  25 passing tests. Actual engines exercised with mocked WA/email/SMS transports;
  no customer was contacted. Includes unknown-language blocking, queued legacy
  SMS, template preview without transport, custom translation validation/cache.
- Full regression suite: 141 tests, 135 pass. The same six existing failures were
  independently reproduced on unmodified GitHub HEAD `f71332f`: obsolete source
  assertion in automation-scheduling and missing `./i18n` test-loader mock in
  five sales-team checkout tests. No new regression failure.
- Final production build: compiled successfully; all 125 static pages generated.
  Repository-wide typechecking still has existing unrelated errors; no new
  diagnostics in the recipient-language implementation.
- Read-only production language audit: 2,822 Portuguese, 15 Spanish, zero unknown
  languages and zero form/stored-language disagreements at verification time.
- Live translation-provider smoke test passed PT, ES and EN using fictional
  content only, with no database writes and no customer sends.

Re-run the read-only audit using configured server environment:

```sh
node --env-file=.env.production.local --import tsx scripts/audit-lead-message-language.mts
```

Optional `--check-translation` tests the translation provider with synthetic
content; it does not invoke customer-message transports or production runners.
