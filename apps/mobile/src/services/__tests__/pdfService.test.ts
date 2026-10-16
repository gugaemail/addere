// O PDF vai para o cliente (WhatsApp, e-mail): a Obs. Interna, a que "não sai
// na nota", não pode aparecer nele.
import type { Order } from '@addere/types'
import { buildHtml } from '../pdfService'

jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }))

function order(over: Partial<Order>): Order {
  return {
    id: 'o1',
    status: 'PENDING',
    createdAt: '2026-10-15T12:00:00.000Z',
    total: 100,
    items: [],
    customer: { name: 'Mercado Exemplo' },
    ...over,
  } as unknown as Order
}

describe('buildHtml', () => {
  it('imprime a Obs. Nota Fiscal e nunca a Obs. Interna', () => {
    const html = buildHtml(
      order({ mennota: 'Entregar pela manhã', notes: 'Cliente pede desconto' })
    )
    expect(html).toContain('Entregar pela manhã')
    expect(html).not.toContain('Cliente pede desconto')
  })

  it('só com Obs. Interna, o PDF fica sem o quadro de observações', () => {
    const html = buildHtml(order({ mennota: null, notes: 'Cliente pede desconto' }))
    expect(html).not.toContain('Cliente pede desconto')
    expect(html).not.toContain('obs-box"')
  })
})
