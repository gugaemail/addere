'use client'

// Guard das telas de configuração da Inteligência (Consultas, Premissas): só
// intel.admin. Esconder do menu não basta — link direto montaria a tela e a
// API responderia 403. Mesmo padrão do SuperAdminOnly.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import { canSeeNavItem, INTEL_ADMIN_ONLY } from '@/lib/nav-gating'

export function IntelAdminOnly({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, isLoading, isSuperAdmin, isAdmin, hasPermission } = useAuth()
  const allowed = canSeeNavItem(INTEL_ADMIN_ONLY, { isSuperAdmin, isAdmin, hasPermission })

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
