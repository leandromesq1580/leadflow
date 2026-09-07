import { LocaleSwitcher } from '@/components/locale-switcher'
import { getLocale } from '@/lib/locale'
import { CURRENT_POLICY_VERSION } from '@/lib/policies'
import type { Locale } from '@/lib/i18n'

type PolicyCopy = {
  title: string
  version: string
  acceptance: string
  sections: Array<{ title: string; paragraphs: string[] }>
  support: string
}

const COPY: Record<Locale, PolicyCopy> = {
  pt: {
    title: 'Política de Leads e Uso da Plataforma', version: 'Versão',
    acceptance: 'O aceite desta política é obrigatório e fica registrado com a conta, data, hora, endereço IP e versão aceita.',
    sections: [
      { title: 'Teste gratuito e assinatura do sistema', paragraphs: [
        'A Lead4Pro oferece 7 dias gratuitos para que o usuário teste e valide a ferramenta antes de contratar. O teste não exige a compra de leads.',
        'Uma vez realizada uma assinatura paga, não existe reembolso da mensalidade ou do período contratado, salvo quando a legislação aplicável determinar o contrário. O acesso permanece disponível durante o período já pago.',
        'A assinatura do sistema dá acesso às funcionalidades contratadas da plataforma. Ela não inclui créditos, pacotes ou entrega de leads. Leads são produtos separados e precisam ser comprados separadamente.',
      ] },
      { title: 'Renovação automática e cancelamento', paragraphs: [
        'A assinatura é recorrente e será renovada automaticamente no fim de cada ciclo, com cobrança no método de pagamento cadastrado, até que seja cancelada.',
        'Caso não queira a próxima renovação, o usuário deve entrar na plataforma e usar a opção “Gerenciar ou cancelar assinatura” antes da próxima cobrança. O cancelamento interrompe cobranças futuras e não antecipa o encerramento do período já pago.',
      ] },
      { title: 'Compra e entrega de leads', paragraphs: [
        'Leads exclusivos são contatos gerados por campanhas e entregues individualmente a um comprador elegível. Um lead representa uma oportunidade de contato, não uma venda, resposta, reunião ou fechamento garantido.',
        'Pacotes de leads são independentes da assinatura do CRM. A entrega considera o idioma comprado, os estados licenciados, o saldo disponível e as regras de distribuição configuradas na plataforma.',
      ] },
      { title: 'Política de troca de leads', paragraphs: [
        'A troca de um lead somente poderá ser solicitada quando o telefone e/ou o endereço de e-mail fornecido para aquele lead não existir, for inválido ou estiver comprovadamente fora de serviço.',
        'Falta de resposta, falta de interesse, desistência, ausência em reunião ou falta de fechamento não dão direito à troca. Toda solicitação fica sujeita à verificação da equipe Lead4Pro antes da devolução de crédito.',
      ] },
      { title: 'Leads frios', paragraphs: ['Pacotes de leads frios são contatos com 7 dias ou mais, vendidos por preço reduzido e com entrega manual. Eles não entram na fila automática e não têm garantia de troca.'] },
      { title: 'Ligações, mensagens e gravações', paragraphs: [
        'Ligações feitas pela plataforma podem usar números locais e ser gravadas após o aviso aplicável. Mensagens de WhatsApp, SMS, e-mail e automações devem ser usadas de acordo com a legislação e com os pedidos de cancelamento de contato do destinatário.',
        'O usuário é responsável pelo conteúdo enviado, pelo número de WhatsApp conectado e pela utilização adequada dos dados dos leads.',
      ] },
      { title: 'Uso adequado da conta', paragraphs: ['A conta não deve ser compartilhada com terceiros fora da equipe cadastrada. É proibido revender leads, transferir dados sem autorização, usar contatos para finalidade incompatível ou enviar comunicações abusivas ou ilegais.'] },
      { title: 'Atualizações e novo aceite', paragraphs: ['A Lead4Pro pode atualizar esta política. Quando houver uma nova versão, usuários novos e antigos deverão lê-la e aceitá-la antes de continuar usando a plataforma. Cada aceite fica registrado separadamente para auditoria.'] },
    ],
    support: 'Dúvidas? Fale com o suporte pelo WhatsApp oficial da plataforma.',
  },
  en: {
    title: 'Leads & Platform Usage Policy', version: 'Version',
    acceptance: 'Acceptance of this policy is required and is recorded with the account, date, time, IP address, and accepted version.',
    sections: [
      { title: 'Free trial and platform subscription', paragraphs: [
        'Lead4Pro provides a 7-day free trial so users can test and validate the platform before purchasing a subscription. The trial does not require the purchase of leads.',
        'Once a paid subscription is purchased, the monthly fee or contracted period is non-refundable, except where required by applicable law. Access remains available for the period already paid.',
        'The platform subscription provides access to the contracted software features. It does not include lead credits, lead packages, or lead delivery. Leads are separate products and must be purchased separately.',
      ] },
      { title: 'Automatic renewal and cancellation', paragraphs: [
        'The subscription is recurring and renews automatically at the end of each billing cycle, using the payment method on file, until canceled.',
        'To prevent the next renewal, the user must sign in to the platform and use “Manage or cancel subscription” before the next charge. Cancellation stops future charges and does not end access before the close of the period already paid.',
      ] },
      { title: 'Lead purchases and delivery', paragraphs: [
        'Exclusive leads are contacts generated through campaigns and delivered individually to an eligible buyer. A lead is a contact opportunity, not a guaranteed sale, response, meeting, or closing.',
        'Lead packages are independent from the CRM subscription. Delivery considers the purchased language, licensed states, available balance, and the distribution rules configured in the platform.',
      ] },
      { title: 'Lead exchange policy', paragraphs: [
        'A lead exchange may only be requested when the phone number and/or email address provided for that lead does not exist, is invalid, or is demonstrably out of service.',
        'No response, lack of interest, withdrawal, a missed meeting, or failure to close a sale does not qualify for an exchange. Every request is subject to verification by the Lead4Pro team before a credit is returned.',
      ] },
      { title: 'Cold leads', paragraphs: ['Cold-lead packages contain contacts aged 7 days or more, are sold at a reduced price, and are delivered manually. They do not enter the automatic queue and are not covered by the exchange policy.'] },
      { title: 'Calls, messages, and recordings', paragraphs: [
        'Calls made through the platform may use local numbers and may be recorded after the applicable notice. WhatsApp, SMS, email, and automated messages must comply with applicable law and the recipient’s opt-out requests.',
        'The user is responsible for sent content, the connected WhatsApp number, and the proper use of lead data.',
      ] },
      { title: 'Proper account use', paragraphs: ['Accounts must not be shared with third parties outside the registered team. Reselling leads, transferring data without authorization, using contacts for an incompatible purpose, or sending abusive or unlawful communications is prohibited.'] },
      { title: 'Updates and renewed acceptance', paragraphs: ['Lead4Pro may update this policy. When a new version is released, both new and existing users must read and accept it before continuing to use the platform. Each acceptance is recorded separately for audit purposes.'] },
    ],
    support: 'Questions? Contact support through the platform’s official WhatsApp.',
  },
  es: {
    title: 'Política de Leads y Uso de la Plataforma', version: 'Versión',
    acceptance: 'La aceptación de esta política es obligatoria y se registra con la cuenta, fecha, hora, dirección IP y versión aceptada.',
    sections: [
      { title: 'Prueba gratuita y suscripción de la plataforma', paragraphs: [
        'Lead4Pro ofrece una prueba gratuita de 7 días para que el usuario pruebe y valide la plataforma antes de contratar una suscripción. La prueba no exige la compra de leads.',
        'Una vez contratada una suscripción pagada, la mensualidad o el período contratado no es reembolsable, salvo cuando la ley aplicable exija lo contrario. El acceso permanece disponible durante el período ya pagado.',
        'La suscripción de la plataforma da acceso a las funciones contratadas del software. No incluye créditos, paquetes ni entrega de leads. Los leads son productos separados y deben comprarse por separado.',
      ] },
      { title: 'Renovación automática y cancelación', paragraphs: [
        'La suscripción es recurrente y se renueva automáticamente al final de cada ciclo de facturación, usando el método de pago registrado, hasta que sea cancelada.',
        'Para impedir la próxima renovación, el usuario debe entrar en la plataforma y usar “Gestionar o cancelar suscripción” antes del próximo cobro. La cancelación detiene cobros futuros y no termina el acceso antes de finalizar el período ya pagado.',
      ] },
      { title: 'Compra y entrega de leads', paragraphs: [
        'Los leads exclusivos son contactos generados por campañas y entregados individualmente a un comprador elegible. Un lead es una oportunidad de contacto, no una venta, respuesta, reunión o cierre garantizado.',
        'Los paquetes de leads son independientes de la suscripción del CRM. La entrega considera el idioma comprado, los estados autorizados, el saldo disponible y las reglas de distribución configuradas en la plataforma.',
      ] },
      { title: 'Política de cambio de leads', paragraphs: [
        'Solo se puede solicitar el cambio de un lead cuando el número de teléfono y/o la dirección de correo proporcionada para ese lead no existe, es inválida o está comprobadamente fuera de servicio.',
        'La falta de respuesta, falta de interés, desistimiento, ausencia en una reunión o falta de cierre no da derecho al cambio. Toda solicitud está sujeta a verificación por el equipo de Lead4Pro antes de devolver un crédito.',
      ] },
      { title: 'Leads fríos', paragraphs: ['Los paquetes de leads fríos contienen contactos con 7 días o más, se venden a un precio reducido y se entregan manualmente. No entran en la fila automática ni tienen garantía de cambio.'] },
      { title: 'Llamadas, mensajes y grabaciones', paragraphs: [
        'Las llamadas realizadas por la plataforma pueden usar números locales y grabarse después del aviso correspondiente. Los mensajes de WhatsApp, SMS, correo y las automatizaciones deben cumplir la ley aplicable y las solicitudes del destinatario para dejar de recibir contactos.',
        'El usuario es responsable del contenido enviado, del número de WhatsApp conectado y del uso adecuado de los datos de los leads.',
      ] },
      { title: 'Uso adecuado de la cuenta', paragraphs: ['La cuenta no debe compartirse con terceros fuera del equipo registrado. Está prohibido revender leads, transferir datos sin autorización, usar contactos para fines incompatibles o enviar comunicaciones abusivas o ilegales.'] },
      { title: 'Actualizaciones y nueva aceptación', paragraphs: ['Lead4Pro puede actualizar esta política. Cuando exista una nueva versión, los usuarios nuevos y antiguos deberán leerla y aceptarla antes de continuar usando la plataforma. Cada aceptación se registra por separado para auditoría.'] },
    ],
    support: '¿Tienes preguntas? Contacta al soporte por el WhatsApp oficial de la plataforma.',
  },
}

export function policyCopy(locale: Locale) {
  return COPY[locale]
}

export async function LocalizedPolicyPage() {
  const locale = await getLocale()
  const copy = COPY[locale]
  return (
    <div className="min-h-screen" style={{ background: '#f8fafc' }}>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#6366f1' }}>Lead4Pro · lead4producers.com</p><h1 className="mt-1 text-[26px] font-extrabold" style={{ color: '#1a1a2e' }}>{copy.title}</h1></div>
          <LocaleSwitcher current={locale} variant="topbar" />
        </div>
        <p className="mt-2 text-[12px]" style={{ color: '#64748b' }}>{copy.version} {CURRENT_POLICY_VERSION}</p>
        <p className="mb-8 mt-2 rounded-xl p-3 text-[12px] leading-relaxed" style={{ background: '#eef2ff', color: '#4338ca' }}>{copy.acceptance}</p>
        {copy.sections.map((section, index) => <section key={section.title} className="mb-7"><h2 className="mb-2 text-[16px] font-bold" style={{ color: '#1a1a2e' }}>{index + 1}. {section.title}</h2><div className="space-y-2 text-[13.5px] leading-relaxed" style={{ color: '#3f3c55' }}>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div></section>)}
        <p className="mt-10 border-t pt-4 text-[12px]" style={{ color: '#64748b', borderColor: '#e8ecf4' }}>{copy.support} · Lead4Pro · {copy.version} {CURRENT_POLICY_VERSION}</p>
      </div>
    </div>
  )
}
