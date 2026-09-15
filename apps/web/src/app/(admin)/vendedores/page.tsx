'use client'

// Vendedores (E22): a ficha de campo de quem tem código Protheus — visitas
// por dia, veículo, cidades e gerente — num lugar só, editada pelo mesmo
// modal de /users. Sem gerente o vendedor não aparece na equipe certa; sem
// visitas por dia vale o padrão da empresa (premissa visits_per_day).
import { useMemo, useState } from 'react'
import { AlertTriangle, Pencil } from 'lucide-react'
import type { UserPublic } from '@addere/types'
import { useAuth } from '@/contexts/AuthContext'
import { useCompanyContext } from '@/contexts/CompanyContext'
import { useCompanies } from '@/hooks/useCompanies'
import { useUsers } from '@/hooks/useUsers'
import { needsActiveCompany } from '@/lib/intel-helpers'
import { managerOptions } from '@/lib/user-scope'
import {
  managerCell,
  vehicleLabel,
  vendorSetupWarnings,
  vendorWarningText,
  vendorsOfCompany,
} from '@/lib/vendors'
import { SelectCompanyNotice } from '@/components/intel/SelectCompanyNotice'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { TableEmptyState } from '@/components/ui/DataTable'
import { Spinner } from '@/components/ui/Spinner'
import { Table, type Column } from '@/components/ui/Table'
import { UserFormModal } from '@/components/users/UserFormModal'

export default function VendedoresPage() {
  const { isAdmin, isSuperAdmin } = useAuth()
  const { companyId } = useCompanyContext()
  const { data: users, isLoading, refetch } = useUsers()
  // Só o SUPERADMIN carrega (o hook desliga para os demais); serve ao aviso
  // de vínculo do modal, que aqui nunca aparece — vendedor da lista tem empresa
  const { data: companies } = useCompanies()
  const [editing, setEditing] = useState<UserPublic | null>(null)

  const allUsers = useMemo(() => users ?? [], [users])
  const vendors = useMemo(() => vendorsOfCompany(allUsers, companyId), [allUsers, companyId])
  const warningText = vendorWarningText(vendorSetupWarnings(vendors))

  // Gerente é sempre da mesma empresa do editado (D3b)
  const formCompanyId = editing?.companyId || companyId
  const managers = useMemo(
    () => managerOptions(allUsers, formCompanyId),
    [allUsers, formCompanyId]
  )

  if (!isAdmin && !isSuperAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[var(--text-muted)]">Acesso restrito a administradores.</p>
      </div>
    )
  }

  if (needsActiveCompany(isSuperAdmin, companyId)) return <SelectCompanyNotice />

  const columns: Column<UserPublic>[] = [
    {
      key: 'name',
      header: 'Nome',
      render: (u) => (
        <span className="font-medium text-[var(--text-primary)]">
          {u.name}
          {!u.active && (
            <Badge variant="danger" className="ml-2 align-middle">
              Inativo
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: 'code',
      header: 'Código',
      render: (u) => <span className="font-mono text-xs">{u.idVendProt}</span>,
    },
    {
      key: 'visits',
      header: 'Visitas/dia',
      className: 'text-right tabular-nums',
      render: (u) =>
        u.visitsPerDay ? (
          String(u.visitsPerDay)
        ) : (
          <span className="text-warning" title="Vale o padrão da empresa (Premissas)">
            padrão
          </span>
        ),
    },
    { key: 'vehicle', header: 'Veículo', render: (u) => vehicleLabel(u.vehicle) },
    {
      key: 'cities',
      header: 'Cidades',
      render: (u) => (u.servedCities ?? []).join(', ') || '—',
    },
    {
      key: 'manager',
      header: 'Gerente',
      render: (u) => {
        const cell = managerCell(allUsers, u)
        if (cell.kind === 'missing') return <span className="text-warning">{cell.text}</span>
        if (cell.kind === 'is-manager') {
          return <span className="text-[var(--text-muted)]">{cell.text}</span>
        }
        return cell.text
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (u) => (
        <Button size="sm" variant="secondary" leftIcon={Pencil} onClick={() => setEditing(u)}>
          Editar
        </Button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Vendedores"
        subtitle="Ficha de campo de quem tem código Protheus: visitas por dia, veículo, cidades e gerente"
      />

      {warningText && (
        <Card className="mb-4 flex items-center gap-3 border-warning/30 bg-warning/5">
          <AlertTriangle size={16} strokeWidth={1.5} className="shrink-0 text-warning" aria-hidden />
          <p className="text-sm text-[var(--text-secondary)]">{warningText}</p>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : vendors.length === 0 ? (
        <TableEmptyState
          title="Nenhum vendedor com código Protheus"
          description="Cadastre o código do vendedor em Usuários para ele entrar no plano do dia e aparecer aqui."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
          <Table columns={columns} data={vendors} rowKey={(u) => u.id} className="rounded-none" />
        </div>
      )}

      {editing && (
        <UserFormModal
          mode="edit"
          user={editing}
          companyId={editing.companyId ?? companyId}
          companyName={companies?.find((c) => c.id === formCompanyId)?.name ?? null}
          managers={managers}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refetch()
          }}
        />
      )}
    </div>
  )
}
