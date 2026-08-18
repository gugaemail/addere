'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { StatCard } from '@/components/ui/StatCard'
import { useCompany, useToggleCompany } from '@/hooks/useCompany'
import { getApiErrorMessage } from '@/lib/api'
import { BranchesTab } from './tabs/BranchesTab'
import { UsersTab } from './tabs/UsersTab'
import { CustomersTab } from './tabs/CustomersTab'
import { ProductsTab } from './tabs/ProductsTab'
import { OrdersTab } from './tabs/OrdersTab'
import { ProtheusTab } from './tabs/ProtheusTab'
import { FieldsTab } from './tabs/FieldsTab'
import { LogsTab } from './tabs/LogsTab'

type Tab =
  'filiais' | 'usuarios' | 'clientes' | 'produtos' | 'pedidos' | 'protheus' | 'campos' | 'logs'

function PageSkeleton() {
  return (
    <div className="space-y-6 animate-skeleton-pulse">
      <div className="h-6 w-48 bg-[var(--bg-subtle)] rounded" />
      <div className="h-8 w-64 bg-[var(--bg-subtle)] rounded" />
      <div className="grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl px-5 py-4 space-y-2"
          >
            <div className="h-3 w-16 bg-[var(--bg-subtle)] rounded" />
            <div className="h-7 w-10 bg-[var(--bg-subtle)] rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function EmpresaPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('filiais')

  const { data: company, isLoading, error, refetch } = useCompany(id)
  const toggleCompany = useToggleCompany(id)

  if (isLoading) return <PageSkeleton />

  if (error)
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <p className="font-semibold text-danger">Erro ao carregar empresa</p>
        <p className="text-sm text-[var(--text-muted)]">
          {getApiErrorMessage(error, 'Erro ao carregar empresa')}
        </p>
        <Button onClick={() => refetch()} className="mt-2">
          Tentar novamente
        </Button>
      </div>
    )

  if (!company)
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <p className="font-semibold text-[var(--text-primary)]">Empresa não encontrada</p>
      </div>
    )

  const tabs: { key: Tab; label: string }[] = [
    { key: 'filiais', label: `Filiais (${company.branches.length})` },
    { key: 'usuarios', label: `Usuários (${company.users.length})` },
    { key: 'clientes', label: 'Clientes' },
    { key: 'produtos', label: 'Produtos' },
    { key: 'pedidos', label: 'Pedidos' },
    { key: 'protheus', label: 'Protheus' },
    { key: 'campos', label: 'Campos' },
    { key: 'logs', label: 'Logs API' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={ArrowLeft}
            onClick={() => router.push('/dashboard')}
            className="mb-3 -ml-3 text-[var(--text-muted)] hover:text-brand font-medium"
          >
            Voltar
          </Button>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            {company.name}
          </h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            {company.cnpj}
            {company.idProtheus && <span className="ml-3">Protheus: {company.idProtheus}</span>}
          </p>
        </div>
        <Button
          variant={company.active ? 'danger-outline' : 'success-outline'}
          onClick={() => toggleCompany.mutate(!company.active)}
          loading={toggleCompany.isPending}
        >
          {company.active ? 'Desativar empresa' : 'Ativar empresa'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Filiais" value={company.branches.length} />
        <StatCard label="Usuários" value={company.users.length} />
        <StatCard label="Pedidos" value={company._count.orders} />
        <StatCard label="Status" value={company.active ? 'Ativa' : 'Inativa'} text />
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--border)]">
        <nav className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-brand text-brand'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Conteúdo da aba ativa */}
      {tab === 'filiais' && <BranchesTab company={company} />}
      {tab === 'usuarios' && <UsersTab company={company} />}
      {tab === 'clientes' && <CustomersTab companyId={company.id} />}
      {tab === 'produtos' && <ProductsTab companyId={company.id} />}
      {tab === 'pedidos' && <OrdersTab companyId={company.id} />}
      {tab === 'protheus' && <ProtheusTab company={company} />}
      {tab === 'campos' && <FieldsTab companyId={company.id} />}
      {tab === 'logs' && <LogsTab companyId={company.id} />}
    </div>
  )
}
