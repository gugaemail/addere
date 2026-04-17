import React, { useId } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?:    string
  error?:    string
  hint?:     string
}

export function Input({
  label,
  error,
  hint,
  className = '',
  id: providedId,
  ...props
}: InputProps) {
  const generatedId = useId()
  const id = providedId ?? generatedId

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-navy">
          {label}
        </label>
      )}
      <input
        id={id}
        className={[
          'w-full rounded-md border bg-white px-3 py-2',
          'font-body text-sm text-navy placeholder:text-muted',
          'transition-colors duration-150',
          'focus:outline-none focus:ring-2 focus:ring-tint focus:border-brand',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error
            ? 'border-danger focus:ring-danger/20 focus:border-danger'
            : 'border-border2',
          className,
        ].join(' ')}
        {...props}
      />
      {error && (
        <p className="text-xs text-danger">{error}</p>
      )}
      {!error && hint && (
        <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  )
}
