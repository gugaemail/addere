import React from 'react'

type Variant = 'default' | 'selected'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:  Variant
  children:  React.ReactNode
}

const variantClasses: Record<Variant, string> = {
  default:  'border border-border2 bg-white shadow-sm',
  selected: 'border-2 border-brand bg-tint shadow-sm',
}

export function Card({
  variant   = 'default',
  className = '',
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={[
        'rounded-xl p-4',
        variantClasses[variant],
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}
