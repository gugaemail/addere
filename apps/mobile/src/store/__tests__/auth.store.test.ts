// Corrida entre a hidratação do boot e o guard de biometria: as duas rodam em
// paralelo e, sem a época de sessão, uma resposta que já estava no ar
// ressuscitava a sessão pela metade — token restaurado, usuário nulo. O app
// então caía no dashboard legado com "Olá," sem nome, em vez de ir para o login.
import * as SecureStore from 'expo-secure-store'
import { useAuthStore } from '../auth.store'

const mockGet = jest.fn()
const mockPost = jest.fn()
// auth.store mantém o dono da fila offline (syncStore → AsyncStorage nativo)
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) },
}))
jest.mock('../../config/env', () => ({ env: { apiUrl: 'http://api.test' } }))
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}))
jest.mock('../../services/sentryContext', () => ({
  setSentryUser: jest.fn(),
  clearSentryUser: jest.fn(),
}))

const USER = {
  id: 'u1',
  name: 'Gustavo Costa',
  email: 'vendedor@addere.test',
  role: 'SALESPERSON',
  company: { intelligenceEnabled: true, defaultTone: 'informal' },
}

beforeEach(() => {
  jest.clearAllMocks()
  useAuthStore.setState({ user: null, accessToken: null, permissions: [], hydrated: false })
})

describe('época de sessão', () => {
  it('fetchMe que chega depois do clearAuth não ressuscita o usuário', async () => {
    let resolveMe: (v: unknown) => void = () => {}
    mockGet.mockReturnValue(
      new Promise((resolve) => {
        resolveMe = resolve
      })
    )

    const pending = useAuthStore.getState().fetchMe('token-antigo')
    await useAuthStore.getState().clearAuth()
    resolveMe({ data: USER })
    await pending

    expect(useAuthStore.getState().user).toBeNull()
    expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith('addere_user', expect.any(String))
  })

  it('refreshSession que chega depois do clearAuth não restaura o token', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue('refresh-antigo')
    let resolveRefresh: (v: unknown) => void = () => {}
    mockPost.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve
      })
    )

    const pending = useAuthStore.getState().refreshSession()
    await useAuthStore.getState().clearAuth()
    resolveRefresh({ data: { accessToken: 'novo', refreshToken: 'novo-r' } })
    await pending

    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('refreshSession que chega depois do clearAuth também não regrava o keychain', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue('refresh-antigo')
    let resolveRefresh: (v: unknown) => void = () => {}
    mockPost.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve
      })
    )

    const pending = useAuthStore.getState().refreshSession()
    await useAuthStore.getState().clearAuth()
    resolveRefresh({ data: { accessToken: 'novo', refreshToken: 'novo-r' } })
    await pending

    // O clearAuth apaga token e usuário; regravar só o token aqui deixava o
    // access token órfão no keychain para o boot seguinte encontrar.
    expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith(
      'addere_access_token',
      expect.anything()
    )
  })

  it('sem clearAuth no meio, o fetchMe aplica normalmente', async () => {
    mockGet.mockResolvedValue({ data: USER })

    await useAuthStore.getState().fetchMe('token')

    expect(useAuthStore.getState().user?.name).toBe('Gustavo Costa')
    expect(useAuthStore.getState().user?.company?.intelligenceEnabled).toBe(true)
  })
})

describe('hydrate', () => {
  const keychain = (values: Record<string, string | null>) =>
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(
      async (key: string) => values[key] ?? null
    )

  it('token órfão no keychain, sem usuário e sem /auth/me, encerra a sessão', async () => {
    keychain({ addere_access_token: 'token-orfao', addere_refresh_token: 'refresh-x' })
    mockPost.mockResolvedValue({ data: { accessToken: 'novo', refreshToken: 'novo-r' } })
    // Instância fria/offline: nem permissões nem /auth/me respondem
    mockGet.mockRejectedValue(new Error('timeout'))

    await useAuthStore.getState().hydrate()

    const state = useAuthStore.getState()
    expect(state.accessToken).toBeNull()
    expect(state.user).toBeNull()
    expect(state.hydrated).toBe(true)
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('addere_access_token')
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('addere_refresh_token')
  })

  it('token órfão volta a valer quando o /auth/me repõe o usuário', async () => {
    keychain({ addere_access_token: 'token-orfao', addere_refresh_token: 'refresh-x' })
    mockPost.mockResolvedValue({ data: { accessToken: 'novo', refreshToken: 'novo-r' } })
    mockGet.mockImplementation(async (url: string) =>
      url.endsWith('/permissions') ? { data: { keys: ['orders.view'] } } : { data: USER }
    )

    await useAuthStore.getState().hydrate()

    expect(useAuthStore.getState().user?.name).toBe('Gustavo Costa')
    expect(useAuthStore.getState().accessToken).toBe('novo')
  })

  it('sessão íntegra no keychain hidrata normalmente', async () => {
    keychain({
      addere_access_token: 'token-bom',
      addere_user: JSON.stringify(USER),
      addere_refresh_token: 'refresh-x',
    })
    mockPost.mockResolvedValue({ data: { accessToken: 'novo', refreshToken: 'novo-r' } })
    mockGet.mockImplementation(async (url: string) =>
      url.endsWith('/permissions') ? { data: { keys: ['orders.view'] } } : { data: USER }
    )

    await useAuthStore.getState().hydrate()

    const state = useAuthStore.getState()
    expect(state.user?.name).toBe('Gustavo Costa')
    expect(state.accessToken).toBe('novo')
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalledWith('addere_access_token')
  })
})

// Sem internet no boot, o vendedor ficava com os campos do pedido que dependem
// de permissão (transportadora, condição de pagamento) travados: as permissões
// só existiam em memória e começavam vazias.
describe('permissões guardadas no aparelho', () => {
  const keychain = (values: Record<string, string | null>) =>
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(
      async (key: string) => values[key] ?? null
    )
  const offline = () => {
    const semRede = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })
    mockPost.mockRejectedValue(semRede)
    mockGet.mockRejectedValue(semRede)
  }

  it('sem internet no boot, as da última sessão continuam valendo', async () => {
    keychain({
      addere_access_token: 'token-bom',
      addere_user: JSON.stringify(USER),
      addere_permissions: JSON.stringify(['orders.change_carrier']),
    })
    offline()

    await useAuthStore.getState().hydrate()

    const state = useAuthStore.getState()
    expect(state.accessToken).toBe('token-bom')
    expect(state.permissions).toEqual(['orders.change_carrier'])
  })

  it('com internet, as do servidor substituem as guardadas e são gravadas', async () => {
    keychain({
      addere_access_token: 'token-bom',
      addere_user: JSON.stringify(USER),
      addere_refresh_token: 'refresh-x',
      addere_permissions: JSON.stringify(['orders.change_carrier']),
    })
    mockPost.mockResolvedValue({ data: { accessToken: 'novo', refreshToken: 'novo-r' } })
    mockGet.mockImplementation(async (url: string) =>
      url.endsWith('/permissions')
        ? { data: { keys: ['orders.change_payment_terms'] } }
        : { data: USER }
    )

    await useAuthStore.getState().hydrate()

    expect(useAuthStore.getState().permissions).toEqual(['orders.change_payment_terms'])
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'addere_permissions',
      JSON.stringify(['orders.change_payment_terms'])
    )
  })

  it('guardado corrompido não derruba o boot', async () => {
    keychain({
      addere_access_token: 'token-bom',
      addere_user: JSON.stringify(USER),
      addere_permissions: '{não é json',
    })
    offline()

    await useAuthStore.getState().hydrate()

    expect(useAuthStore.getState().permissions).toEqual([])
    expect(useAuthStore.getState().accessToken).toBe('token-bom')
  })

  it('sem sessão no aparelho, as guardadas não são lidas', async () => {
    keychain({ addere_permissions: JSON.stringify(['orders.change_carrier']) })

    await useAuthStore.getState().hydrate()

    expect(useAuthStore.getState().permissions).toEqual([])
  })

  it('o logout apaga as guardadas', async () => {
    useAuthStore.setState({ permissions: ['orders.change_carrier'] })

    await useAuthStore.getState().clearAuth()

    expect(useAuthStore.getState().permissions).toEqual([])
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('addere_permissions')
  })
})

// Plano 017: empresa suspensa. O /auth/me traz company.access; um 403
// COMPANY_BLOCKED de qualquer chamada liga o estado; nada disso é logout.
describe('empresa suspensa (companyBlocked)', () => {
  const keychain = (values: Record<string, string | null>) =>
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(
      async (key: string) => values[key] ?? null
    )
  const blockedUser = {
    ...USER,
    company: { ...USER.company, access: { blocked: true, reason: 'OVERDUE' } },
  }
  const freeUser = {
    ...USER,
    company: { ...USER.company, access: { blocked: false, reason: null } },
  }

  beforeEach(() => {
    useAuthStore.setState({ companyBlocked: false })
  })

  it('nasce desligado', () => {
    expect(useAuthStore.getState().companyBlocked).toBe(false)
  })

  it('markCompanyBlocked liga, com sessão; sem sessão, ignora', () => {
    useAuthStore.getState().markCompanyBlocked()
    expect(useAuthStore.getState().companyBlocked).toBe(false)

    useAuthStore.setState({ user: USER as never, accessToken: 'token' })
    useAuthStore.getState().markCompanyBlocked()
    expect(useAuthStore.getState().companyBlocked).toBe(true)
    // Continua logado
    expect(useAuthStore.getState().accessToken).toBe('token')
  })

  it('fetchMe com access.blocked true liga; com false desliga', async () => {
    mockGet.mockResolvedValueOnce({ data: blockedUser })
    await useAuthStore.getState().fetchMe('token')
    expect(useAuthStore.getState().companyBlocked).toBe(true)

    mockGet.mockResolvedValueOnce({ data: freeUser })
    await useAuthStore.getState().fetchMe('token')
    expect(useAuthStore.getState().companyBlocked).toBe(false)
  })

  it('/auth/me antigo, sem o campo access, não bloqueia', async () => {
    mockGet.mockResolvedValueOnce({ data: USER })
    await useAuthStore.getState().fetchMe('token')
    expect(useAuthStore.getState().companyBlocked).toBe(false)
  })

  it('clearAuth desliga', async () => {
    useAuthStore.setState({ user: USER as never, accessToken: 'token', companyBlocked: true })
    await useAuthStore.getState().clearAuth()
    expect(useAuthStore.getState().companyBlocked).toBe(false)
  })

  it('hydrate com o usuário salvo bloqueado liga, mesmo sem internet', async () => {
    keychain({
      addere_access_token: 'token-bom',
      addere_user: JSON.stringify(blockedUser),
      addere_permissions: JSON.stringify(['orders.change_carrier']),
    })
    const semRede = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })
    mockPost.mockRejectedValue(semRede)
    mockGet.mockRejectedValue(semRede)

    await useAuthStore.getState().hydrate()

    const state = useAuthStore.getState()
    expect(state.companyBlocked).toBe(true)
    expect(state.accessToken).toBe('token-bom')
    // As permissões offline do #244 continuam valendo
    expect(state.permissions).toEqual(['orders.change_carrier'])
  })

  it('recheckCompanyAccess: renova o token, relê o /auth/me e devolve o estado', async () => {
    useAuthStore.setState({
      user: blockedUser as never,
      accessToken: 'velho',
      companyBlocked: true,
    })
    keychain({ addere_refresh_token: 'refresh-x' })
    mockPost.mockResolvedValue({ data: { accessToken: 'novo', refreshToken: 'novo-r' } })
    mockGet.mockResolvedValueOnce({ data: freeUser })

    await expect(useAuthStore.getState().recheckCompanyAccess()).resolves.toBe(false)
    expect(useAuthStore.getState().companyBlocked).toBe(false)
    expect(mockGet).toHaveBeenCalledWith('http://api.test/auth/me', {
      headers: { Authorization: 'Bearer novo' },
      timeout: 8000,
    })
  })

  it('recheckCompanyAccess sem refresh segue com o token atual; ainda bloqueada → true', async () => {
    useAuthStore.setState({
      user: blockedUser as never,
      accessToken: 'atual',
      companyBlocked: true,
    })
    mockPost.mockRejectedValue(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }))
    mockGet.mockResolvedValueOnce({ data: blockedUser })

    await expect(useAuthStore.getState().recheckCompanyAccess()).resolves.toBe(true)
    expect(mockGet.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer atual' } })
    // Não desloga
    expect(useAuthStore.getState().user).not.toBeNull()
  })
})
