-- SMS unread receipts. Existing messages remain unread: no invented historical reads.
BEGIN;
ALTER TABLE public.sms_messages ADD COLUMN IF NOT EXISTS read_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_sms_messages_unread
  ON public.sms_messages (lead_id, id) WHERE direction = 'in' AND read_at IS NULL;

-- Same current-owner resolution as getCurrentLeadOwner: member's own account,
-- otherwise assigned_to. No copying SMS into WhatsApp or moving ownership records.
CREATE OR REPLACE VIEW public.sms_inbox_messages WITH (security_invoker = true) AS
SELECT s.id, s.lead_id, s.direction, s.body, s.created_at, s.read_at,
       COALESCE(b.id, l.assigned_to) AS buyer_id
FROM public.sms_messages s
JOIN public.leads l ON l.id = s.lead_id
LEFT JOIN public.team_members tm ON tm.id = l.assigned_to_member
LEFT JOIN public.buyers b ON b.auth_user_id = tm.auth_user_id
WHERE s.direction = 'in';
REVOKE ALL ON public.sms_inbox_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sms_inbox_messages TO service_role;
COMMIT;
