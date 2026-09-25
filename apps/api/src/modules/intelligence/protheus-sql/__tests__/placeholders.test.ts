import { describe, it, expect } from 'vitest'
import { substitutePlaceholders, findPlaceholders, formatDateYmdSaoPaulo } from '../placeholders'

describe('placeholders', () => {
  it('substitui FILIAL com múltiplas filiais quotadas', () => {
    const r = substitutePlaceholders('WHERE F IN ({{FILIAL}})', { branches: ['01', 'D MG 01'] })
    expect(r.errors).toEqual([])
    expect(r.sql).toBe("WHERE F IN ('01','D MG 01')")
  })

  it('substitui datas e vendedor', () => {
    const r = substitutePlaceholders('BETWEEN {{DATA_INI}} AND {{DATA_FIM}} AND V={{VENDEDOR}}', {
      dataIni: '20260101',
      dataFim: '20260131',
      vendedor: '000012',
    })
    expect(r.errors).toEqual([])
    expect(r.sql).toBe("BETWEEN '20260101' AND '20260131' AND V='000012'")
  })

  it('erro quando não há filial ativa', () => {
    const r = substitutePlaceholders('IN ({{FILIAL}})', { branches: [] })
    expect(r.errors[0]).toMatch(/Nenhuma filial/)
  })

  it('rejeita código de filial com aspas (injeção)', () => {
    const r = substitutePlaceholders('IN ({{FILIAL}})', { branches: ["01' OR '1'='1"] })
    expect(r.errors[0]).toMatch(/inválido/)
    expect(r.sql).toContain('{{FILIAL}}') // não substituiu
  })

  it('rejeita data fora do formato YYYYMMDD', () => {
    const r = substitutePlaceholders('={{HOJE}}', { hoje: '2026-01-01' })
    expect(r.errors[0]).toMatch(/HOJE/)
  })

  it('rejeita vendedor com caractere especial', () => {
    const r = substitutePlaceholders('={{VENDEDOR}}', { vendedor: '0001;--' })
    expect(r.errors[0]).toMatch(/VENDEDOR/)
  })

  it('acusa placeholder desconhecido', () => {
    const r = substitutePlaceholders('={{NOPE}}', {})
    expect(r.errors[0]).toMatch(/desconhecido/i)
  })

  it('acusa placeholder que sobrou sem valor', () => {
    const r = substitutePlaceholders('={{PRODUTO}}', {})
    expect(r.errors.length).toBeGreaterThan(0)
  })

  it('é case-insensitive na substituição e aceita espaços internos', () => {
    const r = substitutePlaceholders('IN ({{ filial }})', { branches: ['01'] })
    expect(r.sql).toBe("IN ('01')")
  })

  it('findPlaceholders normaliza para maiúsculas e deduplica', () => {
    expect(findPlaceholders('{{filial}} {{FILIAL}} {{hoje}}')).toEqual(['FILIAL', 'HOJE'])
  })

  it('formatDateYmdSaoPaulo converte UTC para o dia civil BRT', () => {
    // 02:00 UTC = 23:00 do dia anterior em São Paulo (UTC-3)
    expect(formatDateYmdSaoPaulo(new Date('2026-08-20T02:00:00Z'))).toBe('20260819')
    expect(formatDateYmdSaoPaulo(new Date('2026-08-20T12:00:00Z'))).toBe('20260820')
  })
})
