interface StatCardProps {
  label: string
  value: string | number
  change?: string
  trend?: 'up' | 'down'
  icon?: string
  accent?: boolean
  danger?: boolean
  /** série pra sparkline (ex.: leads/dia dos últimos 14 dias) */
  spark?: number[]
  /** cor do card no conceito: linha de brilho no topo + sparkline (violet padrão) */
  cor?: 'violet' | 'red' | 'green' | 'amber'
}

const CORES = {
  violet: { linha: 'linear-gradient(90deg, transparent, #8b5cf6, transparent)', spark: '#8b5cf6', chip: 'var(--accent-light)' },
  red:    { linha: 'linear-gradient(90deg, transparent, #f43f5e, transparent)', spark: '#f43f5e', chip: 'var(--err-soft)' },
  green:  { linha: 'linear-gradient(90deg, transparent, #10b981, transparent)', spark: '#10b981', chip: 'var(--ok-soft)' },
  amber:  { linha: 'linear-gradient(90deg, transparent, #f59e0b, transparent)', spark: '#f59e0b', chip: 'var(--warn-soft)' },
}

/** Sparkline minúscula em SVG puro — sem biblioteca, acompanha o tema. */
function Spark({ dados, claro, corLinha }: { dados: number[]; claro?: boolean; corLinha?: string }) {
  if (dados.length < 2) return null
  const W = 96, H = 30
  const max = Math.max(...dados, 1)
  const pts = dados.map((v, i) => `${(i / (dados.length - 1)) * W},${H - 3 - (v / max) * (H - 8)}`)
  const cor = claro ? 'rgba(255,255,255,0.85)' : (corLinha || '#8b5cf6')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r="2.6" fill={cor} />
    </svg>
  )
}

export function StatCard({ label, value, change, trend, icon, accent, danger, spark, cor }: StatCardProps) {
  const c = CORES[cor || 'violet']
  return (
    <div
      className="rounded-2xl p-5 relative overflow-hidden"
      style={{
        background: accent ? 'linear-gradient(135deg, var(--accent), #8b5cf6)' : danger ? 'var(--err-soft)' : 'var(--bg-card)',
        border: accent ? 'none' : danger ? '1px solid var(--err-line)' : '1px solid var(--border)',
        boxShadow: accent ? '0 8px 30px rgba(124,58,237,0.25)' : '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      {/* linha de brilho no topo — assinatura visual do conceito */}
      {!accent && !danger && <div className="absolute top-0 left-0 right-0" style={{ height: 2.5, background: c.linha }} />}
      {accent && <div className="absolute top-0 right-0 w-24 h-24 rounded-full" style={{ background: 'rgba(255,255,255,0.1)', transform: 'translate(30%, -30%)' }} />}
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: accent ? 'rgba(255,255,255,0.7)' : 'var(--fg-muted)' }}>
            {label}
          </p>
          {icon && (
            <span className="w-8 h-8 rounded-lg flex items-center justify-center text-[15px]"
              style={{ background: accent ? 'rgba(255,255,255,0.15)' : c.chip }}>
              {icon}
            </span>
          )}
        </div>
        <div className="flex items-end justify-between gap-2">
          <p className="text-[34px] font-extrabold leading-none" style={{ color: accent ? '#fff' : danger ? '#ef4444' : 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
            {value}
          </p>
          {spark && <Spark dados={spark} claro={accent} corLinha={c.spark} />}
        </div>
        {change && (
          <p className="inline-flex items-center gap-1 text-[11.5px] font-bold mt-2.5 px-2 py-0.5 rounded-full" style={{
            color: accent ? '#fff' : trend === 'up' ? '#059669' : trend === 'down' ? '#ef4444' : 'var(--fg-muted)',
            background: accent ? 'rgba(255,255,255,0.15)' : trend === 'up' ? 'var(--ok-soft)' : trend === 'down' ? 'var(--err-soft)' : 'var(--bg-soft)',
          }}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : ''}{change}
          </p>
        )}
      </div>
    </div>
  )
}
