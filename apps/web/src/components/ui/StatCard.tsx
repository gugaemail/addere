import { cn } from '@/lib/utils'

type Accent = 'brand' | 'success' | 'neutral'

interface StatCardProps {
  label: string
  value: string | number
  /** Borda esquerda colorida (usada nos cards do dashboard) */
  accent?: Accent
  /** Valor textual (fonte menor), ex.: "Ativa"/"Inativa" */
  text?: boolean
}

const accentClasses: Record<Accent, string> = {
  brand: 'border-l-2 border-l-brand',
  success: 'border-l-2 border-l-success',
  neutral: 'border-l-2 border-l-[var(--border)]',
}

// Card de estatística do painel admin. Unifica as versões que existiam em
// dashboard/page.tsx (com accent) e empresas/[id]/page.tsx (com valor textual).
export function StatCard({ label, value, accent, text }: StatCardProps) {
  return (
    <div
      className={cn(
        'bg-[var(--bg-surface)] rounded-xl shadow-card border border-[var(--border)] px-5 py-4',
        accent && accentClasses[accent]
      )}
    >
      <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 font-bold text-[var(--text-primary)]',
          text ? 'text-lg' : 'text-3xl tracking-tighter'
        )}
      >
        {value}
      </p>
    </div>
  )
}
