-- Owner-authorized removal of the artificial daily quota.
-- 0 means no daily cap; positive values retain compatibility with older workers.
-- Do not reset meters or rewrite any campaign/recipient/permission/history.
BEGIN;
CREATE OR REPLACE FUNCTION public.ec_claim(p_daily integer,p_tracking jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.email_campaigns; r public.email_campaign_recipients; meter public.email_campaign_rate; t timestamptz:=clock_timestamp();
BEGIN
 IF p_daily<0 OR p_daily>10000 OR p_daily IS NULL THEN RAISE EXCEPTION 'invalid_daily_limit'; END IF;
 SELECT * INTO meter FROM public.email_campaign_rate WHERE id=true FOR UPDATE;
 t:=clock_timestamp();
 FOR c IN SELECT * FROM public.email_campaigns WHERE state IN ('scheduled','running','paused','cancelled') FOR UPDATE SKIP LOCKED LOOP
  UPDATE public.email_campaign_recipients SET state='unknown',reason='worker_interrupted' WHERE campaign_id=c.id AND state='sending' AND lease_until<t;
  UPDATE public.email_campaign_recipients SET state=CASE WHEN c.state='cancelled' THEN 'cancelled' ELSE 'pending' END,lease=NULL,lease_until=NULL WHERE campaign_id=c.id AND state='reserved' AND lease_until<t;
  UPDATE public.email_campaign_recipients r0 SET state='suppressed',reason='permission_or_suppression'
  WHERE r0.campaign_id=c.id AND r0.state='pending'
  AND EXISTS(SELECT 1 FROM public.email_campaign_contacts x WHERE x.email=r0.email AND (x.suppressed_at IS NOT NULL OR x.consent_at IS NULL));
  IF c.resend_of IS NOT NULL THEN
   UPDATE public.email_campaign_recipients r0 SET state='suppressed',reason='engaged_before_resend'
   WHERE r0.campaign_id=c.id AND r0.state='pending' AND public.ec_resend_engaged(c.id,r0.email);
  END IF;
  IF c.state IN ('scheduled','running') AND c.scheduled_at<=t
   AND EXISTS(SELECT 1 FROM public.email_campaign_recipients x WHERE x.campaign_id=c.id AND x.state='pending')
   AND (NOT public.ec_tracking_still_confirmed(c.tracking_snapshot,p_tracking)
    OR (c.resend_of IS NOT NULL AND NOT (public.ec_tracking_confirmed(p_tracking) AND p_tracking->>'status'='verified'))) THEN
   UPDATE public.email_campaigns SET state='paused',pause_reason='tracking_not_confirmed',updated_at=t WHERE id=c.id;
   INSERT INTO public.email_campaign_audit(actor,campaign_id,action,details) VALUES(NULL,c.id,'pause',jsonb_build_object('reason','tracking_not_confirmed','promised',c.tracking_snapshot,'current',p_tracking,'resend_of',c.resend_of));
   CONTINUE;
  END IF;
  PERFORM public.ec_complete(c.id);
 END LOOP;
 IF meter.day IS DISTINCT FROM (t AT TIME ZONE 'UTC')::date THEN meter.day:=(t AT TIME ZONE 'UTC')::date;meter.day_used:=0; END IF;
 IF meter.minute IS DISTINCT FROM date_trunc('minute',t) THEN meter.minute:=date_trunc('minute',t);meter.minute_used:=0; END IF;
 IF (p_daily>0 AND meter.day_used>=p_daily) OR meter.minute_used>=10 THEN RETURN NULL; END IF;
 SELECT * INTO c FROM public.email_campaigns c0 WHERE state IN ('scheduled','running') AND scheduled_at<=t
 AND EXISTS(SELECT 1 FROM public.email_campaign_recipients x WHERE x.campaign_id=c0.id AND x.state='pending')
 ORDER BY scheduled_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- Preserve the tracking race recheck from 063 under the selected campaign lock.
 IF NOT public.ec_tracking_still_confirmed(c.tracking_snapshot,p_tracking)
  OR (c.resend_of IS NOT NULL AND NOT COALESCE(public.ec_tracking_confirmed(p_tracking) AND p_tracking->>'status'='verified',false)) THEN
  UPDATE public.email_campaigns SET state='paused',pause_reason='tracking_not_confirmed',updated_at=t WHERE id=c.id;
  INSERT INTO public.email_campaign_audit(actor,campaign_id,action,details) VALUES(NULL,c.id,'pause',jsonb_build_object('reason','tracking_not_confirmed','promised',c.tracking_snapshot,'current',p_tracking,'resend_of',c.resend_of));
  RETURN NULL;
 END IF;
 SELECT * INTO r FROM public.email_campaign_recipients WHERE campaign_id=c.id AND state='pending' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.email_campaign_recipients SET state='reserved',lease=gen_random_uuid(),lease_until=t+interval '5 minutes' WHERE id=r.id RETURNING * INTO r;
 UPDATE public.email_campaign_rate SET day=meter.day,day_used=meter.day_used+1,minute=meter.minute,minute_used=meter.minute_used+1 WHERE id=true;
 UPDATE public.email_campaigns SET state='running',updated_at=t WHERE id=c.id;
 RETURN to_jsonb(r)||jsonb_build_object('campaign',to_jsonb(c));
END $$;
REVOKE ALL ON FUNCTION public.ec_claim(integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ec_claim(integer,jsonb) TO service_role;
COMMIT;
