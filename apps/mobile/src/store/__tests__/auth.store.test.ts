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

  it('sem clearAuth no meio, o fetchMe aplica normalmente', async () => {
    mockGet.mockResolvedValue({ data: USER })

    await useAuthStore.getState().fetchMe('token')

    expect(useAuthStore.getState().user?.name).toBe('Gustavo Costa')
    expect(useAuthStore.getState().user?.company?.intelligenceEnabled).toBe(true)
  })
})
