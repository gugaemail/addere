import { colors } from '../theme/colors'

// Mapeamentos únicos de status de pedido → label / variante de badge / cor.
// Substitui as redefinições locais que existiam em cada tela.
export const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  SYNCED: 'Sincronizado',
  CANCELLED: 'Cancelado',
}

export const STATUS_BADGE: Record<string, 'warning' | 'success' | 'danger' | 'neutral'> = {
  PENDING: 'warning',
  SYNCED: 'success',
  CANCELLED: 'danger',
}

export const STATUS_COLOR: Record<string, string> = {
  PENDING: colors.semantic.warning,
  SYNCED: colors.semantic.success,
  CANCELLED: colors.semantic.danger,
}
