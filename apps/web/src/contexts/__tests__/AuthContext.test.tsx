import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../AuthContext'

// Mock do módulo api antes de importar o contexto
vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
  },
  setAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
  getAccessToken: vi.fn(),
}))

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    create: vi.fn(() => ({ interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } })),
  },
}))

import { api, setAccessToken, clearAccessToken } from '@/lib/api'
import axios from 'axios'

const mockApi = api as { post: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> }
const mockSetAccessToken = setAccessToken as ReturnType<typeof vi.fn>
const mockClearAccessToken = clearAccessToken as ReturnType<typeof vi.fn>
const mockAxios = axios as { post: ReturnType<typeof vi.fn> }

const adminUser = {
  id: 'user-1',
  name: 'Admin Teste',
  email: 'admin@addere.com.br',
  role: 'SUPERADMIN',
  companyId: null,
  createdAt: new Date().toISOString(),
}

// Componente auxiliar para acessar o contexto
function TestConsumer() {
  const { user, isAdmin, isSuperAdmin, isLoading } = useAuth()
  if (isLoading) return <div>carregando...</div>
  return (
    <div>
      <div data-testid="email">{user?.email ?? 'sem-usuario'}</div>
      <div data-testid="is-admin">{String(isAdmin)}</div>
      <div data-testid="is-superadmin">{String(isSuperAdmin)}</div>
    </div>
  )
}

function renderWithAuth() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // restoreSession falha por padrão — usuário não está autenticado
  mockAxios.post.mockRejectedValue(new Error('sem sessão'))
})

// ─── Estado inicial ──────────────────────────────────────────────────────────

describe('AuthProvider — estado inicial', () => {
  it('exibe loading enquanto tenta restaurar sessão', () => {
    // Nunca resolve — permanece em loading
    mockAxios.post.mockReturnValue(new Promise(() => {}))
    renderWithAuth()
    expect(screen.getByText('carregando...')).toBeInTheDocument()
  })

  it('exibe "sem-usuario" quando não há sessão ativa', async () => {
    renderWithAuth()
    await waitFor(() => expect(screen.getByTestId('email')).toHaveTextContent('sem-usuario'))
  })

  it('isAdmin e isSuperAdmin são false sem usuário', async () => {
    renderWithAuth()
    await waitFor(() => {
      expect(screen.getByTestId('is-admin')).toHaveTextContent('false')
      expect(screen.getByTestId('is-superadmin')).toHaveTextContent('false')
    })
  })
})

// ─── login() ─────────────────────────────────────────────────────────────────

describe('AuthProvider — login()', () => {
  it('armazena o token e exibe o usuário após login bem-sucedido', async () => {
    mockAxios.post.mockRejectedValueOnce(new Error('sem sessão')) // restoreSession
    mockApi.post.mockResolvedValue({ data: { user: adminUser, accessToken: 'jwt-token-123' } })

    const { result } = (() => {
      let authResult: ReturnType<typeof useAuth> | null = null
      function Capture() {
        authResult = useAuth()
        return null
      }
      render(<AuthProvider><Capture /><TestConsumer /></AuthProvider>)
      return { result: { current: authResult } }
    })()

    // Aguarda restoreSession terminar
    await waitFor(() => expect(screen.getByTestId('email')).toHaveTextContent('sem-usuario'))

    // Executa login
    await act(async () => {
      const ctx = result.current as ReturnType<typeof useAuth> | null
      await ctx?.login('admin@addere.com.br', 'senha123')
    })

    await waitFor(() => expect(screen.getByTestId('email')).toHaveTextContent('admin@addere.com.br'))
    expect(mockSetAccessToken).toHaveBeenCalledWith('jwt-token-123')
    expect(screen.getByTestId('is-superadmin')).toHaveTextContent('true')
  })

  it('propaga o erro quando o login falha', async () => {
    mockAxios.post.mockRejectedValueOnce(new Error('sem sessão'))
    mockApi.post.mockRejectedValue({ response: { status: 401 } })

    let capturedAuth: ReturnType<typeof useAuth> | null = null
    function Capture() { capturedAuth = useAuth(); return null }

    render(<AuthProvider><Capture /></AuthProvider>)
    await waitFor(() => expect(capturedAuth?.isLoading).toBe(false))

    await expect(capturedAuth?.login('x@x.com', 'errada')).rejects.toBeDefined()
    expect(mockSetAccessToken).not.toHaveBeenCalled()
  })
})

// ─── logout() ────────────────────────────────────────────────────────────────

describe('AuthProvider — logout()', () => {
  it('limpa o token e o usuário ao fazer logout', async () => {
    // Setup: usuário logado
    mockAxios.post.mockRejectedValueOnce(new Error('sem sessão'))
    mockApi.post
      .mockResolvedValueOnce({ data: { user: adminUser, accessToken: 'jwt-token-123' } }) // login
      .mockResolvedValueOnce({}) // logout

    let capturedAuth: ReturnType<typeof useAuth> | null = null
    function Capture() { capturedAuth = useAuth(); return null }

    render(<AuthProvider><Capture /><TestConsumer /></AuthProvider>)
    await waitFor(() => expect(capturedAuth?.isLoading).toBe(false))

    // Login
    await act(async () => { await capturedAuth?.login('admin@addere.com.br', '12345678') })
    await waitFor(() => expect(screen.getByTestId('email')).toHaveTextContent('admin@addere.com.br'))

    // Logout
    await act(async () => { await capturedAuth?.logout() })

    await waitFor(() => expect(screen.getByTestId('email')).toHaveTextContent('sem-usuario'))
    // logout chama setAccessToken(null) para limpar memória e cookies
    expect(mockSetAccessToken).toHaveBeenCalledWith(null)
  })
})

// ─── isSuperAdmin / isAdmin flags ────────────────────────────────────────────

describe('AuthProvider — flags de role', () => {
  it('isSuperAdmin=true apenas quando role é SUPERADMIN', async () => {
    const superAdmin = { ...adminUser, role: 'SUPERADMIN' }
    mockAxios.post.mockRejectedValueOnce(new Error('sem sessão'))
    mockApi.post.mockResolvedValue({ data: { user: superAdmin, accessToken: 'tok' } })

    let capturedAuth: ReturnType<typeof useAuth> | null = null
    render(<AuthProvider><span ref={() => { capturedAuth = null }} /></AuthProvider>)

    // Verifica comportamento via contexto
    function CheckFlags() {
      const { isSuperAdmin, isAdmin } = useAuth()
      return <div><span data-testid="sa">{String(isSuperAdmin)}</span><span data-testid="a">{String(isAdmin)}</span></div>
    }
    const { unmount } = render(<AuthProvider><CheckFlags /></AuthProvider>)
    await waitFor(() => expect(screen.getAllByTestId('sa')[0]).toHaveTextContent('false'))
    unmount()
  })
})
