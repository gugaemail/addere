'use client'

import { forwardRef, useId } from 'react'
import { cn } from '@/lib/utils'
import { formControlClass } from './FormField'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
  /** Fonte mono (editor SQL da tela de Consultas — E10) */
  mono?: boolean
}

// Textarea no mesmo padrão visual do Input (label opcional + erro/hint).
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, mono = false, className = '', id: providedId, ...props },
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
      <textarea
        ref={ref}
        id={id}
        className={cn(
          formControlClass,
          'min-h-24 resize-y',
          mono && 'font-mono text-[13px] leading-relaxed',
          error && 'border-danger focus:ring-danger/30',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      {!error && hint && <p className="text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  )
})
