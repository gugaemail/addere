import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'

interface KpiCardProps {
  label: string
  value: string
  icon?: LucideIcon
  /** Linha de apoio: denominador, comparação, o que o número quer dizer. */
  hint?: string
  tone?: Tone
}

const toneClasses: Record<Tone, string> = {
  neutral: 'text-[var(--text-primary)]',
  brand: 'text-brand',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

// Card de KPI das telas da Inteligência (W1/E11). Diferente do MetricCard do
// piloto, que carrega meta e semáforo: aqui o número não tem meta contra a qual
// ser julgado — só o valor e o contexto que o torna legível.
export function KpiCard({ label, value, icon: Icon, hint, tone = 'neutral' }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-5 py-4 shadow-card">
      <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {Icon && <Icon size={14} strokeWidth={1.5} aria-hidden />}
        {label}
      </span>
      <p className={cn('mt-1 text-3xl font-bold tracking-tighter', toneClasses[tone])}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  )
}
