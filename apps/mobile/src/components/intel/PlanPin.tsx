// Pino do mapa do plano (E13b, D14b): navy numerado com anel na cor do
// status — vazio quando previsto, cheio quando já teve check-in no aparelho.
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg'
import type { CustomerStatus } from '@addere/types'
import { statusColor } from '../../utils/customerStatus'
import { colors } from '../../theme'

export const PIN_SIZE = 40

interface PlanPinProps {
  position: number
  status: CustomerStatus
  /** true = visita já registrada neste aparelho (pino cheio) */
  visited?: boolean
}

export function PlanPin({ position, status, visited = false }: PlanPinProps) {
  const ring = statusColor(status)
  const fill = visited ? colors.brand.dark : colors.neutral.white
  const number = visited ? colors.neutral.white : colors.brand.dark

  return (
    <Svg width={PIN_SIZE} height={PIN_SIZE + 8} viewBox="0 0 40 48">
      {/* Rabinho do pino */}
      <Path d="M20 46 L14 32 L26 32 Z" fill={colors.brand.dark} />
      {/* Anel externo na cor do status */}
      <Circle cx={20} cy={18} r={17} fill={ring} />
      {/* Corpo do pino */}
      <Circle cx={20} cy={18} r={13.5} fill={fill} stroke={colors.brand.dark} strokeWidth={2} />
      <SvgText
        x={20}
        y={23}
        textAnchor="middle"
        fontSize={13}
        fontWeight="bold"
        fill={number}
      >
        {String(position)}
      </SvgText>
    </Svg>
  )
}
