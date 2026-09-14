import {
  parseIntelStatusParam,
  rfmColor,
  rfmLabel,
  RFM_LABELS,
  RFM_SEGMENTS,
  statusColor,
  statusLabel,
  STATUS_LABELS,
} from '../customerStatus'
import { colors } from '../../theme'
import type { CustomerStatus } from '@addere/types'

describe('rfm (E19)', () => {
  it('cada segmento tem rótulo PT e cor de token', () => {
    const tokenColors = new Set<string>([
      ...Object.values(colors.status),
      ...Object.values(colors.brand),
      ...Object.values(colors.semantic),
    ])
    for (const segment of RFM_SEGMENTS) {
      expect(rfmLabel(segment)).toBe(RFM_LABELS[segment])
      expect(rfmLabel(segment)).not.toBe('')
      expect(tokenColors.has(rfmColor(segment))).toBe(true)
    }
  })

  it('rótulos combinados com o painel', () => {
    expect(rfmLabel('CHAMPION')).toBe('Campeão')
    expect(rfmLabel('AT_RISK')).toBe('Valioso em risco')
    expect(rfmColor('AT_RISK')).toBe(colors.status.atRisk)
    expect(rfmColor('CHAMPION')).toBe(colors.status.onCycle)
  })
})

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
