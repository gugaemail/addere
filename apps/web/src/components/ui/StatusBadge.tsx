import { Badge } from './Badge'

interface StatusBadgeProps {
  active: boolean
  /** Rótulos customizados, ex.: "Ativa"/"Inativa" para empresas */
  activeLabel?: string
  inactiveLabel?: string
}

// Badge de status ativo/inativo usado nas tabelas do painel admin.
// Unifica as cópias que existiam em dashboard/page.tsx e empresas/[id]/page.tsx.
export function StatusBadge({ active, activeLabel = 'Ativo', inactiveLabel = 'Inativo' }: StatusBadgeProps) {
  return (
    <Badge variant={active ? 'success' : 'neutral'}>
      {active ? activeLabel : inactiveLabel}
    </Badge>
  )
}
