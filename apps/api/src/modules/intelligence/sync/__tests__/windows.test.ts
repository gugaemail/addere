import { describe, it, expect } from 'vitest'
import { incrementalWindow, monthlyWindows, periodWindow } from '../windows'

// 12:00 UTC = 09:00 em São Paulo — sem ambiguidade de virada de dia
const REF = new Date('2026-08-21T12:00:00Z')

describe('incrementalWindow', () => {
  it('7 dias para trás até hoje', () => {
    expect(incrementalWindow(7, REF)).toEqual({ dataIni: '20260814', dataFim: '20260821' })
  })
})

describe('periodWindow', () => {
  it('mês fechado com último dia correto', () => {
    expect(periodWindow('202602')).toEqual({ dataIni: '20260201', dataFim: '20260228' })
    expect(periodWindow('202807')).toEqual({ dataIni: '20280701', dataFim: '20280731' })
    expect(periodWindow('202812')).toEqual({ dataIni: '20281201', dataFim: '20281231' })
  })

  it('ano bissexto', () => {
    expect(periodWindow('202802').dataFim).toBe('20280229')
  })
})

describe('monthlyWindows', () => {
  it('13 janelas, da mais antiga para a atual (parcial)', () => {
    const windows = monthlyWindows(13, REF)
    expect(windows).toHaveLength(13)
    expect(windows[0]).toEqual({ dataIni: '20250801', dataFim: '20250831' })
    expect(windows[1].dataIni).toBe('20250901')
    expect(windows[12]).toEqual({ dataIni: '20260801', dataFim: '20260821' })
  })

  it('cruza a virada de ano sem escorregar', () => {
    const windows = monthlyWindows(3, new Date('2026-01-15T12:00:00Z'))
    expect(windows.map((w) => w.dataIni)).toEqual(['20251101', '20251201', '20260101'])
    expect(windows[1].dataFim).toBe('20251231')
  })

  it('janelas cobrem o intervalo sem buracos nem sobreposição', () => {
    const windows = monthlyWindows(13, REF)
    for (let i = 1; i < windows.length; i++) {
      const prevEnd = Number(windows[i - 1].dataFim)
      const start = Number(windows[i].dataIni)
      expect(start).toBeGreaterThan(prevEnd)
      expect(windows[i].dataIni.endsWith('01')).toBe(true)
    }
  })
})
