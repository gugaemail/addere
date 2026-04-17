import React from 'react'

type Variant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

interface BadgeProps {
  variant?:  Variant
  children:  React.ReactNode
  className?: string
}

const variantClasses: Record<Variant, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger:  'bg-danger/10  text-danger',
  info:    'bg-brand/10   text-brand',
  neutral: 'bg-muted/10   text-muted',
}

export function Badge({
  variant   = 'neutral',
  className = '',
  children,
}: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-0.5',
        'text-xs font-semibold leading-none',
        variantClasses[variant],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}
