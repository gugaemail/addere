'use client'

// Guard de telas exclusivas do SUPERADMIN (E9). Antes o login barrava todo
// não-SUPERADMIN; agora ADMIN/gerente entram no painel, então estas telas
// precisam de gate próprio — sem ele, navegar direto pela URL renderizava o
// shell e disparava fetches que a API responde com 403.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'

export function SuperAdminOnly({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, isLoading, isSuperAdmin } = useAuth()

  useEffect(() => {
    if (!isLoading && user && !isSuperAdmin) router.replace('/inteligencia')
  }, [isLoading, user, isSuperAdmin, router])

  // user null é tratado pelo gate do (admin)/layout — aqui só evita o flash
  if (isLoading || !isSuperAdmin) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner size="lg" />
      </div>
    )
  }
  return <>{children}</>
}
