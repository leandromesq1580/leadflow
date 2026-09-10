# Priority delivery incident — 2026-09-01

## Confirmed cause

Jeniffer's configured priority was `one_in: 2`, but `daily_max: 0` blocked all
deliveries through that rule. Her account was active and had 51 state entries.
The queue calculated the next proportional turn without checking the daily cap,
so it incorrectly displayed “PRÓXIMO”.

At 21:09:17 UTC the production setting was changed from `daily_max: 0` to `null`
(no daily cap), preserving the 1-in-2 ratio, recipient and all other settings.
The update compared `updated_at` to prevent overwriting a concurrent edit.
No previously assigned lead was moved and no test notification was sent.

The production read-only preview for FL, CT, MA, PA and CA returned no recipient
before the change and Jeniffer at position 1182 after it.

## Code safeguards

- Delivery, preview and queue share the priority evaluator and daily-usage reader.
- Queue exposes daily cap, daily count, blocked reason and state-dependent next recipients.
- Zero remains an explicit pause; the settings screen warns and requires confirmation.
- Webhook arrivals and pending Meta leads also apply the priority rule.
- Eastern daily counts handle daylight-saving transition dates.
- Failed priority-state reads do not become a misleading available turn.

## Verification

`npm run test:admin-rule`: 11 regression tests, including mocked assignment,
notifications, queue API and server-rendered queue labels. No production leads
are created by these tests. `npm run build` passes.

Full `tsc --noEmit` still reports pre-existing repository errors (Supabase client
settings types, Stripe subscription types, pipeline types, WDT locales and push
types). No new type errors in the priority evaluator, state reader or routes.

The queue is a preview: the incoming lead's state, concurrent arrivals, current
settings and daily totals can affect the actual decision. The existing global
assigned-lead counter is not a transactional reservation.
