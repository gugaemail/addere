import {
  parseIntelStatusParam,
  statusColor,
  statusLabel,
  STATUS_LABELS,
} from '../customerStatus'
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

describe('parseIntelStatusParam', () => {
  it('lê a lista do atalho do Hoje', () => {
    expect(parseIntelStatusParam('LATE,AT_RISK')).toEqual(['LATE', 'AT_RISK'])
  })

  it('sem parâmetro ou vazio = lista completa', () => {
    // O botão de limpar manda '': precisa voltar a lista inteira, senão o
    // vendedor fica preso no recorte que veio do Hoje.
    expect(parseIntelStatusParam(undefined)).toBeNull()
    expect(parseIntelStatusParam('')).toBeNull()
  })

  it('descarta status inventado e mantém os válidos', () => {
    expect(parseIntelStatusParam('LATE,QUALQUERCOISA')).toEqual(['LATE'])
    expect(parseIntelStatusParam('QUALQUERCOISA')).toBeNull()
  })

  it('tolera espaços', () => {
    expect(parseIntelStatusParam('LATE, AT_RISK')).toEqual(['LATE', 'AT_RISK'])
  })
})
