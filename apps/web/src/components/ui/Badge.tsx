import { cn } from '@/lib/utils'
import type { OrderStatus } from '@addere/types'

interface BadgeProps {
  status: OrderStatus | 'ACTIVE' | 'INACTIVE'
  className?: string
}

const styles: Record<string, string> = {
  PENDING: 'bg-yellow-500/20 text-yellow-400',
  SYNCED: 'bg-green-500/20 text-green-400',
  CANCELLED: 'bg-red-500/20 text-red-400',
  ACTIVE: 'bg-green-500/20 text-green-400',
  INACTIVE: 'bg-gray-500/20 text-gray-400',
}

const labels: Record<string, string> = {
  PENDING: 'Pendente',
  SYNCED: 'Sincronizado',
  CANCELLED: 'Cancelado',
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
}

export function Badge({ status, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        styles[status] ?? 'bg-gray-500/20 text-gray-400',
        className
      )}
    >
      {labels[status] ?? status}
    </span>
  )
}
