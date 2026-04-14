'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, Record<string, unknown>>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { loadSettings() }, [])

  async function loadSettings() {
    const supabase = createClient()
    const { data } = await supabase.from('settings').select('*')
    const map: Record<string, Record<string, unknown>> = {}
    data?.forEach(s => { map[s.key] = s.value as Record<string, unknown> })
    setSettings(map)
  }

  async function saveSetting(key: string, value: Record<string, unknown>) {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('settings').upsert({ key, value, updated_at: new Date().toISOString() })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const pricing = (settings.pricing || {}) as Record<string, number>
  const distribution = (settings.distribution || {}) as Record<string, unknown>
  const metaWebhook = (settings.meta_webhook || {}) as Record<string, unknown>

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Configuracoes</h1>
      <p className="text-sm text-gray-500 mb-6">Precos, distribuicao e integracoes</p>

      {saved && (
        <div className="bg-green-50 text-green-700 px-5 py-3 rounded-xl mb-6 text-sm font-medium border border-green-100">
          ✅ Configuracoes salvas!
        </div>
      )}

      {/* Pricing */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="font-bold text-gray-900 mb-4">💰 Precos</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Lead Exclusivo ($/lead)</label>
            <input type="number" value={pricing.lead_exclusive || 22}
              onChange={(e) => setSettings({ ...settings, pricing: { ...pricing, lead_exclusive: Number(e.target.value) } })}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Appointment ($/appt)</label>
            <input type="number" value={pricing.appointment || 38}
              onChange={(e) => setSettings({ ...settings, pricing: { ...pricing, appointment: Number(e.target.value) } })}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <button onClick={() => saveSetting('pricing', settings.pricing || {})} disabled={saving}
          className="mt-4 bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
          Salvar Precos
        </button>
      </div>

      {/* Distribution */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="font-bold text-gray-900 mb-4">⚡ Distribuicao</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Auto-distribuir leads</p>
              <p className="text-xs text-gray-400">Distribuir automaticamente quando lead chega do Meta</p>
            </div>
            <button
              onClick={() => {
                const updated = { ...distribution, auto_distribute: !distribution.auto_distribute }
                setSettings({ ...settings, distribution: updated })
                saveSetting('distribution', updated)
              }}
              className={`w-11 h-6 rounded-full transition-colors relative ${distribution.auto_distribute ? 'bg-green-500' : 'bg-gray-300'}`}
            >
              <span className="absolute w-5 h-5 bg-white rounded-full top-0.5 transition-all shadow"
                style={{ left: distribution.auto_distribute ? '22px' : '2px' }} />
            </button>
          </div>
        </div>
      </div>

      {/* Meta Webhook */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="font-bold text-gray-900 mb-4">📱 Meta Webhook</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Webhook URL</label>
            <div className="flex gap-2">
              <input type="text" readOnly value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhook/meta`}
                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-600" />
              <button
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/webhook/meta`)}
                className="px-4 py-3 bg-gray-100 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-200"
              >
                Copiar
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Status</label>
            <span className={`inline-flex items-center gap-2 text-sm font-semibold ${metaWebhook.connected ? 'text-green-600' : 'text-yellow-600'}`}>
              <span className={`w-2 h-2 rounded-full ${metaWebhook.connected ? 'bg-green-500' : 'bg-yellow-500'}`} />
              {metaWebhook.connected ? 'Conectado' : 'Aguardando configuracao'}
            </span>
          </div>
        </div>
      </div>

      {/* Stripe */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-bold text-gray-900 mb-4">💳 Stripe</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Status do Stripe</p>
            <p className="text-xs text-gray-400">Pagamentos via cartao de credito</p>
          </div>
          <span className="text-sm font-semibold text-green-600 flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full" />
            Conectado
          </span>
        </div>
      </div>
    </div>
  )
}
