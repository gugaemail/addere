'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

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
      <p className="text-sm text-red-600">
        Link inválido. Solicite um novo link de recuperação no app Addere.
      </p>
    )
  }

  if (status === 'success') {
    return (
      <div className="text-center">
        <div className="mb-4 text-4xl">✓</div>
        <h2 className="text-xl font-semibold text-[#0D2045] mb-2">Senha alterada!</h2>
        <p className="text-sm text-[#64748B]">
          Abra o app Addere e entre com sua nova senha.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="block text-sm font-medium text-[#0D2045] mb-1">Nova senha</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          placeholder="Mínimo 8 caracteres"
          className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4FA8]"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#0D2045] mb-1">Confirmar nova senha</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          placeholder="Repita a nova senha"
          className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4FA8]"
        />
      </div>
      {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full bg-[#1B4FA8] text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
      >
        {status === 'loading' ? 'Salvando...' : 'Redefinir senha'}
      </button>
    </form>
  )
}

export default function ResetarSenhaPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-[#0D2045]">Redefinir senha</h1>
          <p className="text-sm text-[#64748B] mt-1">Addere ERP Mobile</p>
        </div>
        <Suspense>
          <ResetarSenhaForm />
        </Suspense>
      </div>
    </div>
  )
}
