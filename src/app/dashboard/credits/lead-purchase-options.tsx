'use client'

import { createContext, useContext, useId, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { LEAD_LANGUAGES, leadLanguageLabel, type LeadLanguage } from '@/lib/lead-language'
import { useT } from '@/lib/i18n-client'

type PurchaseLanguageContext = {
  language: LeadLanguage | null
  setLanguage: Dispatch<SetStateAction<LeadLanguage | null>>
}

const PurchaseLanguage = createContext<PurchaseLanguageContext | null>(null)
export const usePurchaseLanguage = () => useContext(PurchaseLanguage)?.language || null

export function LeadPurchaseOptions({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<LeadLanguage | null>(null)

  return (
    <PurchaseLanguage.Provider value={{ language, setLanguage }}>
      {children}
    </PurchaseLanguage.Provider>
  )
}

export function LeadPurchaseLanguageSelector() {
  const purchaseLanguage = useContext(PurchaseLanguage)
  const name = useId()
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  if (!purchaseLanguage) return null
  const { language, setLanguage } = purchaseLanguage

  return (
      <fieldset id="lead-packages" className="rounded-2xl p-5 mt-4 mb-4 scroll-mt-6" style={{ background: 'var(--bg-card)', border: '2px solid var(--accent)' }}>
        <legend className="px-2 text-[16px] font-bold" style={{ color: 'var(--fg)' }}>
          {L('1. Qual idioma de leads você quer comprar?', '1. Which lead language do you want to buy?', '1. ¿En qué idioma quieres comprar leads?')}
        </legend>
        <p className="text-[13px] mb-4" style={{ color: 'var(--fg-secondary)' }}>
          {L('Escolha uma opção antes de comprar. Cada pacote será entregue somente no idioma selecionado.', 'Choose an option before buying. Each package is delivered only in the selected language.', 'Elige una opción antes de comprar. Cada paquete se entrega solo en el idioma seleccionado.')}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {LEAD_LANGUAGES.map(option => (
            <label key={option} className="flex items-center gap-3 cursor-pointer rounded-xl p-4" style={{ border: `2px solid ${language === option ? 'var(--accent)' : 'var(--border)'}`, background: language === option ? 'var(--bg-soft)' : 'var(--bg-card)' }}>
              <input type="radio" name={name} value={option} checked={language === option} onChange={() => setLanguage(option)} className="h-5 w-5 shrink-0 accent-violet-600" />
              <span>
                <span className="block text-[14px] font-bold" style={{ color: 'var(--fg)' }}>{leadLanguageLabel(option, t._locale)}</span>
                <span className="block text-[12px] mt-1" style={{ color: 'var(--fg-secondary)' }}>
                  {option === 'pt' ? L('Pessoas que falam português.', 'Portuguese-speaking prospects.', 'Personas que hablan portugués.') : L('Pessoas que falam espanhol.', 'Spanish-speaking prospects.', 'Personas que hablan español.')}
                </span>
              </span>
            </label>
          ))}
        </div>
        <p role="status" className="text-[13px] font-semibold mt-4" style={{ color: language ? 'var(--accent)' : 'var(--fg-secondary)' }}>
          {language ? L(`Selecionado: ${leadLanguageLabel(language)}. Agora escolha seu pacote.`, `Selected: ${leadLanguageLabel(language, 'en')}. Now choose your package.`, `Seleccionado: ${leadLanguageLabel(language, 'es')}. Ahora elige tu paquete.`) : L('Nenhum idioma selecionado.', 'No language selected.', 'Ningún idioma seleccionado.')}
        </p>
      </fieldset>
  )
}
