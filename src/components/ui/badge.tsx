import { cn, statusLabel, statusColor } from '@/lib/utils'

interface BadgeProps {
  status: string
  className?: string
  children?: React.ReactNode
}

export function Badge({ status, className, children }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold',
      statusColor(status),
      className
    )}>
      {children || statusLabel(status)}
    </span>
  )
}
