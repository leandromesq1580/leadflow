-- Only Meta-captured leads may receive administrative email campaigns.
-- Applies to preview, new permission, snapshots, resends and final send authorization.
-- No lead/client data is changed and no email is sent by this migration.
BEGIN;

CREATE FUNCTION public.ec_is_meta_lead(p_lead uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.leads l WHERE l.id=p_lead
  AND nullif(btrim(l.meta_lead_id),'') IS NOT NULL
  AND coalesce(l.form_name,'')<>'csv_import'
  AND coalesce(l.raw_data->>'source','') NOT IN ('csv_import','import_csv'))
$$;

CREATE OR REPLACE FUNCTION public.ec_rows(p_filters jsonb,p_forms jsonb)
RETURNS TABLE(lead_id uuid,email text,name text,language text,reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH candidates AS (
  SELECT l.id,lower(btrim(l.email)) e,l.name,
    coalesce(p_forms->>l.form_name,l.lead_language) lang,l.created_at,public.ec_is_meta_lead(l.id) is_meta
  FROM public.leads l
  WHERE (coalesce(p_filters->>'buyer_id','')='' OR l.assigned_to=(p_filters->>'buyer_id')::uuid)
    AND (NOT p_filters ? 'states' OR jsonb_array_length(p_filters->'states')=0 OR l.state IN (SELECT jsonb_array_elements_text(p_filters->'states')))
    AND (NOT p_filters ? 'types' OR jsonb_array_length(p_filters->'types')=0 OR l.type IN (SELECT jsonb_array_elements_text(p_filters->'types')))
    AND (NOT p_filters ? 'languages' OR jsonb_array_length(p_filters->'languages')=0 OR coalesce(p_forms->>l.form_name,l.lead_language) IN (SELECT jsonb_array_elements_text(p_filters->'languages')))
    AND (coalesce(p_filters->>'since','')='' OR l.created_at >= (p_filters->>'since')::timestamptz)
    AND (coalesce(p_filters->>'until','')='' OR l.created_at < (p_filters->>'until')::timestamptz)
 ), ranked AS (
  -- A newer imported duplicate must never displace the Meta registration.
  SELECT *,row_number() OVER(PARTITION BY e ORDER BY is_meta DESC,created_at DESC,id) rn FROM candidates
 ), grouped AS (
  -- Preserve language conflict protection over the entire address domain.
  SELECT lower(btrim(x.email)) e,count(DISTINCT coalesce(p_forms->>x.form_name,x.lead_language)) languages,
    bool_or(coalesce(p_forms->>x.form_name,x.lead_language) IS NULL OR coalesce(p_forms->>x.form_name,x.lead_language) NOT IN ('pt','es')) bad_lang
  FROM public.leads x WHERE lower(btrim(x.email)) IN (SELECT e FROM candidates) GROUP BY lower(btrim(x.email))
 )
 SELECT r.id,r.e,coalesce(r.name,''),r.lang,
   CASE WHEN NOT r.is_meta THEN 'non_meta'
    WHEN coalesce(r.e,'')='' THEN 'missing_email'
    WHEN r.e !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' OR length(r.e)>254 THEN 'invalid_email'
    WHEN r.rn>1 THEN 'duplicate'
    WHEN g.languages<>1 OR g.bad_lang THEN 'language'
    WHEN c.suppressed_at IS NOT NULL THEN 'suppressed'
    WHEN c.consent_at IS NULL THEN 'permission'
    ELSE NULL END
 FROM ranked r LEFT JOIN grouped g ON g.e IS NOT DISTINCT FROM r.e
 LEFT JOIN public.email_campaign_contacts c ON c.email=r.e
$$;

CREATE OR REPLACE FUNCTION public.ec_audience(p_actor uuid,p_filters jsonb,p_forms jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM public.ec_admin(p_actor);
 WITH a AS (SELECT * FROM public.ec_rows(p_filters,p_forms))
 SELECT jsonb_build_object('source_policy','meta_only','total_leads',count(*),'eligible',count(*) FILTER(WHERE reason IS NULL),
  'pt',count(*) FILTER(WHERE reason IS NULL AND language='pt'),'es',count(*) FILTER(WHERE reason IS NULL AND language='es'),
  'exclusions',jsonb_build_object('non_meta',count(*) FILTER(WHERE reason='non_meta'),'missing_email',count(*) FILTER(WHERE reason='missing_email'),'invalid_email',count(*) FILTER(WHERE reason='invalid_email'),
    'duplicate',count(*) FILTER(WHERE reason='duplicate'),'language',count(*) FILTER(WHERE reason='language'),'suppressed',count(*) FILTER(WHERE reason='suppressed'),'permission',count(*) FILTER(WHERE reason='permission')))
 INTO result FROM a;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.ec_resend_rows(p_origin uuid)
RETURNS TABLE(recipient_id uuid,lead_id uuid,email text,name text,language text,reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT r.id,r.lead_id,r.email,r.name,r.language,
  CASE WHEN NOT public.ec_is_meta_lead(r.lead_id) THEN 'non_meta'
   WHEN r.clicked_at IS NOT NULL THEN 'clicked'
   WHEN r.opened_at IS NOT NULL THEN 'opened'
   WHEN r.state<>'delivered' OR r.delivered_at IS NULL THEN 'not_delivered'
   WHEN r.delivered_at>now()-interval '48 hours' THEN 'too_recent'
   WHEN c.email IS NULL OR c.suppressed_at IS NOT NULL OR c.consent_at IS NULL THEN 'blocked'
   WHEN NOT EXISTS(SELECT 1 FROM public.leads l WHERE l.id=r.lead_id AND lower(btrim(l.email))=r.email) THEN 'lead_changed'
   ELSE NULL END
 FROM public.email_campaign_recipients r LEFT JOIN public.email_campaign_contacts c ON c.email=r.email
 WHERE r.campaign_id=p_origin
$$;

CREATE OR REPLACE FUNCTION public.ec_resend_preview(p_actor uuid,p_origin uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.email_campaigns; existing uuid; blocked text; result jsonb;
BEGIN
 PERFORM public.ec_admin(p_actor);
 SELECT * INTO o FROM public.email_campaigns WHERE id=p_origin;
 IF NOT FOUND THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
 SELECT id INTO existing FROM public.email_campaigns WHERE resend_of=o.id;
 blocked:=CASE WHEN o.resend_of IS NOT NULL THEN 'resend_of_resend'
  WHEN NOT public.ec_tracking_confirmed(o.tracking_snapshot) THEN 'tracking_unconfirmed'
  WHEN o.state<>'completed' THEN 'origin_not_completed'
  WHEN existing IS NOT NULL THEN 'resend_exists' ELSE NULL END;
 WITH a AS (SELECT * FROM public.ec_resend_rows(o.id))
 SELECT jsonb_build_object('source_policy','meta_only','origin_id',o.id,'origin_name',o.name,'allowed',blocked IS NULL,'reason',blocked,'existing_resend',existing,
  'total',count(*),'eligible',CASE WHEN blocked IS NULL OR blocked='resend_exists' THEN count(*) FILTER(WHERE reason IS NULL) ELSE 0 END,
  'pt',CASE WHEN blocked IS NULL OR blocked='resend_exists' THEN count(*) FILTER(WHERE reason IS NULL AND language='pt') ELSE 0 END,
  'es',CASE WHEN blocked IS NULL OR blocked='resend_exists' THEN count(*) FILTER(WHERE reason IS NULL AND language='es') ELSE 0 END,
  'exclusions',jsonb_build_object('non_meta',count(*) FILTER(WHERE reason='non_meta'),'clicked',count(*) FILTER(WHERE reason='clicked'),'opened',count(*) FILTER(WHERE reason='opened'),
   'not_delivered',count(*) FILTER(WHERE reason='not_delivered'),'too_recent',count(*) FILTER(WHERE reason='too_recent'),
   'blocked',count(*) FILTER(WHERE reason='blocked'),'lead_changed',count(*) FILTER(WHERE reason='lead_changed')))
 INTO result FROM a;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.ec_authorize(p_id uuid,p_lease uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.email_campaign_recipients; c public.email_campaigns; contact public.email_campaign_contacts;
BEGIN
 SELECT c0.* INTO c FROM public.email_campaigns c0 JOIN public.email_campaign_recipients r0 ON r0.campaign_id=c0.id WHERE r0.id=p_id FOR UPDATE OF c0;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO r FROM public.email_campaign_recipients WHERE id=p_id FOR UPDATE;
 IF r.lease IS DISTINCT FROM p_lease OR r.state<>'reserved' OR r.lease_until<clock_timestamp() THEN RETURN false; END IF;
 IF NOT public.ec_is_meta_lead(r.lead_id) THEN
  UPDATE public.email_campaign_recipients SET state='suppressed',reason='non_meta',lease=NULL,lease_until=NULL WHERE id=r.id;
  RETURN false;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.leads l WHERE l.id=r.lead_id AND lower(btrim(l.email))=r.email) THEN
  UPDATE public.email_campaign_recipients SET state='suppressed',reason='lead_removed_or_email_changed' WHERE id=r.id;
  RETURN false;
 END IF;
 IF c.state NOT IN ('scheduled','running') THEN
  UPDATE public.email_campaign_recipients SET state=CASE WHEN c.state='cancelled' THEN 'cancelled' ELSE 'pending' END,lease=NULL,lease_until=NULL WHERE id=r.id;
  RETURN false;
 END IF;
 IF c.resend_of IS NOT NULL AND public.ec_resend_engaged(c.id,r.email) THEN
  UPDATE public.email_campaign_recipients SET state='suppressed',reason='engaged_before_resend' WHERE id=r.id;
  RETURN false;
 END IF;
 SELECT * INTO contact FROM public.email_campaign_contacts WHERE email=r.email FOR UPDATE;
 IF NOT FOUND OR contact.suppressed_at IS NOT NULL OR contact.consent_at IS NULL THEN
  UPDATE public.email_campaign_recipients SET state='suppressed',reason='permission_or_suppression' WHERE id=r.id;
  RETURN false;
 END IF;
 UPDATE public.email_campaign_recipients SET state='sending',started_at=clock_timestamp(),lease_until=clock_timestamp()+interval '5 minutes' WHERE id=r.id;
 RETURN true;
END $$;

-- Counts through the existing admin API, avoiding misleading RLS-hidden zeroes.
CREATE FUNCTION public.ec_meta_policy(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM public.ec_admin(p_actor);
 SELECT jsonb_build_object('source_policy','meta_only','checked_at',clock_timestamp(),
  'non_meta_permissions',count(*) FILTER(WHERE c.consent_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.leads l WHERE lower(btrim(l.email))=c.email AND public.ec_is_meta_lead(l.id))),
  'meta_permissions',count(*) FILTER(WHERE c.consent_at IS NOT NULL AND EXISTS(SELECT 1 FROM public.leads l WHERE lower(btrim(l.email))=c.email AND public.ec_is_meta_lead(l.id))),
  'non_meta_queued',(SELECT count(*) FROM public.email_campaign_recipients r WHERE r.state IN ('pending','reserved') AND NOT public.ec_is_meta_lead(r.lead_id)),
  'non_meta_in_flight',(SELECT count(*) FROM public.email_campaign_recipients r WHERE r.state='sending' AND NOT public.ec_is_meta_lead(r.lead_id)),
  'last_revocation',(SELECT jsonb_build_object('at',a.created_at,'details',a.details) FROM public.email_campaign_audit a WHERE a.action='permission_revoked_non_meta' ORDER BY a.created_at DESC,a.id DESC LIMIT 1))
 INTO result FROM public.email_campaign_contacts c;
 RETURN result;
END $$;

-- Explicit admin operation, called only after the owner's authorization.
-- Same lock order as ec_authorize: campaign -> recipient -> contact.
-- Completed/sending/unknown receipts and bounce/unsubscribe flags remain untouched.
CREATE FUNCTION public.ec_revoke_non_meta(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='3s' AS $$
DECLARE n integer; blocked integer; result jsonb;
BEGIN
 PERFORM public.ec_admin(p_actor);
 PERFORM id FROM public.email_campaigns ORDER BY id FOR UPDATE;
 UPDATE public.email_campaign_recipients r SET state='suppressed',reason='non_meta',lease=NULL,lease_until=NULL
 WHERE r.state IN ('pending','reserved') AND NOT public.ec_is_meta_lead(r.lead_id);
 GET DIAGNOSTICS blocked=ROW_COUNT;
 UPDATE public.email_campaign_contacts c SET consent_at=NULL,consent_by=NULL,consent_evidence=NULL
 WHERE c.consent_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.leads l WHERE lower(btrim(l.email))=c.email AND public.ec_is_meta_lead(l.id));
 GET DIAGNOSTICS n=ROW_COUNT;
 result:=jsonb_build_object('revoked_contacts',n,'blocked_recipients',blocked,'source_policy','meta_only');
 INSERT INTO public.email_campaign_audit(actor,action,details) VALUES(p_actor,'permission_revoked_non_meta',result);
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.ec_is_meta_lead(uuid),public.ec_meta_policy(uuid),public.ec_revoke_non_meta(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ec_is_meta_lead(uuid),public.ec_meta_policy(uuid),public.ec_revoke_non_meta(uuid) TO service_role;
COMMIT;
