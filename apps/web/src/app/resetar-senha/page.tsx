'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

function ResetarSenhaForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    if (password.length < 8) { setErrorMsg('A senha deve ter pelo menos 8 caracteres.'); return }
    if (password !== confirm) { setErrorMsg('As senhas não coincidem.'); return }

    setStatus('loading')
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErrorMsg((data as { message?: string }).message ?? 'Token inválido ou expirado.')
        setStatus('error')
      } else {
        setStatus('success')
      }
    } catch {
      setErrorMsg('Erro ao conectar com o servidor. Tente novamente.')
      setStatus('error')
    }
  }

  if (!token) {
    return (
      <p className="text-sm text-danger">
        Link inválido. Solicite um novo link de recuperação no app Addere.
      </p>
    )
  }

  if (status === 'success') {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
          <Check size={24} strokeWidth={1.5} aria-hidden />
        </div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Senha alterada!</h2>
        <p className="text-sm text-muted">
          Abra o app Addere e entre com sua nova senha.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="Nova senha"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
        placeholder="Mínimo 8 caracteres"
      />
      <Input
        label="Confirmar nova senha"
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
        placeholder="Repita a nova senha"
      />
      {errorMsg && <p className="text-sm text-danger">{errorMsg}</p>}
      <Button type="submit" loading={status === 'loading'} className="w-full">
        {status === 'loading' ? 'Salvando...' : 'Redefinir senha'}
      </Button>
    </form>
  )
}

export default function ResetarSenhaPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-[var(--bg-surface)] rounded-2xl shadow-sm border border-[var(--border)] p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Redefinir senha</h1>
          <p className="text-sm text-muted mt-1">Addere ERP Mobile</p>
        </div>
        <Suspense>
          <ResetarSenhaForm />
        </Suspense>
      </div>
    </div>
  )
}
