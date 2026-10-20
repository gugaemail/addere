import { describe, it, expect, vi } from 'vitest'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

import { productSearchWhere } from '../products.service'
import { customerSearchWhere } from '../../customers/customers.service'

const insensitive = (value: string) => ({ contains: value, mode: 'insensitive' })

describe('productSearchWhere', () => {
  it('sem busca, sem filtro', () => {
    expect(productSearchWhere(undefined)).toEqual({})
    expect(productSearchWhere('   ')).toEqual({})
  })

  it('cada palavra na descrição ou no código, sem diferença de maiúsculas', () => {
    expect(productSearchWhere(' adc  saco ')).toEqual({
      AND: [
        { OR: [{ name: insensitive('adc') }, { protheusCode: insensitive('adc') }] },
        { OR: [{ name: insensitive('saco') }, { protheusCode: insensitive('saco') }] },
      ],
    })
  })
})

describe('customerSearchWhere', () => {
  it('documento procurado só pelos dígitos', () => {
    expect(customerSearchWhere('08.039.087')).toEqual({
      AND: [
        {
          OR: [
            { name: insensitive('08.039.087') },
            { protheusCode: insensitive('08.039.087') },
            { document: { contains: '08039087' } },
          ],
        },
      ],
    })
  })

  it('palavra sem dígito não procura no documento', () => {
    expect(customerSearchWhere('silva')).toEqual({
      AND: [{ OR: [{ name: insensitive('silva') }, { protheusCode: insensitive('silva') }] }],
    })
  })
})
