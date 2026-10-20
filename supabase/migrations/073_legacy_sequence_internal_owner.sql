-- 073: sequência comum (legacy) não para mais por "ownership_changed" quando o lead é da equipe interna.
-- Causa: o guard da 052/053 (feito para IA) exigia lead.assigned_to = dono da sequência e assigned_to_member nulo
-- também para sequências comuns. 56 inscrições em 14 dias pararam com 0 mensagens enviadas.
-- Sequência de IA (mode='ai_until_reply'): regra estrita inalterada.
-- Sequência comum: continua parando se o lead é de comprador comum, se a sequência é de comprador comum,
-- ou se o lead saiu do quadro da dona da sequência. Membro delegado deixa de bloquear.
-- Nenhum dado é alterado; inscrições já paradas permanecem paradas.
CREATE OR REPLACE FUNCTION public.ai_sequence_block_before_admin_redelivery(p_buyer uuid, p_lead uuid, p_sequence uuid, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE l public.leads; s public.sequences; reason text;
BEGIN
 SELECT * INTO l FROM leads WHERE id=p_lead;
 SELECT * INTO s FROM sequences WHERE id=p_sequence;
 IF l.id IS NULL OR s.id IS NULL OR s.buyer_id<>p_buyer THEN RETURN 'ownership_changed'; END IF;
  IF s.mode='ai_until_reply' THEN
   IF l.assigned_to IS DISTINCT FROM p_buyer OR l.assigned_to_member IS NOT NULL THEN RETURN 'ownership_changed'; END IF;
  ELSIF l.assigned_to IS DISTINCT FROM p_buyer AND NOT (
   -- Sequência comum: conta admin de vendas trabalhando lead de outra conta admin (time interno)
   -- que está no quadro dela. Lead de comprador comum / fora do quadro continua parando.
   EXISTS(SELECT 1 FROM buyers o WHERE o.id=l.assigned_to AND o.is_admin)
   AND EXISTS(SELECT 1 FROM buyers sb WHERE sb.id=p_buyer AND sb.is_admin)
   AND EXISTS(SELECT 1 FROM pipeline_leads pl JOIN pipelines pp ON pp.id=pl.pipeline_id WHERE pl.lead_id=p_lead AND pp.buyer_id=p_buyer)
  ) THEN RETURN 'ownership_changed'; END IF;
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
END $function$;
