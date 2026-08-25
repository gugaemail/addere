// Corrida entre a hidratação do boot e o guard de biometria: as duas rodam em
// paralelo e, sem a época de sessão, uma resposta que já estava no ar
// ressuscitava a sessão pela metade — token restaurado, usuário nulo. O app
// então caía no dashboard legado com "Olá," sem nome, em vez de ir para o login.
import * as SecureStore from 'expo-secure-store'
import { useAuthStore } from '../auth.store'

const mockGet = jest.fn()
const mockPost = jest.fn()
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
