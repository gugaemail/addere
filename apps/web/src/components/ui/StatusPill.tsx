import type { CustomerStatus } from '@addere/types'

// Pill de status do cliente (motor da Inteligência). Cores fixas em toda tela
// (tokens status.* do tailwind.config — doc de arquitetura §W*).
const STATUS_STYLES: Record<CustomerStatus, { label: string; className: string }> = {
  ON_CYCLE: { label: 'No ciclo', className: 'bg-status-onCycle/10 text-status-onCycle' },
  LATE: { label: 'Atrasado', className: 'bg-status-late/10 text-status-late' },
  AT_RISK: { label: 'Em risco', className: 'bg-status-atRisk/10 text-status-atRisk' },
  BLOCKED: { label: 'Bloqueado', className: 'bg-status-blocked/10 text-status-blocked' },
  NEW: { label: 'Novo', className: 'bg-status-new/10 text-status-new' },
  INACTIVE: { label: 'Inativo', className: 'bg-muted/10 text-muted' },
}

interface StatusPillProps {
  status: CustomerStatus
  className?: string
}

export function StatusPill({ status, className = '' }: StatusPillProps) {
  const style = STATUS_STYLES[status]
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-0.5',
        'text-xs font-semibold leading-none',
        style.className,
        className,
      ].join(' ')}
    >
      {style.label}
    </span>
  )
}
