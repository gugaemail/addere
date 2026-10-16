'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { MyInvoicesSection } from '@/components/billing/MyInvoicesSection'
import { useAuth } from '@/contexts/AuthContext'

// Plano e cobrança do ADMIN da empresa. O plano 016 cria a página só com as
// faturas; o 015 acrescenta, acima delas, o plano, o medidor de licenças e os
// pedidos de licenças. Quem mergear por último junta as duas partes.
export default function PlanoPage() {
  const { isSuperAdmin } = useAuth()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
        Plano e cobrança
      </h1>

      {isSuperAdmin ? (
        // A API responde 403 ao SUPERADMIN em /billing/me/*: as faturas de cada
        // cliente ficam na Gestão Addere
        <Card className="p-4 text-sm text-[var(--text-secondary)] sm:p-6">
          As faturas de cada cliente ficam em{' '}
          <Link href="/gestao/faturas" className="font-medium text-brand hover:underline">
            Gestão Addere › Faturas
          </Link>
          .
        </Card>
      ) : (
        <MyInvoicesSection />
      )}
    </div>
  )
}
