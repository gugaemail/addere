'use client'

export const dynamic = 'force-dynamic'

// Tela única de cadastro de usuários. Absorveu a aba Usuários de Empresas, que
// tinha busca, ordenação, paginação, edição e cópia — a tela nova só listava.
import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { UserPublic } from '@addere/types'
import { useUsers, useToggleUser } from '@/hooks/useUsers'
import { useCompanies } from '@/hooks/useCompanies'
import { useAuth } from '@/contexts/AuthContext'
import { useCompanyContext } from '@/contexts/CompanyContext'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Table, type Column } from '@/components/ui/Table'
import { Spinner } from '@/components/ui/Spinner'
import {
  NoResultsState,
  Pagination,
  SearchInput,
  SortHeader,
  TableEmptyState,
} from '@/components/ui/DataTable'
import { applyTable, toggleSort, type SortConfig } from '@/lib/table'
import { profileLabel } from '@/lib/user-profile'
import { isCompanyless, managerOptions, scopeUsersToCompany } from '@/lib/user-scope'
import { PermissionsModal } from '@/components/users/PermissionsModal'
import { UserFormModal, type UserFormMode } from '@/components/users/UserFormModal'
import { formatDate } from '@/lib/utils'

type FormState = { mode: UserFormMode; user?: UserPublic } | null

export default function UsersPage() {
  const { isAdmin, isSuperAdmin } = useAuth()
  const { companyId } = useCompanyContext()
  const { data: users, isLoading, refetch } = useUsers()
  // Já em cache: a sidebar carrega a mesma lista para o seletor de empresa
  const { data: companies } = useCompanies()
  const toggleUser = useToggleUser()

  const [form, setForm] = useState<FormState>(null)
  const [permissionsUser, setPermissionsUser] = useState<UserPublic | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortConfig>(null)

  // O SUPERADMIN vê todas as empresas; a seleção da sidebar recorta a lista
  // para a mesma empresa em que o botão "Novo usuário" vai criar — mas o
  // recorte carrega junto os usuários sem empresa (ver lib/user-scope).
  const scoped = useMemo(() => scopeUsersToCompany(users ?? [], companyId), [users, companyId])

  // Gerente é sempre da mesma empresa do editado (D3b) — que na criação é a
  // ativa e, ao vincular um órfão, também.
  const formCompanyId = form?.user?.companyId || companyId
  const managers = useMemo(() => managerOptions(users ?? [], formCompanyId), [users, formCompanyId])

  const q = search.toLowerCase()
  const table = applyTable(
    scoped,
    (u) =>
      !q ||
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.idVendProt ?? '').toLowerCase().includes(q),
    sort,
    (u, col) =>
      col === 'name'
        ? u.name
        : col === 'email'
          ? u.email
          : col === 'company'
            ? (u.companyName ?? '')
            : profileLabel(u),
    page
  )

  if (!isAdmin && !isSuperAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[var(--text-muted)]">Acesso restrito a administradores.</p>
      </div>
    )
  }

  const onSort = (col: string) => {
    setSort(toggleSort(sort, col))
    setPage(1)
  }

  const columns: Column<UserPublic>[] = [
    {
      key: 'name',
      header: <SortHeader label="Nome" col="name" sort={sort} onSort={onSort} />,
      render: (u) => (
        <span className="font-medium text-[var(--text-primary)]">
          {u.name}
          {isCompanyless(u) && (
            <Badge variant="warning" className="ml-2 whitespace-nowrap align-middle">
              sem empresa
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: 'email',
      header: <SortHeader label="E-mail" col="email" sort={sort} onSort={onSort} />,
      render: (u) => u.email,
    },
    {
      key: 'profile',
      header: <SortHeader label="Perfil" col="profile" sort={sort} onSort={onSort} />,
      render: (u) => <span className="text-[var(--text-muted)]">{profileLabel(u)}</span>,
    },
    // Sem a empresa, o SUPERADMIN não sabe de quem é cada linha
    ...(isSuperAdmin && !companyId
      ? [
          {
            key: 'company',
            header: <SortHeader label="Empresa" col="company" sort={sort} onSort={onSort} />,
            render: (u: UserPublic) => (
              <span className={u.companyName ? '' : 'text-warning'}>
                {u.companyName ?? 'sem empresa'}
              </span>
            ),
          } as Column<UserPublic>,
        ]
      : []),
    {
      key: 'idVendProt',
      header: 'Cód. vendedor',
      render: (u) => <span className="text-[var(--text-muted)]">{u.idVendProt ?? '—'}</span>,
    },
    {
      key: 'active',
      header: 'Status',
      render: (u) => (
        <Badge variant={u.active ? 'success' : 'danger'}>{u.active ? 'Ativo' : 'Inativo'}</Badge>
      ),
    },
    { key: 'createdAt', header: 'Criado em', render: (u) => formatDate(u.createdAt) },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (u) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => setForm({ mode: 'edit', user: u })}>
            Editar
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setForm({ mode: 'copy', user: u })}>
            Copiar
          </Button>
          {isSuperAdmin && u.role !== 'SUPERADMIN' && (
            <Button size="sm" variant="secondary" onClick={() => setPermissionsUser(u)}>
              Permissões
            </Button>
          )}
          <Button
            size="sm"
            variant={u.active ? 'danger' : 'secondary'}
            loading={toggleUser.isPending}
            onClick={() => toggleUser.mutate(u.id)}
          >
            {u.active ? 'Desativar' : 'Ativar'}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Usuários"
        subtitle="Vendedores, gerentes e administradores"
        action={
          <Button onClick={() => setForm({ mode: 'create' })} leftIcon={Plus}>
            Novo usuário
          </Button>
        }
      />

      <div className="mb-3">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v)
            setPage(1)
          }}
          placeholder="Pesquisar por nome, e-mail ou código…"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : scoped.length === 0 ? (
        <TableEmptyState
          title="Nenhum usuário"
          description="Cadastre o primeiro usuário desta empresa."
        />
      ) : table.total === 0 ? (
        <NoResultsState />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
          <Table
            columns={columns}
            data={table.rows}
            rowKey={(u) => u.id}
            className="rounded-none"
          />
          <Pagination page={page} total={table.total} pages={table.pages} onPage={setPage} />
        </div>
      )}

      {form && (
        <UserFormModal
          mode={form.mode}
          user={form.user}
          companyId={form.user?.companyId ?? companyId}
          companyName={companies?.find((c) => c.id === formCompanyId)?.name ?? null}
          managers={managers}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            refetch()
          }}
        />
      )}

      {isSuperAdmin && (
        <PermissionsModal
          isOpen={!!permissionsUser}
          onClose={() => setPermissionsUser(null)}
          user={permissionsUser}
        />
      )}
    </div>
  )
}
