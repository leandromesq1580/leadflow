-- Window-only updates preserve enrollments; all other cancellation triggers remain.
-- Install before publishing the administrative route. No data backfill or activation.
BEGIN;
CREATE OR REPLACE TRIGGER ai_recheck_sequence
AFTER UPDATE OF enabled,trigger_stage_id,ai_config ON public.sequences
FOR EACH ROW
WHEN (NOT coalesce(
  NEW.mode = 'ai_until_reply'
  AND jsonb_typeof(OLD.ai_config) = 'object'
  AND jsonb_typeof(NEW.ai_config) = 'object'
  AND (to_jsonb(OLD) - ARRAY['ai_config','updated_at','reply_move_version'])
      IS NOT DISTINCT FROM (to_jsonb(NEW) - ARRAY['ai_config','updated_at','reply_move_version'])
  AND (OLD.ai_config - ARRAY['start','end']) IS NOT DISTINCT FROM (NEW.ai_config - ARRAY['start','end'])
  AND (OLD.ai_config->'start' IS DISTINCT FROM NEW.ai_config->'start'
       OR OLD.ai_config->'end' IS DISTINCT FROM NEW.ai_config->'end')
  AND jsonb_typeof(NEW.ai_config->'start') = 'string'
  AND jsonb_typeof(NEW.ai_config->'end') = 'string'
  AND NEW.ai_config->>'start' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND NEW.ai_config->>'end' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND NEW.ai_config->>'start' < NEW.ai_config->>'end'
, false))
EXECUTE FUNCTION public.recheck_ai_sequences();
COMMENT ON TRIGGER ai_recheck_sequence ON public.sequences IS 'lead4pro:window-only-preserve:v1';

-- Fail closed if a new route runs before this migration or the trigger is disabled.
CREATE FUNCTION public.admin_sequence_window_ready() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t
   WHERE t.tgrelid='public.sequences'::regclass AND t.tgname='ai_recheck_sequence'
   AND t.tgfoid='public.recheck_ai_sequences()'::regprocedure
   AND t.tgenabled='O' AND t.tgqual IS NOT NULL
   AND pg_catalog.obj_description(t.oid,'pg_trigger')='lead4pro:window-only-preserve:v1');
$$;
REVOKE ALL ON FUNCTION public.admin_sequence_window_ready() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sequence_window_ready() TO service_role;
COMMIT;
