import { describe, it, expect } from 'vitest'
import {
  FULL_DESDE,
  desdeFromCursor,
  inspectStamps,
  maxStamp,
  normalizeStamp,
  rowStamps,
  splitDeletedRows,
  stampProblem,
} from '../cursor'

describe('normalizeStamp', () => {
  it('aceita o CONVERT 121 e o ISO com T, completando os milissegundos', () => {
    expect(normalizeStamp('2026-10-01 11:43:19.920')).toBe('2026-10-01 11:43:19.920')
    expect(normalizeStamp('2026-10-01T11:43:19.9')).toBe('2026-10-01 11:43:19.900')
    expect(normalizeStamp('2026-10-01 11:43:19')).toBe('2026-10-01 11:43:19.000')
  })

  it('recusa o que não é carimbo', () => {
    expect(normalizeStamp(null)).toBeNull()
    expect(normalizeStamp(20261001)).toBeNull()
    expect(normalizeStamp('01/10/2026 11:43')).toBeNull()
  })
})

describe('maxStamp', () => {
  it('ordena como texto na forma canônica', () => {
    expect(
      maxStamp(['2026-10-01 11:43:19.920', '2026-10-02 08:00:00.000', '2026-10-01 23:59:59.997'])
    ).toBe('2026-10-02 08:00:00.000')
    expect(maxStamp([])).toBeNull()
  })
})

describe('desdeFromCursor', () => {
  it('volta a folga e devolve ISO com T', () => {
    expect(desdeFromCursor('2026-10-01 11:43:19.920')).toBe('2026-10-01T11:33:19.920')
  })

  it('atravessa virada de dia, mês e ano sem aplicar fuso', () => {
    expect(desdeFromCursor('2026-10-01 00:05:00.000')).toBe('2026-09-30T23:55:00.000')
    expect(desdeFromCursor('2027-01-01 00:00:00.000', 10)).toBe('2026-12-31T23:50:00.000')
  })

  it('cursor corrompido relê tudo em vez de pular dados', () => {
    expect(desdeFromCursor('lixo')).toBe(FULL_DESDE)
  })
})

describe('splitDeletedRows', () => {
  it("separa excluido = '*' (coluna em qualquer caixa); sem a coluna, tudo é vivo", () => {
    const { live, deleted } = splitDeletedRows([
      { titulo: 'A', excluido: ' ' },
      { titulo: 'B', EXCLUIDO: '*' },
      { titulo: 'C' },
    ])
    expect(live.map((r) => r.titulo)).toEqual(['A', 'C'])
    expect(deleted.map((r) => r.titulo)).toEqual(['B'])
  })
})

describe('rowStamps', () => {
  it('conta as linhas sem carimbo válido', () => {
    const { stamps, missing } = rowStamps([
      { stamp: '2026-10-01 11:43:19.920' },
      { STAMP: '2026-10-01 11:44:00.000' },
      { stamp: null },
      {},
    ])
    expect(stamps).toEqual(['2026-10-01 11:43:19.920', '2026-10-01 11:44:00.000'])
    expect(missing).toBe(2)
  })
})

describe('inspectStamps / stampProblem', () => {
  it('carimbo NULL ou vazio é normal (registro intocado desde a ativação do S_T_A_M_P_)', () => {
    const rows = [
      { stamp: '2026-07-14 12:15:51.880' },
      { stamp: null },
      { stamp: '' },
      { stamp: '   ' },
    ]
    expect(inspectStamps(rows)).toEqual({ hasColumn: true, valid: 1, empty: 3, invalid: 0 })
    expect(stampProblem(rows)).toBeNull()
  })

  it('todos NULL ainda é ok — a coluna existe', () => {
    expect(stampProblem([{ stamp: null }, { STAMP: null }])).toBeNull()
  })

  it('falha se a coluna não vier ou vier em formato errado', () => {
    expect(stampProblem([{ titulo: 'A' }])).toMatch(/não devolve a coluna stamp/)
    expect(stampProblem([{ stamp: '14/07/2026 12:15' }])).toMatch(/formato inesperado/)
  })

  it('sem linhas não há o que julgar', () => {
    expect(stampProblem([])).toBeNull()
  })
})
