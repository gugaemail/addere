import React from 'react'
import type { LucideIcon } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size    = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  Variant
  size?:     Size
  loading?:  boolean
  leftIcon?: LucideIcon
  rightIcon?: LucideIcon
  children:  React.ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary:   'bg-brand text-white hover:opacity-90 disabled:opacity-50',
  secondary: 'border border-brand text-brand bg-transparent hover:bg-tint disabled:opacity-50',
  ghost:     'text-brand bg-transparent hover:bg-tint disabled:opacity-50',
  danger:    'bg-danger text-white hover:opacity-90 disabled:opacity-50',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-8  px-3 text-sm  gap-1.5',
  md: 'h-10 px-4 text-sm  gap-2',
  lg: 'h-11 px-5 text-base gap-2',
}

const iconSize: Record<Size, number> = { sm: 14, md: 16, lg: 18 }

export function Button({
  variant  = 'primary',
  size     = 'md',
  loading  = false,
  leftIcon:  LeftIcon,
  rightIcon: RightIcon,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      disabled={isDisabled}
      className={[
        'inline-flex items-center justify-center rounded-md font-semibold',
        'transition-colors duration-150 cursor-pointer select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
      {...props}
    >
      {loading ? (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <>
          {LeftIcon  && <LeftIcon  size={iconSize[size]} aria-hidden />}
          {children}
          {RightIcon && <RightIcon size={iconSize[size]} aria-hidden />}
        </>
      )}
    </button>
  )
}
