// Premissas do motor (E5, doc §4.5) — defaults + overrides por tenant/segmento.
// Puro: recebe as linhas de IntelParameter já carregadas.
import { DEFAULT_INTEL_PARAMETERS } from '@addere/types'

export interface EngineParameters {
  late_factor: number
  risk_factor: number
  risk_days: number
  active_days: number
  cycle_min_orders: number
  blocked_days: number
  visits_per_day: number
  group_by: 'city' | 'district'
  saturday_workday: boolean
  max_same_status_pct: number
  weight_value: number
  weight_urgency: number
  weight_risk: number
  visited_cooldown_days: number
  reconciliation_tolerance_pct: number
}

export interface ParameterOverride {
  key: string
  value: unknown
  segment: string // '' = global
}

function coerce(key: keyof EngineParameters, value: unknown): number | string | boolean | null {
  const fallback = DEFAULT_INTEL_PARAMETERS[key]
  if (typeof fallback === 'boolean') return typeof value === 'boolean' ? value : null
  if (key === 'group_by') return value === 'city' || value === 'district' ? value : null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Resolve as premissas efetivas: defaults → overrides globais ('') → overrides
 * do segmento do cliente (ex.: atacado com late_factor menor). Valor inválido
 * no banco cai no default sem quebrar o motor.
 */
export function resolveParameters(
  overrides: ParameterOverride[],
  segment: string | null = null
): EngineParameters {
  const result = { ...DEFAULT_INTEL_PARAMETERS } as unknown as Record<string, unknown>

  const apply = (scope: string) => {
    for (const override of overrides) {
      if (override.segment !== scope) continue
      if (!(override.key in DEFAULT_INTEL_PARAMETERS)) continue
      const value = coerce(override.key as keyof EngineParameters, override.value)
      if (value !== null) result[override.key] = value
    }
  }

  apply('')
  if (segment) apply(segment)

  return result as unknown as EngineParameters
}
