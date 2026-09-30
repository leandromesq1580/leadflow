-- Explicit reconciliation after exact proof and authorization; no reactivation.
BEGIN;
ALTER TABLE public.ai_sequence_suppressions ADD COLUMN resolved_at timestamptz;
COMMENT ON COLUMN public.ai_sequence_suppressions.resolved_at IS
 'Explicit reconciliation timestamp; only delivery_unknown may be bypassed. Does not resume enrollment.';

CREATE OR REPLACE FUNCTION public.ai_sequence_block(p_buyer uuid,p_lead uuid,p_sequence uuid,p_since timestamptz DEFAULT NULL) RETURNS text
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l public.leads; s public.sequences; reason text;
BEGIN
 SELECT * INTO l FROM leads WHERE id=p_lead;
 SELECT * INTO s FROM sequences WHERE id=p_sequence;
 IF l.id IS NULL OR s.id IS NULL OR l.assigned_to IS DISTINCT FROM p_buyer OR s.buyer_id<>p_buyer OR l.assigned_to_member IS NOT NULL THEN RETURN 'ownership_changed'; END IF;
 IF l.sms_opted_out OR EXISTS(SELECT 1 FROM ai_sequence_suppressions a WHERE a.lead_id=p_lead AND a.reason='optout') THEN RETURN 'optout'; END IF;
 SELECT a.reason INTO reason FROM ai_sequence_suppressions a WHERE a.buyer_id=p_buyer AND a.lead_id=p_lead
  AND NOT (a.reason='delivery_unknown' AND a.resolved_at IS NOT NULL);
 IF reason IS NOT NULL THEN RETURN reason; END IF;
 -- Use the enrollment boundary, not historical conversation. New enrollments use
 -- transaction start (also enrolled_at), so a concurrent inbound is not lost.
 p_since:=coalesce(p_since,(SELECT min(enrolled_at) FROM sequence_enrollments WHERE buyer_id=p_buyer AND lead_id=p_lead AND sequence_id=p_sequence AND mode='ai_until_reply' AND status IN ('active','paused')),now());
 IF EXISTS(SELECT 1 FROM whatsapp_messages WHERE buyer_id=p_buyer AND lead_id=p_lead AND direction='in' AND sent_at>=p_since) OR EXISTS(SELECT 1 FROM sms_messages WHERE lead_id=p_lead AND direction='in' AND created_at>=p_since) THEN RETURN 'replied'; END IF;
 IF l.contract_closed OR EXISTS(SELECT 1 FROM pipeline_leads pl JOIN pipeline_stages ps ON ps.id=pl.stage_id JOIN pipelines p ON p.id=pl.pipeline_id WHERE pl.lead_id=p_lead AND p.buyer_id=p_buyer AND ai_sequence_won(ps.name)) THEN RETURN 'sold'; END IF;
 IF l.archived THEN RETURN 'archived'; END IF;
 IF NOT EXISTS(SELECT 1 FROM buyers WHERE id=p_buyer AND is_active=true) THEN RETURN 'buyer_inactive'; END IF;
 IF s.enabled IS DISTINCT FROM true THEN RETURN 'sequence_disabled'; END IF;
 IF s.trigger_stage_id IS NOT NULL AND coalesce((s.ai_config->>'stop_on_stage_exit')::boolean,true) AND NOT EXISTS(SELECT 1 FROM pipeline_leads WHERE lead_id=p_lead AND stage_id=s.trigger_stage_id) THEN RETURN 'stage_exit'; END IF;
 RETURN NULL;
END $$;
-- All 052 writers already lock enrollments before inserting suppressions.
-- Rearm DO NOTHING writers (claim/defer/manual/delete) before their INSERT.
-- Inbound/recheck use DO UPDATE: rearm their NEW row on UPDATE OF reason.
-- Updating their conflict row in BEFORE INSERT would cause PostgreSQL 21000.
-- Original reason/created_at survive DO NOTHING; optout precedence is unchanged.
CREATE FUNCTION public.rearm_ai_sequence_suppression() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 NEW.resolved_at := NULL;
 IF TG_OP='INSERT' AND NEW.reason IN ('manual','delivery_unknown') THEN
  UPDATE public.ai_sequence_suppressions SET resolved_at=NULL
  WHERE buyer_id=NEW.buyer_id AND lead_id=NEW.lead_id AND resolved_at IS NOT NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.rearm_ai_sequence_suppression() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rearm_ai_sequence_suppression() TO service_role;
CREATE TRIGGER ai_rearm_suppression BEFORE INSERT OR UPDATE OF reason ON public.ai_sequence_suppressions
 FOR EACH ROW EXECUTE FUNCTION public.rearm_ai_sequence_suppression();
COMMIT;
