'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function SettingsPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [calLink, setCalLink] = useState('')
  const [notifEmail, setNotifEmail] = useState(true)
  const [notifSms, setNotifSms] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('buyers')
      .select('*')
      .eq('auth_user_id', user.id)
      .single()

    if (data) {
      setName(data.name || '')
      setPhone(data.phone || '')
      setWhatsapp(data.whatsapp || '')
      setCalLink(data.cal_link || '')
      setNotifEmail(data.notification_email)
      setNotifSms(data.notification_sms)
    }
  }

  async function saveSettings() {
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('buyers')
      .update({
        name,
        phone,
        whatsapp,
        cal_link: calLink,
        notification_email: notifEmail,
        notification_sms: notifSms,
      })
      .eq('auth_user_id', user.id)

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Configuracoes</h1>
      <p className="text-sm text-gray-500 mb-6">Gerencie seu perfil e preferencias</p>

      {saved && (
        <div className="bg-green-50 text-green-700 px-5 py-3 rounded-xl mb-6 text-sm font-medium border border-green-100">
          ✅ Configuracoes salvas!
        </div>
      )}

      {/* Profile */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="font-bold text-gray-900 mb-4">Perfil</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Nome</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Telefone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">WhatsApp</label>
              <input type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Cal.com */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="font-bold text-gray-900 mb-2">Agenda (Appointments)</h2>
        <p className="text-sm text-gray-500 mb-4">Cole seu link do Cal.com para receber appointments agendados direto na sua agenda</p>
        <input
          type="url"
          value={calLink}
          onChange={(e) => setCalLink(e.target.value)}
          placeholder="https://cal.com/seu-nome"
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="font-bold text-gray-900 mb-4">Notificacoes</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Email</p>
              <p className="text-xs text-gray-400">Receber leads por email</p>
            </div>
            <button
              onClick={() => setNotifEmail(!notifEmail)}
              className={`w-11 h-6 rounded-full transition-colors relative ${notifEmail ? 'bg-green-500' : 'bg-gray-300'}`}
            >
              <span className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-all shadow ${notifEmail ? 'left-5.5' : 'left-0.5'}`}
                style={{ left: notifEmail ? '22px' : '2px' }} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">SMS</p>
              <p className="text-xs text-gray-400">Receber leads por SMS</p>
            </div>
            <button
              onClick={() => setNotifSms(!notifSms)}
              className={`w-11 h-6 rounded-full transition-colors relative ${notifSms ? 'bg-green-500' : 'bg-gray-300'}`}
            >
              <span className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-all shadow`}
                style={{ left: notifSms ? '22px' : '2px' }} />
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={saveSettings}
        disabled={saving}
        className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
      >
        {saving ? 'Salvando...' : 'Salvar Configuracoes'}
      </button>
    </div>
  )
}
