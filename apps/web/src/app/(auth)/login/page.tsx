'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/contexts/AuthContext'
import { loginSchema, type LoginFormData } from '@/lib/schemas'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useState } from 'react'

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [apiError, setApiError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (data: LoginFormData) => {
    try {
      setApiError('')
      await login(data.email, data.password)
      router.replace('/')
    } catch {
      setApiError('Email ou senha inválidos.')
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-white">Addere Admin</h1>
        <p className="mt-2 text-sm text-gray-400">Entre com suas credenciais</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Email"
          type="email"
          placeholder="seu@email.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Senha"
          type="password"
          placeholder="••••••••"
          error={errors.password?.message}
          {...register('password')}
        />

        {apiError && (
          <p className="text-sm text-red-400">{apiError}</p>
        )}

        <Button type="submit" className="w-full" isLoading={isSubmitting}>
          Entrar
        </Button>
      </form>
    </div>
  )
}
