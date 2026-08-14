'use client'

import { statusLabel } from '@/lib/utils'
import { useT } from '@/lib/i18n-client'

interface BadgeProps {
  status: string
  children?: React.ReactNode
}

const styles: Record<string, { bg: string; fg: string; dot: string }> = {
  new: { bg: '#eff6ff', fg: '#3b82f6', dot: '#3b82f6' },
  assigned: { bg: '#eff6ff', fg: '#3b82f6', dot: '#3b82f6' },
  qualified: { bg: '#ecfdf5', fg: '#10b981', dot: '#10b981' },
  appointment_set: { bg: 'var(--warn-soft)', fg: '#f59e0b', dot: '#f59e0b' },
  contacted: { bg: 'var(--warn-soft)', fg: '#f59e0b', dot: '#f59e0b' },
  converted: { bg: '#ecfdf5', fg: '#10b981', dot: '#10b981' },
  lost: { bg: 'var(--bg-soft)', fg: '#94a3b8', dot: '#94a3b8' },
  scheduled: { bg: 'var(--accent-light)', fg: 'var(--accent)', dot: 'var(--accent)' },
  confirmed: { bg: '#ecfdf5', fg: '#10b981', dot: '#10b981' },
  completed: { bg: '#ecfdf5', fg: '#10b981', dot: '#10b981' },
  no_show: { bg: 'var(--err-soft)', fg: '#ef4444', dot: '#ef4444' },
  cancelled: { bg: 'var(--bg-soft)', fg: '#94a3b8', dot: '#94a3b8' },
  hot: { bg: 'var(--err-soft)', fg: '#ef4444', dot: '#ef4444' },
  cold: { bg: '#eff6ff', fg: '#3b82f6', dot: '#3b82f6' },
  active: { bg: '#ecfdf5', fg: '#10b981', dot: '#10b981' },
  pending: { bg: 'var(--warn-soft)', fg: '#f59e0b', dot: '#f59e0b' },
}

export function Badge({ status, children }: BadgeProps) {
  const t = useT()
  const s = styles[status] || styles.lost
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold"
      style={{ background: s.bg, color: s.fg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {children || statusLabel(status, t._locale)}
    </span>
  )
}
