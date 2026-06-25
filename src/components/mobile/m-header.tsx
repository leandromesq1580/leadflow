'use client'

import Link from 'next/link'
import { getInitials } from '@/lib/utils'

// BrandMark — mesmo do desktop (tile escuro + raio âmbar).
function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" aria-label="Lead4Pro">
      <defs>
        <linearGradient id={`m-bolt-${size}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <rect width="60" height="60" rx="16" fill="#1a1730" />
      <path d="M30 12 L18 34 L28 34 L24 50 L42 26 L32 26 L36 12 Z" fill={`url(#m-bolt-${size})`} />
    </svg>
  )
}

export function MHeader({ userName }: { userName?: string }) {
  return (
    <header className="m-header">
      <Link href="/m" className="m-brand">
        <BrandMark size={28} />
        <span className="m-brand-name">Lead4Pro</span>
      </Link>
      <Link href="/m/mais" className="m-header-av" aria-label="Menu">
        {getInitials(userName || 'L4')}
      </Link>
    </header>
  )
}
