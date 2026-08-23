import { Badge } from './Badge'
import { freshnessInfo, type FreshnessLevel } from '@/lib/freshness'

const VARIANT_BY_LEVEL: Record<FreshnessLevel, 'success' | 'warning' | 'danger' | 'neutral'> = {
  fresh: 'success',
  stale: 'warning',
  old: 'danger',
  never: 'neutral',
}

interface FreshnessBadgeProps {
  /** ISO da última atualização (null = nunca rodou) */
  updatedAt: string | null | undefined
  className?: string
}

// Badge de frescor de dados (Saúde/W4): <24h verde · 24–48h âmbar · >48h vermelho.
export function FreshnessBadge({ updatedAt, className }: FreshnessBadgeProps) {
  const info = freshnessInfo(updatedAt)
  return (
    <Badge variant={VARIANT_BY_LEVEL[info.level]} className={className}>
      {info.label}
    </Badge>
  )
}
