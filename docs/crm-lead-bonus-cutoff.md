# CRM free-lead cutoff

CRM subscriptions do not include free lead credits for any charge made at or
after 2026-08-01 00:00 America/New_York (`2026-08-01T04:00:00.000Z`). This covers
new purchases, re-subscriptions and recurring renewals. The Stripe invoice
webhook records CRM revenue and subscription state but never inserts lead
credits.

The only remaining delivery mechanism is a finite compatibility path for a
multi-month cycle that was paid before the cutoff and already has its explicit
`crm-bonus:` or `crm-bonus-cycle:` month-one marker. It validates the payment
date itself. A new invoice cannot inherit eligibility from an older invoice,
and a renewal after the cutoff stops the compatibility path.

Historical free credits remain identifiable by `stripe_payment_id` prefixes
`crm-bonus:`, `crm-bonus-cycle:` or `crm-drip:`. These rows do not represent sold
leads and must be excluded from paid delivery obligations and debt totals.

Regression checks: `npm run test:crm-bonus-cutoff` and `npm run build`.
