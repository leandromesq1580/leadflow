interface StatCardProps {
  label: string
  value: string | number
  change?: string
  trend?: 'up' | 'down'
}

export function StatCard({ label, value, change, trend }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="text-2xl font-extrabold text-gray-900 mt-1">{value}</p>
      {change && (
        <p className={`text-xs mt-1 font-medium ${trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-400'}`}>
          {trend === 'up' ? '↑ ' : trend === 'down' ? '↓ ' : ''}{change}
        </p>
      )}
    </div>
  )
}
