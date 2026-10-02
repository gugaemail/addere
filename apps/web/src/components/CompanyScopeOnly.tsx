'use client'

// Guard de /empresas/[id] (E23): SUPERADMIN abre qualquer empresa, ADMIN só a
// dele — cadastro e integração viraram self-service. Vendedor e gerente não
// entram. Sem o gate, navegar pela URL renderizava o shell e disparava fetches
// que a API responde com 403. A regra em si está em lib/company-scope.
import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import { canOpenCompany } from '@/lib/company-scope'

export function CompanyScopeOnly({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const params = useParams<{ id?: string }>()
  const { user, isLoading, isAdmin, isSuperAdmin, companyId } = useAuth()

  const allowed = canOpenCompany({ isSuperAdmin, isAdmin, companyId, targetId: params?.id })

  useEffect(() => {
    if (!isLoading && user && !allowed) router.replace('/inteligencia')
  }, [isLoading, user, allowed, router])

  // user null é tratado pelo gate do (admin)/layout — aqui só evita o flash
  if (isLoading || !allowed) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner size="lg" />
      </div>
    )
  }
  return <>{children}</>
}
