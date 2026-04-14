interface StatCardProps {
  label: string
  value: string | number
  change?: string
  trend?: 'up' | 'down'
}

export function StatCard({ label, value, change, trend }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg p-5 border" style={{ borderColor: '#eaeaea' }}>
      <p className="text-[13px] font-medium" style={{ color: '#666' }}>{label}</p>
      <p className="text-[32px] font-bold tracking-tight mt-1" style={{ color: '#111' }}>{value}</p>
      {change && (
        <p className="text-[12px] mt-1 font-medium" style={{
          color: trend === 'up' ? '#0cce6b' : trend === 'down' ? '#ee0000' : '#999'
        }}>
          {trend === 'up' ? '↑ ' : trend === 'down' ? '↓ ' : ''}{change}
        </p>
      )}
    </div>
  )
}
