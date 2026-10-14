import { describe, it, expect } from 'vitest'
import { schemaViolations } from '../schema-check'
import { PORTFOLIO_SCHEMA } from '../prompts/portfolio'
import { BRIEFING_SCHEMA } from '../prompts/briefing'

describe('schemaViolations (plano 012)', () => {
  it('resposta no formato passa limpa', () => {
    expect(schemaViolations({ summary: 'ok', actions: ['C1: visitar'] }, PORTFOLIO_SCHEMA)).toEqual([])
  })

  it.each([
    ['actions que não é lista', { summary: 'ok', actions: 'visitar C1' }, '$.actions não é lista'],
    ['lista vazia abaixo do mínimo', { summary: 'ok', actions: [] }, '$.actions com menos de 1'],
    ['lista acima do máximo', { summary: 'ok', actions: ['a', 'b', 'c', 'd'] }, 'com mais de 3'],
    ['campo obrigatório ausente', { actions: ['a'] }, '$.summary ausente'],
    ['campo extra', { summary: 'ok', actions: ['a'], nota: 'x' }, '$.nota fora do schema'],
    ['item que não é texto', { summary: 'ok', actions: [1] }, '$.actions[0] não é texto'],
  ])('%s', (_label, data, expected) => {
    expect(schemaViolations(data, PORTFOLIO_SCHEMA).join(' | ')).toContain(expected)
  })

  it('briefing sem o campo de confiança reprova', () => {
    expect(
      schemaViolations({ whatHappened: 'a', whyItMatters: 'b', whatToDo: 'c' }, BRIEFING_SCHEMA)
    ).toEqual(['$.confidence ausente'])
  })

  it('resposta que não é objeto', () => {
    expect(schemaViolations(['x'], BRIEFING_SCHEMA)).toEqual(['$ não é objeto'])
  })
})
