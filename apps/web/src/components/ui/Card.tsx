import React from 'react'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'selected'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:  Variant
  children:  React.ReactNode
}

// Card padrão do painel — superfície/borda em tokens de tema (light/dark).
const variantClasses: Record<Variant, string> = {
  default:  'border border-[var(--border)] bg-[var(--bg-surface)] shadow-card',
  selected: 'border-2 border-brand bg-tint shadow-card',
}

export function Card({
  variant   = 'default',
  className = '',
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn('rounded-xl p-4', variantClasses[variant], className)}
      {...props}
    >
      {children}
    </div>
  )
}
