import { statusColor, statusLabel, STATUS_LABELS } from '../customerStatus'
import { colors } from '../../theme'
import type { CustomerStatus } from '@addere/types'

describe('customerStatus', () => {
  it('mapeia cada status para a cor do token (nunca hex solto)', () => {
    expect(statusColor('ON_CYCLE')).toBe(colors.status.onCycle)
    expect(statusColor('LATE')).toBe(colors.status.late)
    expect(statusColor('AT_RISK')).toBe(colors.status.atRisk)
    expect(statusColor('BLOCKED')).toBe(colors.status.blocked)
    expect(statusColor('INACTIVE')).toBe(colors.status.inactive)
    expect(statusColor('NEW')).toBe(colors.status.new)
  })

  it('tem rótulo PT para todos os status', () => {
    const all: CustomerStatus[] = ['NEW', 'ON_CYCLE', 'LATE', 'AT_RISK', 'INACTIVE', 'BLOCKED']
    for (const status of all) {
      expect(statusLabel(status)).toBe(STATUS_LABELS[status])
      expect(statusLabel(status)).not.toBe('')
    }
  })
})
