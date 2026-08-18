import type { CartItem } from '../types'
import {
  useOrderValidation,
  hasOrderFormErrors,
  changedItemFields,
  EMPTY_ORDER_FORM_ERRORS,
} from '../validation'

// Simula a configuração de campos obrigatórios da empresa (useFieldConfig)
const mockRequired = new Set<string>()
jest.mock('../../../hooks/useFieldConfig', () => ({
  useFieldRequired: (key: string) => mockRequired.has(key),
  useFieldVisible: () => true,
}))

const messages = {
  emptyCart:      'Adicione pelo menos um produto.',
  transportadora: 'Selecione uma transportadora.',
  condPag:        'Selecione uma condição de pagamento.',
}

function item(overrides: Partial<CartItem> = {}): CartItem {
  return {
    productId: 'p1', productName: 'Produto 1', productUnit: 'UN',
    quantity: 1, unitPrice: 10, discount: 0, descricao: 'Produto 1',
    ...overrides,
  }
}

const transportadora = { id: 't1', nome: 'Transp', protheusCode: null }
const condPag        = { id: 'c1', nome: 'À vista', protheusCode: null }

beforeEach(() => mockRequired.clear())

describe('useOrderValidation', () => {
  it('aprova pedido válido sem campos obrigatórios configurados', () => {
    const validate = useOrderValidation(messages)
    const result = validate({ cart: [item()], transportadora: null, condPag: null, mennota: '', notes: '' })
    expect(result.ok).toBe(true)
    expect(hasOrderFormErrors(result.errors)).toBe(false)
  })

  it('reprova carrinho vazio com a mensagem da tela', () => {
    const validate = useOrderValidation(messages)
    const result = validate({ cart: [], transportadora, condPag, mennota: '', notes: '' })
    expect(result.ok).toBe(false)
    expect(result.errors.form).toBe(messages.emptyCart)
  })

  it('exige transportadora, condPag e observações quando obrigatórios', () => {
    mockRequired.add('order.transportadora').add('order.condPag').add('order.mennota').add('order.notes')
    const validate = useOrderValidation(messages)
    const result = validate({ cart: [item()], transportadora: null, condPag: null, mennota: '  ', notes: '' })
    expect(result.ok).toBe(false)
    expect(result.errors.transportadora).toBe(messages.transportadora)
    expect(result.errors.condPag).toBe(messages.condPag)
    expect(result.errors.mennota).toBeDefined()
    expect(result.errors.notes).toBeDefined()
    expect(result.errors.items).toEqual({})
  })

  it('acumula erros por item, indexados por productId, só nos campos obrigatórios', () => {
    mockRequired.add('orderItem.unitPrice').add('orderItem.largura').add('orderItem.encolhimento')
    const validate = useOrderValidation(messages)
    const result = validate({
      cart: [
        item({ productId: 'a', unitPrice: 0, largura: undefined, encolhimento: '' }),
        item({ productId: 'b', unitPrice: 5, largura: 1.5, encolhimento: 'x' }),
      ],
      transportadora, condPag, mennota: '', notes: '',
    })
    expect(result.ok).toBe(false)
    expect(Object.keys(result.errors.items)).toEqual(['a'])
    expect(result.errors.items.a).toEqual({
      unitPrice:    expect.any(String),
      largura:      expect.any(String),
      encolhimento: expect.any(String),
    })
    // espessura/tara/descricao não são obrigatórios → sem erro mesmo vazios
    expect(result.errors.items.a.espessura).toBeUndefined()
  })

  it('não altera o objeto EMPTY_ORDER_FORM_ERRORS', () => {
    expect(Object.isFrozen(EMPTY_ORDER_FORM_ERRORS)).toBe(true)
    expect(hasOrderFormErrors(EMPTY_ORDER_FORM_ERRORS)).toBe(false)
  })
})

describe('changedItemFields', () => {
  it('lista apenas os campos validáveis que mudaram', () => {
    const before = item({ unitPrice: 10, largura: 2 })
    const after  = item({ unitPrice: 12, largura: 2, quantity: 3 })
    expect(changedItemFields(before, after)).toEqual(['unitPrice'])
  })

  it('retorna vazio quando nada validável mudou (ex.: blur sem edição)', () => {
    const before = item()
    expect(changedItemFields(before, { ...before })).toEqual([])
  })
})
