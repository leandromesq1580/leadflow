interface StatCardProps {
  label: string
  value: string | number
  change?: string
  trend?: 'up' | 'down'
  icon?: string
  accent?: boolean
  danger?: boolean
}

export function StatCard({ label, value, change, trend, icon, accent, danger }: StatCardProps) {
  return (
    <div
      className="rounded-2xl p-5 relative overflow-hidden"
      style={{
        background: accent ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : danger ? 'var(--err-soft)' : 'var(--bg-card)',
        border: accent ? 'none' : danger ? '1px solid #fecaca' : '1px solid #e8ecf4',
        boxShadow: accent ? '0 8px 30px rgba(99,102,241,0.25)' : '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      {accent && <div className="absolute top-0 right-0 w-24 h-24 rounded-full" style={{ background: 'rgba(255,255,255,0.1)', transform: 'translate(30%, -30%)' }} />}
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: accent ? 'rgba(255,255,255,0.7)' : 'var(--fg-muted)' }}>
            {label}
          </p>
          {icon && <span className="text-[20px]">{icon}</span>}
        </div>
        <p className="text-[32px] font-extrabold leading-none" style={{ color: accent ? '#fff' : danger ? '#ef4444' : 'var(--fg)' }}>
          {value}
        </p>
        {change && (
          <p className="text-[12px] font-semibold mt-2" style={{
            color: accent ? 'rgba(255,255,255,0.8)' : trend === 'up' ? '#10b981' : trend === 'down' ? '#ef4444' : 'var(--fg-muted)'
          }}>
            {trend === 'up' ? '↑ ' : trend === 'down' ? '↓ ' : ''}{change}
          </p>
        )}
      </div>
    </div>
  )
}
