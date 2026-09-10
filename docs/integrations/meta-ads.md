# Meta lead capture — recovery and operation

## Scheduler

`vercel.json` schedules `/api/poll-leads` every two minutes on the production
deployment. Set a random production `CRON_SECRET` in Vercel before deploying;
Vercel sends it in the Authorization header. The existing `POLL_SECRET` remains
accepted for authorized maintenance. Never put either secret in source control,
logs, screenshots or a cron URL.

The Vercel project currently uses Pro. Native scheduling replaces the lost
root-crontab dependency on the retired VPS. Do not add a second VPS polling job.
Reference: https://vercel.com/docs/cron-jobs/manage-cron-jobs

## Capture guarantees and limits

- Fetch both configured forms with Graph pagination; merge and sort oldest first.
- Scan from the last successful checkpoint minus 72 hours. First run scans seven
  days. A longer interruption expands the scan window from the stored checkpoint.
- Insert at most ten new leads per execution, with a 90-second ingestion budget.
  Unimported IDs are counted in `remaining`; the next run resumes the same scan.
- `leads.meta_lead_id` is unique. A duplicate inserted by the webhook is skipped.
- `settings.meta_poll_lease` serializes polling runs across deployments and manual
  invocations. Its ten-minute expiry recovers from a terminated function.
- Read routing from the database. Do not bypass admin priority when its query
  fails. All assignments still use the existing distribution/credit functions.
- A missing/invalid phone is not delivered or charged. Return HTTP 503 and an
  explicit issue instead of pretending the form was processed successfully.
- Notification reconciliation uses assignment time, not original capture time,
  so old leads recovered today remain eligible for notification retry.

This is not a new credit entitlement: no pricing, staff policy, queue order or
CRM bonus rule was changed. WhatsApp `notified_at` retains its existing meaning:
the admin-group send succeeded; it is not a read receipt from the buyer.

## Verify after deployment

1. In the Vercel project, confirm the production cron definition is enabled.
2. Read `settings` where `key = 'meta_poll_health'`. Check `last_started_at`,
   `last_success_at`, `trigger`, `status`, `remaining`, and `issues`.
3. Observe at least two **automatic** cycles (`trigger = 'vercel-cron'`). A manual
   HTTP 200 alone does not prove that the scheduler works.
4. Reconcile Meta IDs against the database, then check assigned buyer, default
   pipeline card, credit delta and actual notification send results.
5. If a run fails, inspect the function log and health record. Do not clear
   notification markers or reassign delivered leads to retry the entire batch.
   Do not delete a live lease; wait for the owner or its expiry.

Tests: `node --test tests/meta-poll.test.cjs tests/admin-rule.test.cjs
tests/staff-routing.test.cjs tests/crm-bonus-cutoff.test.cjs`.

## Incident, September 4, 2026

Recovered 36 absent Meta leads sequentially using the deployed routing library.
All 36 were assigned and placed in the buyer's pipeline. Admin priority received
18; the paid queue received 18 and consumed exactly 18 existing credits. No
purchased-credit balances were increased. The 108 WhatsApp sends (group, admin,
buyer) all returned success and distinct message IDs. Individual evidence and
contact details are kept in the private incident artifact, not this repository.
