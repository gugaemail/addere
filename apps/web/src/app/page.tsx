'use client'

// Home raiz (E9): decide o destino pelo papel — SUPERADMIN → /dashboard
// (Empresas); demais → /inteligencia. O middleware manda sessões ativas
// para cá; sem sessão restaurável, volta ao login.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import { resolveHome } from '@/lib/home-redirect'

export default function Home() {
  const router = useRouter()
  const { user, isLoading } = useAuth()

  useEffect(() => {
    if (isLoading) return
    router.replace(user ? resolveHome(user) : '/login')
  }, [isLoading, user, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-page)]">
      <Spinner size="lg" />
    </div>
  )
}
