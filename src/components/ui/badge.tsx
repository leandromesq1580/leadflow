import { statusLabel } from '@/lib/utils'

interface BadgeProps {
  status: string
  children?: React.ReactNode
}

const styles: Record<string, { bg: string; fg: string; dot: string }> = {
  new: { bg: '#eff6ff', fg: '#3b82f6', dot: '#3b82f6' },
  assigned: { bg: '#eff6ff', fg: '#3b82f6', dot: '#3b82f6' },
  qualified: { bg: '#ecfdf5', fg: '#10b981', dot: '#10b981' },
  appointment_set: { bg: '#fffbeb', fg: '#f59e0b', dot: '#f59e0b' },
  contacted: { bg: '#fffbeb', fg: '#f59e0b', dot: '#f59e0b' },
  converted: { bg: '#ecfdf5', fg: '#10b981', dot: '#10b981' },
  lost: { bg: '#f8fafc', fg: '#94a3b8', dot: '#94a3b8' },
  scheduled: { bg: '#eef2ff', fg: '#6366f1', dot: '#6366f1' },
  confirmed: { bg: '#ecfdf5', fg: '#10b981', dot: '#10b981' },
  completed: { bg: '#ecfdf5', fg: '#10b981', dot: '#10b981' },
  no_show: { bg: '#fef2f2', fg: '#ef4444', dot: '#ef4444' },
  cancelled: { bg: '#f8fafc', fg: '#94a3b8', dot: '#94a3b8' },
  hot: { bg: '#fef2f2', fg: '#ef4444', dot: '#ef4444' },
  cold: { bg: '#eff6ff', fg: '#3b82f6', dot: '#3b82f6' },
  active: { bg: '#ecfdf5', fg: '#10b981', dot: '#10b981' },
  pending: { bg: '#fffbeb', fg: '#f59e0b', dot: '#f59e0b' },
}

export function Badge({ status, children }: BadgeProps) {
  const s = styles[status] || styles.lost
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold"
      style={{ background: s.bg, color: s.fg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {children || statusLabel(status)}
    </span>
  )
}
