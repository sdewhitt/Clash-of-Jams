import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

interface BadgeProps {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'perfect' | 'good' | 'miss'
  className?: string
}

const tones = {
  neutral: 'bg-surface-2 text-muted border-line',
  accent: 'bg-accent/15 text-accent-soft border-accent/30',
  perfect: 'bg-perfect/15 text-perfect border-perfect/30',
  good: 'bg-good/15 text-good border-good/30',
  miss: 'bg-miss/15 text-miss border-miss/30',
}

export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
