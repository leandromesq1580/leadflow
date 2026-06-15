-- ============================================
-- 018: Sincroniza o dono da thread de WhatsApp com o dono do lead
-- ============================================
-- Problema: whatsapp_messages.buyer_id é um "carimbo" do dono no momento da
-- mensagem. Quando um lead é re-atribuído (repasse / pego de volta), as
-- mensagens antigas continuavam no dono anterior — então quem assume o lead
-- não via a conversa no inbox.
--
-- Solução: trigger que, sempre que leads.assigned_to muda (e o lead NÃO está
-- delegado a um team_member — esse caso é tratado no código), realinha o
-- buyer_id de TODAS as mensagens daquele lead pro novo dono. À prova de falha:
-- cobre qualquer caminho (UI, API, recuperação, edição manual no banco).

CREATE OR REPLACE FUNCTION sync_wa_owner_on_reassign()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     AND NEW.assigned_to IS NOT NULL
     AND NEW.assigned_to_member IS NULL THEN
    UPDATE whatsapp_messages
       SET buyer_id = NEW.assigned_to
     WHERE lead_id = NEW.id
       AND buyer_id IS DISTINCT FROM NEW.assigned_to;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_wa_owner ON leads;
CREATE TRIGGER trg_sync_wa_owner
  AFTER UPDATE OF assigned_to ON leads
  FOR EACH ROW
  EXECUTE FUNCTION sync_wa_owner_on_reassign();
