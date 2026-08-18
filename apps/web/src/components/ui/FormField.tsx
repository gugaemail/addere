'use client'

import { forwardRef, useId } from 'react'
import { cn } from '@/lib/utils'

// Classe base dos controles de formulário do painel admin (tokens de tema).
// Exportada para casos especiais (textarea, controles custom) manterem o visual.
export const formControlClass =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow disabled:opacity-40 disabled:cursor-not-allowed'

const labelClass = 'block text-sm font-medium text-[var(--text-secondary)] mb-1.5'

interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: React.ReactNode
  error?: string
  hint?: string
  /** Fonte mono — para URLs e códigos (config Protheus) */
  mono?: boolean
}

// Campo de formulário padrão (label + input + erro). Substitui as antigas
// reimplementações Field/InputField/NumField espalhadas pelos modais.
// forwardRef para funcionar com {...register(...)} do react-hook-form.
export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { label, error, hint, mono, className, id: providedId, ...props },
  ref,
) {
  const generatedId = useId()
  const id = providedId ?? generatedId

  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <input
        ref={ref}
        id={id}
        className={cn(
          formControlClass,
          mono && 'font-mono py-2',
          error && 'border-danger focus:ring-danger/30',
          className,
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      {!error && hint && <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  )
})

interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: React.ReactNode
  error?: string
  children: React.ReactNode
}

// Variante select com o mesmo visual do FormField.
export const FormSelect = forwardRef<HTMLSelectElement, FormSelectProps>(function FormSelect(
  { label, error, className, children, id: providedId, ...props },
  ref,
) {
  const generatedId = useId()
  const id = providedId ?? generatedId

  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <select
        ref={ref}
        id={id}
        className={cn(formControlClass, error && 'border-danger focus:ring-danger/30', className)}
        {...props}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
})
