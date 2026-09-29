import { describe, it, expect } from 'vitest'
import { isDemoTenant } from '../demo-tenant'
import {
  MockSqlAdapter,
  ProtheusSqlAdapter,
  resolveSqlAdapter,
} from '../protheus-sql/sql-api.adapter'

describe('isDemoTenant', () => {
  it('só o booleano true liga', () => {
    expect(isDemoTenant({ intelligenceConfig: { demoData: true } })).toBe(true)
  })

  it('nega tudo que não for exatamente true', () => {
    // A string 'true' vindo de um JSON malformado não pode ligar dados
    // sintéticos numa empresa real — o custo do falso positivo é a carteira
    // do cliente sumir da tela do vendedor.
    expect(isDemoTenant({ intelligenceConfig: { demoData: 'true' } })).toBe(false)
    expect(isDemoTenant({ intelligenceConfig: { demoData: 1 } })).toBe(false)
    expect(isDemoTenant({ intelligenceConfig: { demoData: false } })).toBe(false)
    expect(isDemoTenant({ intelligenceConfig: {} })).toBe(false)
    expect(isDemoTenant({ intelligenceConfig: null })).toBe(false)
    expect(isDemoTenant({ intelligenceConfig: 'demo' })).toBe(false)
    expect(isDemoTenant({})).toBe(false)
    expect(isDemoTenant(null)).toBe(false)
  })
})

describe('resolveSqlAdapter', () => {
  it('demonstração usa o sintético mesmo com o ambiente em protheus', () => {
    const adapter = resolveSqlAdapter({ intelligenceConfig: { demoData: true } }, 'protheus')
    expect(adapter).toBeInstanceOf(MockSqlAdapter)
  })

  it('empresa comum segue o ambiente', () => {
    expect(resolveSqlAdapter({}, 'protheus')).toBeInstanceOf(ProtheusSqlAdapter)
    expect(resolveSqlAdapter({}, 'mock')).toBeInstanceOf(MockSqlAdapter)
  })

  it('demoData não vaza entre empresas', () => {
    const demo = { intelligenceConfig: { demoData: true } }
    const real = { intelligenceConfig: { syncHour: 3 } }
    expect(resolveSqlAdapter(demo, 'protheus')).toBeInstanceOf(MockSqlAdapter)
    expect(resolveSqlAdapter(real, 'protheus')).toBeInstanceOf(ProtheusSqlAdapter)
  })
})
