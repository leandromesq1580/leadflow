interface StatCardProps {
  label: string
  value: string | number
  change?: string
  trend?: 'up' | 'down'
  icon?: string
  gradient?: string
}

export function StatCard({ label, value, change, trend, icon, gradient }: StatCardProps) {
  return (
    <div className={`rounded-2xl p-5 shadow-sm border transition-all hover:shadow-md hover:-translate-y-0.5 ${gradient || 'bg-white border-slate-200'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-sm font-semibold ${gradient ? 'text-white/70' : 'text-slate-500'}`}>{label}</p>
          <p className={`text-3xl font-extrabold mt-1 tracking-tight ${gradient ? 'text-white' : 'text-slate-900'}`}>{value}</p>
          {change && (
            <p className={`text-xs mt-2 font-semibold ${
              gradient
                ? 'text-white/60'
                : trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-slate-400'
            }`}>
              {trend === 'up' ? '↑ ' : trend === 'down' ? '↓ ' : ''}{change}
            </p>
          )}
        </div>
        {icon && (
          <span className={`text-2xl ${gradient ? 'opacity-50' : ''}`}>{icon}</span>
        )}
      </div>
    </div>
  )
}
