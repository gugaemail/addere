'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
  className?: string
}

// Toggle acessível (role=switch) — ligar/desligar Inteligência, flags etc.
export function Switch({ checked, onChange, label, disabled = false, className }: SwitchProps) {
  const id = useId()
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={label ? id : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative w-9 h-5 rounded-full transition-colors shrink-0',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
          checked ? 'bg-brand' : 'bg-[var(--border)]',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-4'
          )}
        />
      </button>
      {label && (
        <span id={id} className="text-sm text-[var(--text-secondary)]">
          {label}
        </span>
      )}
    </div>
  )
}
