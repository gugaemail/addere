// Cálculo puro de frescor de dados (E9) — usado pelo FreshnessBadge e pelas
// telas de Saúde (E10). Régua do doc: <24h ok · 24–48h atenção · >48h crítico.
export type FreshnessLevel = 'fresh' | 'stale' | 'old' | 'never'

export interface FreshnessInfo {
  level: FreshnessLevel
  label: string
}

export function freshnessInfo(iso: string | null | undefined, now: Date = new Date()): FreshnessInfo {
  if (!iso) return { level: 'never', label: 'nunca' }
  const ms = now.getTime() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return { level: 'never', label: 'nunca' }
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return { level: 'fresh', label: 'há menos de 1 h' }
  if (hours < 24) return { level: 'fresh', label: `há ${hours} h` }
  if (hours < 48) return { level: 'stale', label: `há ${hours} h` }
  return { level: 'old', label: `há ${Math.floor(hours / 24)} d` }
}
