'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getApiErrorMessage } from '@/lib/api'
import { loginSchema } from '@/lib/schemas'

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Valida com o loginSchema antes de chamar a API
    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Dados inválidos.')
      return
    }

    setLoading(true)
    try {
      const user = await login(parsed.data.email, parsed.data.password)

      if (user.role !== 'SUPERADMIN') {
        setError('Acesso restrito ao administrador da plataforma.')
        return
      }

      router.push('/dashboard')
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Erro ao conectar. Tente novamente.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-page)]">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl shadow-modal p-8 space-y-6">
          <div className="flex flex-col items-center gap-3">
            <Logo size={40} />
            <div className="text-center space-y-0.5">
              <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Addere</h1>
              <p className="text-sm text-[var(--text-muted)]">Painel Administrativo</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="E-mail"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="superadmin@addere.dev"
            />

            <Input
              label="Senha"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />

            {error && (
              <div className="flex items-start gap-2 text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2.5">
                <AlertCircle size={16} strokeWidth={1.5} className="shrink-0 mt-0.5" aria-hidden />
                {error}
              </div>
            )}

            <Button type="submit" loading={loading} className="w-full shadow-fab">
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
