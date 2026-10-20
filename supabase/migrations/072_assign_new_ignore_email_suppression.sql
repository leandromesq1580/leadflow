-- 072: bloqueio de e-mail (devolvido/descadastro/denúncia) não impede entrega por WhatsApp/SMS.
-- Remove apenas a checagem de email_campaign_contacts de admin_new_lead_source_error.
-- STOP (sms_opted_out) e bloqueios de sequência de IA continuam valendo.
-- Sem dados alterados; permissões preservadas por CREATE OR REPLACE (reaplicadas abaixo por segurança).
CREATE OR REPLACE FUNCTION public.admin_new_lead_source_error(p_source uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l public.leads;
BEGIN
 SELECT * INTO l FROM leads WHERE id=p_source;
 IF l.id IS NULL THEN RETURN 'source_not_found'; END IF;
 IF l.archived OR l.redelivered_to_lead_id IS NOT NULL OR l.contract_closed OR l.status IN ('sold','closed','converted') OR EXISTS(
  SELECT 1 FROM pipeline_leads pl JOIN pipeline_stages s ON s.id=pl.stage_id WHERE pl.lead_id=l.id AND ai_sequence_won(s.name)
 ) THEN RETURN 'source_unavailable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM buyers WHERE id=l.assigned_to AND is_admin=true) THEN RETURN 'source_not_admin'; END IF;
 IF l.sms_opted_out OR EXISTS(SELECT 1 FROM ai_sequence_suppressions WHERE lead_id=l.id AND NOT(reason='delivery_unknown' AND resolved_at IS NOT NULL))
 THEN RETURN 'contact_blocked'; END IF;
 IF l.lead_language IS NULL OR l.lead_language NOT IN ('pt','es') THEN RETURN 'unsupported_language'; END IF;
 IF EXISTS(SELECT 1 FROM sequence_enrollments WHERE lead_id=l.id AND delivery_status IN ('sending','unknown'))
 OR EXISTS(SELECT 1 FROM automation_runs WHERE lead_id=l.id AND status IN ('skipped','failed'))
 OR EXISTS(SELECT 1 FROM sms_messages WHERE lead_id=l.id AND direction='out' AND status IN ('sending','queued','unknown')) THEN RETURN 'source_busy'; END IF;
 RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.admin_new_lead_source_error(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_new_lead_source_error(uuid) TO service_role;
