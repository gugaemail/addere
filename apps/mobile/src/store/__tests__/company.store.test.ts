// O dicionário de campos por empresa (Field Visibility Config) só chegava ao
// aparelho no login: o boot hidratava do SecureStore e nunca perguntava ao
// servidor. Resultado em campo — o admin ocultava Largura/Tara no painel e o
// vendedor continuava vendo os campos no Novo pedido até deslogar e logar.
import * as SecureStore from 'expo-secure-store'
import { useCompanyStore } from '../company.store'

const mockGet = jest.fn()
jest.mock('../../lib/api', () => ({ api: { get: (...a: unknown[]) => mockGet(...a) } }))
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}))

const CONFIG = { hidden: ['orderItem.largura', 'orderItem.tara'], required: [] }
const SCHEDULE = { products: { enabled: false }, customers: { enabled: false } }

beforeEach(() => {
  jest.clearAllMocks()
  useCompanyStore.setState({ fieldConfig: null, syncSchedule: null })
})

describe('refreshFromServer', () => {
  it('traz o config novo do servidor e persiste', async () => {
    mockGet.mockImplementation(async (url: string) =>
      url.includes('field-config') ? { data: CONFIG } : { data: SCHEDULE }
    )

    await useCompanyStore.getState().refreshFromServer()

    expect(mockGet).toHaveBeenCalledWith('/companies/me/field-config')
    expect(useCompanyStore.getState().fieldConfig).toEqual(CONFIG)
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'addere_field_config',
      JSON.stringify(CONFIG)
    )
  })

  it('campo ocultado no painel passa a valer sem novo login', async () => {
    // Estado do aparelho hoje: config antigo, sem nada oculto
    useCompanyStore.setState({ fieldConfig: { hidden: [], required: [] } })
    mockGet.mockImplementation(async (url: string) =>
      url.includes('field-config') ? { data: CONFIG } : { data: SCHEDULE }
    )

    await useCompanyStore.getState().refreshFromServer()

    expect(useCompanyStore.getState().fieldConfig?.hidden).toContain('orderItem.largura')
  })

  it('offline mantém o config hidratado — sem config o app mostraria tudo', async () => {
    useCompanyStore.setState({ fieldConfig: CONFIG })
    mockGet.mockRejectedValue(new Error('Network Error'))

    await useCompanyStore.getState().refreshFromServer()

    expect(useCompanyStore.getState().fieldConfig).toEqual(CONFIG)
  })

  it('falha no field-config não impede o sync-schedule', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url.includes('field-config')) throw new Error('500')
      return { data: SCHEDULE }
    })

    await useCompanyStore.getState().refreshFromServer()

    expect(useCompanyStore.getState().syncSchedule).toEqual(SCHEDULE)
  })
})
