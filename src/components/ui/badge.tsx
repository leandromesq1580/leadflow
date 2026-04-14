import { statusLabel } from '@/lib/utils'

interface BadgeProps {
  status: string
  children?: React.ReactNode
}

const colors: Record<string, { bg: string; fg: string }> = {
  new: { bg: '#e8f4ff', fg: '#0070f3' },
  assigned: { bg: '#e8f4ff', fg: '#0070f3' },
  qualified: { bg: '#e6ffed', fg: '#0cce6b' },
  appointment_set: { bg: '#fff4e5', fg: '#f5a623' },
  contacted: { bg: '#fff4e5', fg: '#f5a623' },
  converted: { bg: '#e6ffed', fg: '#0cce6b' },
  lost: { bg: '#f5f5f5', fg: '#999' },
  scheduled: { bg: '#e8f4ff', fg: '#0070f3' },
  confirmed: { bg: '#e6ffed', fg: '#0cce6b' },
  completed: { bg: '#e6ffed', fg: '#0cce6b' },
  no_show: { bg: '#fee', fg: '#c00' },
  cancelled: { bg: '#f5f5f5', fg: '#999' },
  hot: { bg: '#fee', fg: '#c00' },
  cold: { bg: '#e8f4ff', fg: '#0070f3' },
  active: { bg: '#e6ffed', fg: '#0cce6b' },
  pending: { bg: '#fff4e5', fg: '#f5a623' },
}

export function Badge({ status, children }: BadgeProps) {
  const c = colors[status] || { bg: '#f5f5f5', fg: '#999' }
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold"
      style={{ background: c.bg, color: c.fg }}
    >
      {children || statusLabel(status)}
    </span>
  )
}
