-- SMS stays in sms_messages: no mirrored WhatsApp row, no second delivery.
-- Historical replies start unread; there was no persisted SMS read state before.
ALTER TABLE public.sms_messages ADD COLUMN IF NOT EXISTS read_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_sms_inbox_unread ON public.sms_messages(lead_id, id)
  WHERE direction = 'in' AND read_at IS NULL AND status = 'received';

-- Called only by authenticated API routes using service_role. Resolve CURRENT
-- owner at query/update time, including member-only assignment and agency fallback.
-- An old WhatsApp message is not authority to read another owner's SMS.
CREATE OR REPLACE FUNCTION public.read_sms_inbox(
  p_buyer_id uuid, p_lead_id uuid DEFAULT NULL, p_admin boolean DEFAULT false,
  p_unread_only boolean DEFAULT false, p_after uuid DEFAULT NULL
) RETURNS SETOF public.sms_messages
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.* FROM public.sms_messages s
  JOIN public.leads l ON l.id = s.lead_id
  LEFT JOIN public.team_members m ON m.id = l.assigned_to_member
  WHERE (p_lead_id IS NULL OR s.lead_id = p_lead_id)
    AND ((p_admin AND p_lead_id IS NOT NULL) OR
      COALESCE((SELECT b.id FROM public.buyers b WHERE b.auth_user_id = m.auth_user_id), l.assigned_to) = p_buyer_id)
    AND (p_after IS NULL OR s.id > p_after)
    AND s.status IN ('sent', 'delivered', 'received', 'failed')
    AND btrim(COALESCE(s.body, '')) <> ''
    AND (NOT p_unread_only OR (s.direction = 'in' AND s.status = 'received' AND s.read_at IS NULL))
  ORDER BY s.id LIMIT 500;
$$;

CREATE OR REPLACE FUNCTION public.mark_sms_inbox_read(
  p_buyer_id uuid, p_lead_id uuid DEFAULT NULL, p_admin boolean DEFAULT false,
  p_ids uuid[] DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n integer;
BEGIN
  UPDATE public.sms_messages s SET read_at = now()
  FROM public.leads l LEFT JOIN public.team_members m ON m.id = l.assigned_to_member
  WHERE s.lead_id = l.id AND s.direction = 'in' AND s.read_at IS NULL
    AND (p_lead_id IS NULL OR s.lead_id = p_lead_id)
    AND (p_ids IS NULL OR s.id = ANY(p_ids))
    AND ((p_admin AND p_lead_id IS NOT NULL) OR
      COALESCE((SELECT b.id FROM public.buyers b WHERE b.auth_user_id = m.auth_user_id), l.assigned_to) = p_buyer_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.read_sms_inbox(uuid, uuid, boolean, boolean, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_sms_inbox_read(uuid, uuid, boolean, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_sms_inbox(uuid, uuid, boolean, boolean, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_sms_inbox_read(uuid, uuid, boolean, uuid[]) TO service_role;
NOTIFY pgrst, 'reload schema';
