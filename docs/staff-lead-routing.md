# Employee lead routing

Staff accounts are explicitly listed by buyer UUID in `settings.staff_buyers`:

```json
{ "buyers": ["buyer-uuid"] }
```

Do not infer employment from `is_admin`, free credits, a courtesy subscription,
or membership in `metrics_exclude_buyers`. Financial exclusions alone do not
change delivery eligibility. Only add an account when the owner identifies it
as an employee; preserve any existing IDs when updating the setting.

Staff are excluded from normal credit queues, paid routing pools and automatic
fallback. The explicit `lead_routing.admin_rule` is the only automatic delivery
exception: it retains its state-license, active-account, rotation and daily-limit
checks, and does not debit credits. Staff classification does not select someone
for priority or change anyone else's priority.

Internal credits and past leads remain intact. Staff credit balances are excluded
from sold/delivered/owed customer-credit metrics, delivery debt and automatic
credit reconciliation. Actual cash payments and campaign costs remain in
financial reports. Manual account/lead administration remains available.

The setting must exist in the production database for the configured accounts
to be excluded. Database errors fail closed rather than silently letting staff
compete. Admin buyer profiles and priority settings expose the classification;
the employee's queue card explains the exception in PT/EN/ES.

Regression checks: `npm run test:admin-rule`, `npm run test:staff-routing`, and
`npm run build`. Tests use in-memory fixtures: no real leads, messages or credits
are modified.
