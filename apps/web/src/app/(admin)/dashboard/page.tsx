'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Lock, Pencil, Plus, Unlock } from 'lucide-react'
import { toast } from 'sonner'
import type { CompanyListItem } from '@addere/types'
import { StatCard } from '@/components/ui/StatCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { Table, type Column } from '@/components/ui/Table'
import { getApiErrorMessage } from '@/lib/api'
import { useCompanies, useToggleCompanyActive, useUpdateCompany } from '@/hooks/useCompanies'
import { CreateCompanyModal } from './CreateCompanyModal'

export default function DashboardPage() {
  const router = useRouter()
  const { data: companies = [], isLoading } = useCompanies()
  const toggleActive = useToggleCompanyActive()

  const [showModal, setShowModal] = useState(false)
  const [editingCompany, setEditingCompany] = useState<CompanyListItem | null>(null)

  function handleToggleActive(e: React.MouseEvent, company: CompanyListItem) {
    e.stopPropagation()
    toggleActive.mutate(
      { id: company.id, active: !company.active },
      {
        onError: (err) =>
          toast.error(getApiErrorMessage(err, 'Erro ao alterar status da empresa.')),
      }
    )
  }

  const columns: Column<CompanyListItem>[] = [
    {
      key: 'name',
      header: 'Empresa',
      render: (c) => <span className="font-medium text-[var(--text-primary)]">{c.name}</span>,
    },
    { key: 'cnpj', header: 'CNPJ', render: (c) => c.cnpj },
    {
      key: 'protheus',
      header: 'Protheus',
      render: (c) => <span className="text-[var(--text-muted)]">{c.idProtheus ?? '—'}</span>,
    },
    {
      key: 'branches',
      header: 'Filiais',
      className: 'text-center',
      render: (c) => c._count.branches,
    },
    { key: 'users', header: 'Usuários', className: 'text-center', render: (c) => c._count.users },
    { key: 'orders', header: 'Pedidos', className: 'text-center', render: (c) => c._count.orders },
    {
      key: 'status',
      header: 'Status',
      className: 'text-center',
      render: (c) => <StatusBadge active={c.active} activeLabel="Ativa" inactiveLabel="Inativa" />,
    },
    {
      key: 'actions',
      header: 'Ações',
      className: 'text-center',
      render: (c) => (
        <div
          className="flex items-center justify-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Editar */}
          <Button
            variant="ghost"
            size="icon"
            title="Editar empresa"
            aria-label="Editar empresa"
            leftIcon={Pencil}
            className="text-[var(--text-muted)] hover:text-brand"
            onClick={(e) => {
              e.stopPropagation()
              setEditingCompany(c)
            }}
          />
          {/* Bloquear / Ativar */}
          <Button
            variant="ghost"
            size="icon"
            title={c.active ? 'Bloquear empresa' : 'Ativar empresa'}
            aria-label={c.active ? 'Bloquear empresa' : 'Ativar empresa'}
            leftIcon={c.active ? Lock : Unlock}
            disabled={toggleActive.isPending && toggleActive.variables?.id === c.id}
            className={
              c.active
                ? 'text-[var(--text-muted)] hover:text-danger hover:bg-danger/10'
                : 'text-[var(--text-muted)] hover:text-success hover:bg-success/10'
            }
            onClick={(e) => handleToggleActive(e, c)}
          />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Empresas</h1>
        <Button onClick={() => setShowModal(true)} leftIcon={Plus}>
          Nova empresa
        </Button>
      </div>

      {/* Cards resumo */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Total de empresas" value={companies.length} accent="brand" />
          <StatCard
            label="Ativas"
            value={companies.filter((c) => c.active).length}
            accent="success"
          />
          <StatCard
            label="Inativas"
            value={companies.filter((c) => !c.active).length}
            accent="neutral"
          />
        </div>
      )}

      {/* Tabela */}
      <div className="bg-[var(--bg-surface)] rounded-xl shadow-card border border-[var(--border)] overflow-hidden">
        {isLoading ? (
          <TableSkeleton cols={7} rows={4} />
        ) : companies.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-10 h-10" strokeWidth={1.25} />}
            title="Nenhuma empresa cadastrada"
            description="Cadastre a primeira empresa para começar a gerenciar vendedores e pedidos."
            action={{ label: 'Nova empresa', onClick: () => setShowModal(true) }}
          />
        ) : (
          <Table
            columns={columns}
            data={companies}
            rowKey={(c) => c.id}
            className="rounded-none"
            onRowClick={(c) => router.push(`/empresas/${c.id}`)}
          />
        )}
      </div>

      {showModal && (
        <CreateCompanyModal
          onClose={() => setShowModal(false)}
          onCreated={() => setShowModal(false)}
        />
      )}

      {editingCompany && (
        <EditCompanyModal
          company={editingCompany}
          onClose={() => setEditingCompany(null)}
          onSaved={() => setEditingCompany(null)}
        />
      )}
    </div>
  )
}

// ─── Componentes ──────────────────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] px-5 py-4 space-y-2">
      <div className="h-3 w-24 bg-[var(--bg-subtle)] rounded animate-skeleton-pulse" />
      <div className="h-8 w-12 bg-[var(--bg-subtle)] rounded animate-skeleton-pulse" />
    </div>
  )
}

function TableSkeleton({ cols, rows }: { cols: number; rows: number }) {
  return (
    <div className="w-full">
      <div className="bg-[var(--bg-subtle)] border-b border-[var(--border)] px-4 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div
            key={i}
            className="h-3 bg-[var(--border)] rounded animate-skeleton-pulse"
            style={{ width: `${60 + ((i * 17) % 60)}px` }}
          />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="px-4 py-3.5 flex gap-4 border-b border-[var(--border)] last:border-0"
        >
          {Array.from({ length: cols }).map((_, i) => (
            <div
              key={i}
              className="h-3 bg-[var(--bg-subtle)] rounded animate-skeleton-pulse"
              style={{ width: `${50 + (((r + i) * 23) % 80)}px` }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
      <div className="text-[var(--text-muted)]">{icon}</div>
      <div>
        <p className="font-semibold text-[var(--text-primary)]">{title}</p>
        <p className="text-sm text-[var(--text-muted)] mt-1 max-w-xs mx-auto">{description}</p>
      </div>
      {action && (
        <Button variant="ghost" size="sm" leftIcon={Plus} onClick={action.onClick} className="mt-2">
          {action.label}
        </Button>
      )}
    </div>
  )
}

function EditCompanyModal({
  company,
  onClose,
  onSaved,
}: {
  company: CompanyListItem
  onClose: () => void
  onSaved: () => void
}) {
  const updateCompany = useUpdateCompany()
  const [name, setName] = useState(company.name)
  const [cnpj, setCnpj] = useState(company.cnpj)
  const [idProtheus, setIdProtheus] = useState(company.idProtheus ?? '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateCompany.mutateAsync({
        id: company.id,
        name,
        cnpj,
        idProtheus: idProtheus || null,
      })
      onSaved()
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Erro ao salvar empresa.'))
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Editar Empresa">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Nome" required value={name} onChange={(e) => setName(e.target.value)} />
        <FormField label="CNPJ" required value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
        <FormField
          label="Código Protheus"
          value={idProtheus}
          onChange={(e) => setIdProtheus(e.target.value)}
          placeholder="Opcional"
        />

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button type="submit" loading={updateCompany.isPending} className="flex-1">
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
