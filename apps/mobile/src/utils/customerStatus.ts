// Status do cliente calculado pelo motor (E12) — cor, rótulo PT e ícone.
// Fonte da verdade das cores: src/theme/colors.ts (mesmos hex do painel web).
import type { CustomerStatus, RfmSegment } from '@addere/types'
import { colors } from '../theme'

export const STATUS_LABELS: Record<CustomerStatus, string> = {
  NEW: 'Novo',
  ON_CYCLE: 'Em ciclo',
  LATE: 'Atrasado',
  AT_RISK: 'Em risco',
  INACTIVE: 'Inativo',
  BLOCKED: 'Bloqueado',
}

export function statusColor(status: CustomerStatus): string {
  switch (status) {
    case 'ON_CYCLE':
      return colors.status.onCycle
    case 'LATE':
      return colors.status.late
    case 'AT_RISK':
      return colors.status.atRisk
    case 'BLOCKED':
      return colors.status.blocked
    case 'NEW':
      return colors.status.new
    case 'INACTIVE':
      return colors.status.inactive
  }
}

export function statusLabel(status: CustomerStatus): string {
  return STATUS_LABELS[status] ?? status
}

const VALID_STATUSES: CustomerStatus[] = ['NEW', 'ON_CYCLE', 'LATE', 'AT_RISK', 'INACTIVE', 'BLOCKED']

/**
 * Filtro de status vindo do parâmetro de rota (`?intelStatus=LATE,AT_RISK`),
 * usado pelo atalho "Quem está esfriando?" do Hoje. `null` = sem filtro, ou
 * seja, a lista completa.
 */
export function parseIntelStatusParam(raw: string | undefined): CustomerStatus[] | null {
  const parsed = (raw ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v): v is CustomerStatus => VALID_STATUSES.includes(v as CustomerStatus))
  return parsed.length > 0 ? parsed : null
}

// ─── Segmento RFM (E19) — rótulo PT e cor por token, nunca hex solto ───

export const RFM_SEGMENTS: RfmSegment[] = [
  'CHAMPION',
  'LOYAL',
  'PROMISING',
  'NEED_ATTENTION',
  'AT_RISK',
  'HIBERNATING',
  'LOST',
]

export const RFM_LABELS: Record<RfmSegment, string> = {
  CHAMPION: 'Campeão',
  LOYAL: 'Fiel',
  PROMISING: 'Promissor',
  NEED_ATTENTION: 'Atenção',
  AT_RISK: 'Valioso em risco',
  HIBERNATING: 'Hibernando',
  LOST: 'Perdido',
}

export function rfmLabel(segment: RfmSegment): string {
  return RFM_LABELS[segment] ?? segment
}

export function rfmColor(segment: RfmSegment): string {
  switch (segment) {
    case 'CHAMPION':
      return colors.status.onCycle
    case 'LOYAL':
      return colors.brand.primary
    case 'PROMISING':
      return colors.status.new
    case 'NEED_ATTENTION':
      return colors.status.late
    case 'AT_RISK':
      return colors.status.atRisk
    case 'HIBERNATING':
      return colors.semantic.muted
    case 'LOST':
      return colors.status.inactive
  }
}

