'use client'

import { forwardRef, useId } from 'react'
import { cn } from '@/lib/utils'
import { formControlClass } from './FormField'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

// Input padrão (label opcional + erro/hint). Compartilha o visual de FormField
// (tokens de tema, funciona em light/dark). forwardRef para react-hook-form.
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className = '', id: providedId, ...props },
  ref
) {
  const generatedId = useId()
  const id = providedId ?? generatedId

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-[var(--text-secondary)]">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={cn(formControlClass, error && 'border-danger focus:ring-danger/30', className)}
        {...props}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      {!error && hint && <p className="text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  )
})
