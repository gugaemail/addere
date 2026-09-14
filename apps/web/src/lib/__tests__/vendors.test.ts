import { describe, expect, it } from 'vitest'
import type { UserPublic } from '@addere/types'
import {
  managerNameOf,
  vehicleLabel,
  vendorSetupWarnings,
  vendorWarningText,
  vendorsOfCompany,
} from '../vendors'

const user = (over: Partial<UserPublic>): UserPublic => ({
  id: 'u',
  name: 'Fulano',
  email: 'f@x.com',
  role: 'SALESPERSON',
  active: true,
  idVendProt: '001',
  createdAt: '2026-01-01T00:00:00Z',
  companyId: 'c1',
  ...over,
})

describe('vehicleLabel', () => {
  it('traduz o enum e cai em travessão sem veículo', () => {
    expect(vehicleLabel('CAR')).toBe('Carro')
    expect(vehicleLabel('MOTORCYCLE')).toBe('Moto')
    expect(vehicleLabel('FOOT')).toBe('A pé')
    expect(vehicleLabel(null)).toBe('—')
    expect(vehicleLabel(undefined)).toBe('—')
  })
})

describe('vendorsOfCompany', () => {
  const users = [
    user({ id: '1', name: 'Zeca', idVendProt: '003' }),
    user({ id: '2', name: 'Ana', idVendProt: '001' }),
    user({ id: '3', name: 'Sem código', idVendProt: null }),
    user({ id: '4', name: 'Em branco', idVendProt: '   ' }),
    user({ id: '5', name: 'Outra empresa', companyId: 'c2' }),
    user({ id: '6', name: 'Admin com código', role: 'ADMIN', idVendProt: '009' }),
    user({ id: '7', name: 'Super', role: 'SUPERADMIN', companyId: null }),
  ]

  it('só quem tem código Protheus na empresa, em ordem alfabética', () => {
    expect(vendorsOfCompany(users, 'c1').map((u) => u.name)).toEqual([
      'Admin com código',
      'Ana',
      'Zeca',
    ])
  })

  it('sem empresa ativa devolve vazio', () => {
    expect(vendorsOfCompany(users, null)).toEqual([])
  })
})

describe('vendorSetupWarnings/vendorWarningText', () => {
  it('conta ativos sem gerente e sem visitas por dia', () => {
    const w = vendorSetupWarnings([
      user({ id: '1', managerId: 'm', visitsPerDay: 8 }),
      user({ id: '2', managerId: null, visitsPerDay: 8 }),
      user({ id: '3', managerId: 'm', visitsPerDay: null }),
      user({ id: '4', managerId: null, visitsPerDay: null, active: false }), // inativo não conta
    ])
    expect(w).toEqual({ withoutManager: 1, withoutVisits: 1 })
  })

  it('frase junta as duas partes e some quando não há aviso', () => {
    expect(vendorWarningText({ withoutManager: 0, withoutVisits: 0 })).toBeNull()
    expect(vendorWarningText({ withoutManager: 1, withoutVisits: 0 })).toMatch(
      /^1 vendedor sem gerente — /
    )
    expect(vendorWarningText({ withoutManager: 2, withoutVisits: 3 })).toMatch(
      /^2 vendedores sem gerente e 3 vendedores sem visitas por dia — /
    )
  })
})

describe('managerNameOf', () => {
  const users = [user({ id: 'm1', name: 'Gerente Um' })]
  it('resolve o nome pelo id; sem gerente ou desconhecido vira travessão', () => {
    expect(managerNameOf(users, 'm1')).toBe('Gerente Um')
    expect(managerNameOf(users, 'zz')).toBe('—')
    expect(managerNameOf(users, null)).toBe('—')
  })
})
