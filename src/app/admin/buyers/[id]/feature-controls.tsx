'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BuyerFeatureId, BuyerFeatureState, FeatureMode } from '@/lib/buyer-features'

const MODES: { mode: FeatureMode; label: string }[] = [
  { mode: 'default', label: 'Padrão' },
  { mode: 'enabled', label: 'Liberado' },
  { mode: 'disabled', label: 'Bloqueado' },
]
export function BuyerFeatureControls({ buyerId, initialFeatures }: { buyerId: string; initialFeatures: BuyerFeatureState[] | null }) {
  const router = useRouter()
  const [features, setFeatures] = useState(initialFeatures)
  const [saving, setSaving] = useState<BuyerFeatureId | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function change(feature: BuyerFeatureId, mode: FeatureMode) {
    if (saving) return
    setSaving(feature)
    setError(null)
    try {
      const r = await fetch(`/api/admin/buyers/${buyerId}/features`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature, mode }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Não foi possível salvar a permissão.')
      if (!Array.isArray(data.features) || !data.features.length || data.features.find((f: BuyerFeatureState) => f.id === feature)?.mode !== mode) {
        throw new Error('Não foi possível confirmar a permissão. Atualize e confira.')
      }
      setFeatures(data.features)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha de conexão. Atualize e confira a permissão.')
    } finally { setSaving(null) }
  }

  return <div className="border-t border-border pt-4 space-y-3">
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recursos por usuário</p>
    {!features && <p className="text-xs text-destructive" role="alert">Não foi possível consultar os recursos. Atualize a página.</p>}
    {features?.map(feature => <div key={feature.id} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{feature.label}</span>
        <span className={`text-xs ${feature.enabled ? 'text-emerald-600' : 'text-muted-foreground'}`}>
          {saving === feature.id ? 'Salvando…' : feature.enabled ? 'Ativo' : 'Inativo'}
        </span>
      </div>
      <div role="group" aria-label={`Permissão: ${feature.label}`} className="grid grid-cols-3 gap-1 rounded-lg bg-muted/50 p-1">
        {MODES.map(({ mode, label }) => <button
          key={mode} type="button" aria-pressed={feature.mode === mode} disabled={!!saving}
          title={mode === 'disabled' ? 'Bloqueia novas chamadas com IA e sugestões; não encerra a transcrição de uma chamada já iniciada.' : undefined}
          onClick={() => change(feature.id, mode)}
          className={`rounded-md py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${feature.mode === mode ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >{label}</button>)}
      </div>
    </div>)}
    <p className="text-[11px] leading-relaxed text-muted-foreground">Padrão segue assinatura ou cortesia. A permissão não altera cobrança nem ligação normal.</p>
    {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
  </div>
}
