// Valores dos campos do contrato e do aditivo (plano 014, passo 5). A função
// pura decide o texto que entra no documento com hash; o carregador só monta a
// entrada (o teste dele confere que a data do aceite vem do CONTRACT original).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Prisma } from '@prisma/client'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import {
  buildContractFieldValues,
  loadContractFieldInput,
  type ContractFieldInput,
  type TermsForFields,
} from '../contract-fields'

const terms = (over: Partial<TermsForFields> = {}): TermsForFields => ({
  id: 'terms-1',
  version: 1,
  licenseType: 'STANDARD',
  includedSeats: 10,
  extraSeats: 0,
  packagePrice: new Prisma.Decimal('1500'),
  extraSeatPrice: new Prisma.Decimal('95.5'),
  proposedEffectiveFrom: null,
  reason: null,
  requestedByClient: false,
  package: { name: 'Pacote 10' },
  ...over,
})

const profile = {
  legalName: 'Empresa Exemplo Ltda',
  tradeName: 'Exemplo',
  addressStreet: 'Rua Exemplo',
  addressNumber: '100',
  addressComplement: 'Sala 2',
  addressDistrict: 'Centro',
  addressCity: 'Cidade Exemplo',
  addressState: 'SP',
  addressZip: '01310100',
  legalRepName: 'Nome do Representante',
  legalRepCpf: '11144477735',
  legalRepRole: 'Diretor',
  billingEmail: 'cobranca@example.com',
}

const input = (over: Partial<ContractFieldInput> = {}): ContractFieldInput => ({
  kind: 'CONTRACT',
  company: { cnpj: '12345678000190' },
  profile,
  contract: { graceMonths: 0, dueDay: 10, overdueBlockDays: null },
  designatedAdmin: { id: 'admin-1', name: 'Nome do Administrador', email: 'admin@example.com' },
  terms: terms(),
  previousTerms: null,
  acceptedContractAt: null,
  template: { version: 1 },
  settings: { overdueBlockDays: 15 },
  issuedAt: new Date('2026-10-16T12:00:00Z'),
  ...over,
})

describe('buildContractFieldValues — contrato', () => {
  it('todos os formatos da tabela', () => {
    expect(buildContractFieldValues(input())).toEqual({
      'contratada.razaoSocial': 'GH ENGENHARIA LTDA - ME',
      'contratada.cnpj': '07.841.407/0001-90',
      'contratada.endereco': 'Rua Débora da Silva Braga, 55, Bessa, João Pessoa/PB, CEP 58037-350',
      'contratada.encarregado': 'Gustavo Henrique Palitot Costa',
      'contratada.emailContato': 'contato@addere.com.br',
      'contratada.emailSuporte': 'suporte@addere.com.br',
      'cliente.razaoSocial': 'Empresa Exemplo Ltda',
      'cliente.nomeFantasia': 'Exemplo',
      'cliente.cnpj': '12.345.678/0001-90',
      'cliente.endereco': 'Rua Exemplo, 100, Sala 2, Centro, Cidade Exemplo/SP, CEP 01310-100',
      'cliente.representanteNome': 'Nome do Representante',
      'cliente.representanteCpf': '111.444.777-35',
      'cliente.representanteCargo': 'Diretor',
      'cliente.emailCobranca': 'cobranca@example.com',
      'cliente.administradorNome': 'Nome do Administrador',
      'cliente.administradorEmail': 'admin@example.com',
      'licenca.pacote': 'Pacote 10',
      'licenca.tipo': 'Padrão',
      'licenca.quantidade': '10',
      'licenca.adicionais': '0',
      'licenca.total': '10',
      'licenca.inteligencia': 'Não incluída',
      'valores.pacote': 'R$ 1.500,00',
      'valores.pacoteExtenso': 'mil e quinhentos reais',
      'valores.adicional': 'R$ 95,50',
      'valores.adicionalExtenso': 'noventa e cinco reais e cinquenta centavos',
      'valores.mensal': 'R$ 1.500,00',
      'valores.mensalExtenso': 'mil e quinhentos reais',
      'cobranca.carenciaMeses': '0',
      'cobranca.diaVencimento': '10',
      'cobranca.diasParaSuspensao': '15',
      'documento.dataEmissao': '16/10/2026',
      'documento.versaoModelo': '1',
      'aditivo.contratoAceitoEm': null,
      'aditivo.pacoteAnterior': null,
      'aditivo.tipoAnterior': null,
      'aditivo.quantidadeAnterior': null,
      'aditivo.adicionaisAnterior': null,
      'aditivo.valorPacoteAnterior': null,
      'aditivo.valorAdicionalAnterior': null,
      'aditivo.mensalAnterior': null,
      'aditivo.valeAPartirDe': null,
      'aditivo.motivo': null,
    })
  })

  it('Com Inteligência', () => {
    const v = buildContractFieldValues(input({ terms: terms({ licenseType: 'INTELLIGENCE' }) }))
    expect(v['licenca.tipo']).toBe('Com Inteligência')
    expect(v['licenca.inteligencia']).toBe('Incluída')
  })

  it('Ilimitado com a quantidade digitada no contrato', () => {
    const v = buildContractFieldValues(
      input({ terms: terms({ package: { name: 'Ilimitado' }, includedSeats: 100 }) })
    )
    expect(v['licenca.pacote']).toBe('Ilimitado')
    expect(v['licenca.quantidade']).toBe('100')
    expect(v['licenca.total']).toBe('100')
  })

  it('mensal com adicionais: pacote + adicionais × valor unitário', () => {
    const v = buildContractFieldValues(input({ terms: terms({ extraSeats: 3 }) }))
    expect(v['licenca.adicionais']).toBe('3')
    expect(v['licenca.total']).toBe('13')
    expect(v['valores.mensal']).toBe('R$ 1.786,50')
    expect(v['valores.mensalExtenso']).toBe(
      'mil, setecentos e oitenta e seis reais e cinquenta centavos'
    )
  })

  it('dias para suspensão: a exceção do contrato vence a regra global', () => {
    const v = buildContractFieldValues(
      input({ contract: { graceMonths: 2, dueDay: 5, overdueBlockDays: 20 } })
    )
    expect(v['cobranca.diasParaSuspensao']).toBe('20')
    expect(v['cobranca.carenciaMeses']).toBe('2')
    expect(v['cobranca.diaVencimento']).toBe('5')
  })

  it('null para cada dado ausente do perfil', () => {
    const v = buildContractFieldValues(
      input({
        profile: {
          ...profile,
          legalName: '  ',
          tradeName: null,
          legalRepName: null,
          legalRepCpf: '',
          legalRepRole: null,
          billingEmail: null,
        },
        company: { cnpj: ' ' },
      })
    )
    expect(v['cliente.razaoSocial']).toBeNull()
    expect(v['cliente.nomeFantasia']).toBeNull()
    expect(v['cliente.cnpj']).toBeNull()
    expect(v['cliente.representanteNome']).toBeNull()
    expect(v['cliente.representanteCpf']).toBeNull()
    expect(v['cliente.representanteCargo']).toBeNull()
    expect(v['cliente.emailCobranca']).toBeNull()
  })

  it('sem perfil, sem contrato e sem termos: os campos deles ficam null', () => {
    const v = buildContractFieldValues(input({ profile: null, contract: null, terms: null }))
    expect(v['cliente.razaoSocial']).toBeNull()
    expect(v['cliente.endereco']).toBeNull()
    expect(v['licenca.pacote']).toBeNull()
    expect(v['valores.mensal']).toBeNull()
    expect(v['cobranca.diaVencimento']).toBeNull()
  })

  it('nome fantasia vazio usa a razão social', () => {
    const v = buildContractFieldValues(input({ profile: { ...profile, tradeName: ' ' } }))
    expect(v['cliente.nomeFantasia']).toBe('Empresa Exemplo Ltda')
  })

  it('sem administrador indicado, nome e e-mail dele ficam null', () => {
    const v = buildContractFieldValues(input({ designatedAdmin: null }))
    expect(v['cliente.administradorNome']).toBeNull()
    expect(v['cliente.administradorEmail']).toBeNull()
  })

  it('endereço sem CEP dá null; sem complemento some a vírgula', () => {
    expect(
      buildContractFieldValues(input({ profile: { ...profile, addressZip: null } }))[
        'cliente.endereco'
      ]
    ).toBeNull()
    expect(
      buildContractFieldValues(input({ profile: { ...profile, addressComplement: '' } }))[
        'cliente.endereco'
      ]
    ).toBe('Rua Exemplo, 100, Centro, Cidade Exemplo/SP, CEP 01310-100')
  })

  it('data de emissão às 23h30 de São Paulo cai no dia de São Paulo', () => {
    const v = buildContractFieldValues(input({ issuedAt: new Date('2026-11-01T02:30:00Z') }))
    expect(v['documento.dataEmissao']).toBe('31/10/2026')
  })
})

describe('buildContractFieldValues — aditivo', () => {
  const amendment = (over: Partial<ContractFieldInput> = {}) =>
    input({
      kind: 'AMENDMENT',
      terms: terms({
        id: 'terms-2',
        version: 2,
        licenseType: 'INTELLIGENCE',
        packagePrice: new Prisma.Decimal('2000'),
        reason: 'Upgrade pedido pela Empresa',
      }),
      previousTerms: terms(),
      acceptedContractAt: new Date('2026-10-16T12:13:00Z'),
      ...over,
    })

  it('antes e depois, data do aceite do contrato e motivo', () => {
    const v = buildContractFieldValues(amendment())
    expect(v['aditivo.contratoAceitoEm']).toBe('16/10/2026')
    expect(v['aditivo.pacoteAnterior']).toBe('Pacote 10')
    expect(v['aditivo.tipoAnterior']).toBe('Padrão')
    expect(v['aditivo.quantidadeAnterior']).toBe('10')
    expect(v['aditivo.adicionaisAnterior']).toBe('0')
    expect(v['aditivo.valorPacoteAnterior']).toBe('R$ 1.500,00')
    expect(v['aditivo.valorAdicionalAnterior']).toBe('R$ 95,50')
    expect(v['aditivo.mensalAnterior']).toBe('R$ 1.500,00')
    expect(v['licenca.tipo']).toBe('Com Inteligência')
    expect(v['valores.pacote']).toBe('R$ 2.000,00')
    expect(v['aditivo.motivo']).toBe('Upgrade pedido pela Empresa')
  })

  it('com "vale a partir de": a data, no dia de São Paulo', () => {
    const v = buildContractFieldValues(
      amendment({
        terms: terms({ proposedEffectiveFrom: new Date('2026-12-01T03:01:00Z') }),
      })
    )
    expect(v['aditivo.valeAPartirDe']).toBe('01/12/2026')
  })

  it('sem "vale a partir de": a data de emissão (nunca vazio)', () => {
    const v = buildContractFieldValues(amendment())
    expect(v['aditivo.valeAPartirDe']).toBe('16/10/2026')
    expect(v['aditivo.valeAPartirDe']).toBe(v['documento.dataEmissao'])
  })
})

describe('loadContractFieldInput', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  const termsRow = (over: Record<string, unknown> = {}) => ({
    ...terms(),
    status: 'EFFECTIVE',
    origin: 'CONTRACT',
    effectiveFrom: new Date('2026-10-16T12:13:00Z'),
    ...over,
  })

  it('aditivo: termos propostos, anteriores e o aceite do CONTRACT original', async () => {
    prismaMock.company.findUnique.mockResolvedValue({
      cnpj: '12345678000190',
      clientProfile: profile,
      contract: {
        id: 'contract-1',
        graceMonths: 0,
        dueDay: 10,
        overdueBlockDays: null,
        designatedAdmin: {
          id: 'admin-1',
          name: 'Nome do Administrador',
          email: 'admin@example.com',
        },
        terms: [
          termsRow(),
          termsRow({ id: 'terms-2', version: 2, effectiveFrom: new Date('2026-11-02T12:00:00Z') }),
          termsRow({
            id: 'terms-3',
            version: 3,
            status: 'PROPOSED',
            origin: 'AMENDMENT',
            effectiveFrom: null,
          }),
          termsRow({
            id: 'terms-4',
            version: 4,
            status: 'WITHDRAWN',
            origin: 'AMENDMENT',
            effectiveFrom: null,
          }),
        ],
      },
    })
    prismaMock.billingSettings.findUnique.mockResolvedValue({ overdueBlockDays: 15 })
    prismaMock.contractDocument.findFirst.mockResolvedValue({
      acceptedAt: new Date('2026-10-16T12:13:00Z'),
    })

    const loaded = await loadContractFieldInput(
      prismaMock,
      'company-1',
      'AMENDMENT',
      { version: 1 },
      new Date('2026-12-01T12:00:00Z')
    )
    expect(loaded?.terms?.id).toBe('terms-3')
    expect(loaded?.previousTerms?.id).toBe('terms-2')
    expect(loaded?.acceptedContractAt?.toISOString()).toBe('2026-10-16T12:13:00.000Z')
    // A data do aceite vem do CONTRACT, nunca de um aditivo aceito depois
    expect(prismaMock.contractDocument.findFirst.mock.calls[0][0].where).toEqual({
      contractId: 'contract-1',
      kind: 'CONTRACT',
      status: 'ACCEPTED',
    })
  })

  it('empresa inexistente → null', async () => {
    expect(
      await loadContractFieldInput(prismaMock, 'x', 'CONTRACT', { version: 1 }, new Date())
    ).toBeNull()
  })
})
