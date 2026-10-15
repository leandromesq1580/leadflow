-- Recuperação administrativa de UMA resposta já recebida. Não migra mensagens existentes.
-- A autenticação is_admin é feita na API; somente service_role pode executar a função.
CREATE OR REPLACE FUNCTION public.link_orphan_sms_reply(
  p_message_id uuid, p_lead_id uuid, p_expected_owner_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
SET lock_timeout = '250ms'
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_message public.sms_messages%ROWTYPE;
  v_phone text;
BEGIN
  IF p_message_id IS NULL OR p_lead_id IS NULL OR p_expected_owner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  -- Protege dono E telefone até o commit; NOWAIT não espera reatribuição em andamento.
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_lead.assigned_to IS DISTINCT FROM p_expected_owner_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'owner_changed');
  END IF;
  SELECT * INTO v_message FROM public.sms_messages WHERE id = p_message_id FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_message.direction IS DISTINCT FROM 'in' OR v_message.status IS DISTINCT FROM 'received' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_inbound');
  END IF;
  IF v_message.lead_id IS NOT NULL AND v_message.lead_id <> p_lead_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_owned');
  END IF;
  v_phone := regexp_replace(coalesce(v_lead.phone, ''), '[^0-9]', '', 'g');
  -- Só o cadastro nacional sem + admite inferir +1. from_phone já é internacional.
  IF length(v_phone) = 10 AND ltrim(coalesce(v_lead.phone, '')) NOT LIKE '+%' THEN
    v_phone := '1' || v_phone;
  END IF;
  IF v_phone !~ '^[0-9]{8,15}$' OR v_phone IS DISTINCT FROM v_message.from_phone THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'phone_mismatch');
  END IF;
  IF v_message.lead_id = p_lead_id THEN
    RETURN jsonb_build_object('ok', true, 'already_linked', true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sms_messages
    WHERE lead_id = p_lead_id AND direction = 'out'
      AND status IN ('sent', 'delivered') AND to_phone = v_phone
      AND created_at <= v_message.created_at
  ) THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_history'); END IF;

  UPDATE public.sms_messages SET lead_id = p_lead_id
  WHERE id = p_message_id AND lead_id IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'changed'); END IF;
  RETURN jsonb_build_object('ok', true, 'already_linked', false);
EXCEPTION WHEN lock_not_available THEN
  RETURN jsonb_build_object('ok', false, 'reason', 'busy');
END;
$$;
REVOKE ALL ON FUNCTION public.link_orphan_sms_reply(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_orphan_sms_reply(uuid, uuid, uuid) TO service_role;
