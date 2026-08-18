import React, { forwardRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Variantes de botão do painel admin (tokens de marca — nunca hex/cores genéricas):
// - primary/danger: sólidos
// - secondary: contorno na cor da marca
// - outline: contorno neutro (tema-aware) — ações secundárias/filtros
// - ghost: sem borda, texto na cor da marca
// - danger-outline / success-outline: contorno semântico (desativar/ativar)
type Variant =
  'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'danger-outline' | 'success-outline'
// 'icon' = botão quadrado só com ícone (fechar modal, editar linha)
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  leftIcon?: LucideIcon
  rightIcon?: LucideIcon
  children?: React.ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:opacity-90 disabled:opacity-50',
  secondary: 'border border-brand text-brand bg-transparent hover:bg-brand/10 disabled:opacity-50',
  outline:
    'border border-[var(--border)] text-[var(--text-secondary)] bg-transparent hover:bg-[var(--bg-subtle)] disabled:opacity-40',
  ghost: 'text-brand bg-transparent hover:bg-brand/10 disabled:opacity-50',
  danger: 'bg-danger text-white hover:opacity-90 disabled:opacity-50',
  'danger-outline':
    'border border-danger/30 text-danger bg-transparent hover:bg-danger/10 disabled:opacity-50',
  'success-outline':
    'border border-success/30 text-success bg-transparent hover:bg-success/10 disabled:opacity-50',
}

const sizeClasses: Record<Size, string> = {
  xs: 'h-7  px-2.5 text-xs gap-1.5',
  sm: 'h-8  px-3 text-sm  gap-1.5',
  md: 'h-10 px-4 text-sm  gap-2',
  lg: 'h-11 px-5 text-base gap-2',
  icon: 'h-8  w-8 p-0 text-sm',
}

const iconSize: Record<Size, number> = { xs: 13, sm: 14, md: 16, lg: 18, icon: 16 }

// forwardRef: permite ancorar menus/popovers no botão (ex.: ActionMenu)
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon: LeftIcon,
    rightIcon: RightIcon,
    disabled,
    className = '',
    children,
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-semibold',
        'transition-colors duration-150 cursor-pointer select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {loading ? (
        <>
          <span
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden
          />
          {size !== 'icon' && children}
        </>
      ) : (
        <>
          {LeftIcon && <LeftIcon size={iconSize[size]} strokeWidth={1.5} aria-hidden />}
          {children}
          {RightIcon && <RightIcon size={iconSize[size]} strokeWidth={1.5} aria-hidden />}
        </>
      )}
    </button>
  )
})
