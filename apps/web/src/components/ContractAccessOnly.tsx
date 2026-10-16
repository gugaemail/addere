'use client'

// Guard de /contrato (plano 014), no molde do SuperAdminOnly: o ADMIN da
// empresa lê e aceita; o SUPERADMIN vê o aviso de que os contratos ficam na
// ficha do cliente e imprime qualquer documento. Vendedor e gerente vão para
// /inteligencia — a API responderia 403 a /billing/me de qualquer forma.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'

export function ContractAccessOnly({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, isLoading, isAdmin, isSuperAdmin } = useAuth()
  const allowed = isAdmin || isSuperAdmin

  useEffect(() => {
    if (!isLoading && user && !allowed) router.replace('/inteligencia')
  }, [isLoading, user, allowed, router])

  if (isLoading || !allowed) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner size="lg" />
      </div>
    )
  }
  return <>{children}</>
}
