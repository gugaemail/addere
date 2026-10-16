'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Tabs } from '@/components/ui/Tabs'
import { AdminLicenseRequests } from '@/components/billing/AdminLicenseRequests'
import { useLicenseRequests } from '@/hooks/useBilling'
import { getApiErrorMessage } from '@/lib/api'

// Solicitações de licenças (plano 015) — Gestão Addere, só o SUPERADMIN (o
// layout /gestao põe o SuperAdminOnly). Os pedidos do administrador indicado
// de cada cliente, com Aprovar e Recusar nas linhas pendentes.

type Tab = 'pending' | 'all'

export default function SolicitacoesPage() {
  const [tab, setTab] = useState<Tab>('pending')
  const pending = useLicenseRequests({ status: 'PENDING' })
  const all = useLicenseRequests()
  const current = tab === 'pending' ? pending : all

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Solicitações de licenças
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Pedidos de licenças adicionais dos administradores indicados. Aprovado, o limite sobe na
          hora e a cobrança começa na competência seguinte.
        </p>
      </div>

      <Tabs
        tabs={[
          {
            key: 'pending',
            label: pending.data ? `Pendentes (${pending.data.length})` : 'Pendentes',
          },
          { key: 'all', label: 'Todas' },
        ]}
        active={tab}
        onChange={(key) => setTab(key as Tab)}
      />

      {current.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : current.error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <p className="font-semibold text-danger">Erro ao carregar as solicitações</p>
          <p className="text-sm text-[var(--text-muted)]">
            {getApiErrorMessage(current.error, 'Erro ao carregar as solicitações')}
          </p>
          <Button onClick={() => void current.refetch()}>Tentar novamente</Button>
        </div>
      ) : (
        <AdminLicenseRequests
          requests={current.data ?? []}
          emptyMessage={
            tab === 'pending' ? 'Nenhum pedido aguardando decisão.' : 'Nenhum pedido de licenças.'
          }
        />
      )}
    </div>
  )
}
