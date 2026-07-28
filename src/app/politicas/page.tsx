import { CURRENT_POLICY_VERSION } from '@/lib/policies'

export const metadata = { title: 'Política de Leads e Uso — Lead4Pro' }

/**
 * /politicas — texto público e versionado da Política de Leads e Uso.
 * O aceite (clickwrap) acontece nas telas de compra; esta página é o texto integral
 * referenciado pelo checkbox. Mudou regra → subir CURRENT_POLICY_VERSION em lib/policies.
 */
export default function PoliticasPage() {
  const S = ({ n, t, children }: { n: string; t: string; children: React.ReactNode }) => (
    <section className="mb-7">
      <h2 className="text-[16px] font-bold mb-2" style={{ color: '#1a1a2e' }}>{n}. {t}</h2>
      <div className="text-[13.5px] leading-relaxed space-y-2" style={{ color: '#3f3c55' }}>{children}</div>
    </section>
  )
  return (
    <div className="min-h-screen" style={{ background: '#f8fafc' }}>
      <div className="max-w-3xl mx-auto px-6 py-10">
        <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#6366f1' }}>Lead4Pro · lead4producers.com</p>
        <h1 className="text-[26px] font-extrabold mt-1" style={{ color: '#1a1a2e' }}>Política de Leads e Uso da Plataforma</h1>
        <p className="text-[12px] mt-1 mb-8" style={{ color: '#94a3b8' }}>Versão {CURRENT_POLICY_VERSION} · O aceite desta política é registrado com data, hora e conta.</p>

        <S n="1" t="O que você está comprando">
          <p>Leads exclusivos são contatos gerados por campanhas próprias, entregues <b>1 para 1</b> (cada lead vai para um único comprador). Lead é <b>oportunidade de contato</b>, não venda garantida: não prometemos fechamento, resposta ou comparecimento do lead.</p>
        </S>
        <S n="2" t="Como a entrega funciona">
          <p>A entrega é automática, por fila, respeitando: <b>seus estados licenciados</b>, <b>seu saldo de créditos</b> e <b>suas janelas de disponibilidade</b> configuradas. Lead que chega fora da sua janela aguarda um período de carência e pode ser encaminhado a outro comprador apto — mantenha suas janelas atualizadas em Configurações.</p>
          <p>A ordem da fila prioriza quem recebeu menos leads nos últimos 30 dias, para distribuição justa entre compradores do mesmo estado.</p>
        </S>
        <S n="3" t="Garantia de troca de leads">
          <p>Lead trabalhado que nunca respondeu pode ser trocado por 1 crédito, quando as três condições acontecerem juntas: <b>(a)</b> o lead está com você há pelo menos <b>14 dias</b>; <b>(b)</b> você tentou contato em pelo menos <b>8 dias diferentes</b> usando as ferramentas da plataforma (ligação pelo botão Ligar e/ou SMS automático); <b>(c)</b> o lead <b>não respondeu nada</b> no período — nenhuma ligação atendida, nenhuma resposta de WhatsApp ou SMS.</p>
          <p>Limite: até <b>30% dos leads pagos</b> podem ser trocados por comprador. Lead que respondeu qualquer coisa, atendeu ligação, marcou reunião ou fechou contrato não é elegível. Tentativas feitas <b>fora da plataforma</b> (ex.: ligação direta do seu celular) não são registradas e <b>não contam</b> para a garantia. O pedido passa por análise e o histórico registrado pela plataforma é a única evidência considerada.</p>
        </S>
        <S n="4" t="Leads frios">
          <p>Pacotes de leads frios (contatos com 7+ dias) são vendidos com <b>entrega manual via planilha</b>, não geram créditos na plataforma, não entram na fila de distribuição e <b>não têm garantia de troca</b>. Preço reduzido reflete essas condições.</p>
        </S>
        <S n="5" t="Ligações, SMS e gravação">
          <p>As ligações feitas pelo botão Ligar usam número local e são <b>gravadas</b>; o lead ouve um aviso de gravação antes de a chamada conectar. As gravações ficam disponíveis nos anexos do lead e são usadas para qualidade e auditoria (inclusive da garantia de troca).</p>
          <p>Quando uma ligação não obtém contato, a plataforma pode enviar <b>SMS automático</b> ao lead em seu nome (limitado por dia e por lead, em horário permitido). Leads que pedirem para não receber mensagens (STOP) são automaticamente excluídos de novos envios — respeite sempre a legislação aplicável (ex.: TCPA).</p>
        </S>
        <S n="6" t="Créditos, pagamentos e reembolso">
          <p>Créditos de lead são debitados na entrega automática. Compras e assinaturas são processadas via Stripe. <b>Não há reembolso em dinheiro</b> de créditos ou mensalidades já pagas; a garantia de troca (seção 3) é o mecanismo de reposição. Assinaturas renovam automaticamente e podem ser canceladas a qualquer momento, valendo até o fim do ciclo pago.</p>
        </S>
        <S n="7" t="Uso adequado da conta">
          <p>A conta é individual: não compartilhe acesso com terceiros fora da sua equipe cadastrada. É proibido revender ou repassar leads a terceiros, usar os dados dos leads fora da finalidade de cotação de seguros, ou enviar comunicações abusivas. O WhatsApp conectado é o seu número e a operação dele é de sua responsabilidade.</p>
        </S>
        <S n="8" t="Alterações desta política">
          <p>Podemos atualizar esta política; mudanças relevantes geram nova versão e novo aceite antes da próxima compra. A versão vigente fica sempre publicada nesta página.</p>
        </S>

        <p className="text-[12px] mt-10 pt-4 border-t" style={{ color: '#94a3b8', borderColor: '#e8ecf4' }}>
          Dúvidas? Fale com o suporte pelo WhatsApp oficial da plataforma. · Lead4Pro · Versão {CURRENT_POLICY_VERSION}
        </p>
      </div>
    </div>
  )
}
