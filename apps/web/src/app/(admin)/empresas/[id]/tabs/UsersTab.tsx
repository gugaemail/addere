'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { CompanyDetail, UserPublic } from '@addere/types'
import { Table, type Column } from '@/components/ui/Table'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { CreateUserModal } from '@/components/users/CreateUserModal'
import { companiesKeys } from '@/hooks/useCompanies'
import { useToggleCompanyEntity } from '@/hooks/useCompany'
import { UserModal, ActionMenu } from '../EntityModals'
import {
  TabSection, SearchInput, SortHeader, Pagination, TableEmptyState, NoResultsState,
  applyTable, toggleSort, type ModalState, type SortConfig,
} from './shared'

export function UsersTab({ company }: { company: CompanyDetail }) {
  const queryClient = useQueryClient()
  const toggleEntity = useToggleCompanyEntity(company.id)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [modal, setModal] = useState<ModalState<UserPublic>>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortConfig>(null)

  const q = search.toLowerCase()
  const table = applyTable(
    company.users,
    (u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    sort,
    (u, col) => col === 'name' ? u.name : u.email,
    page,
  )

  const onSort = (c: string) => { setSort(toggleSort(sort, c)); setPage(1) }

  const columns: Column<UserPublic>[] = [
    {
      key: 'name',
      header: <SortHeader label="Nome" col="name" sort={sort} onSort={onSort} />,
      render: (u) => <span className="font-medium text-[var(--text-primary)]">{u.name}</span>,
    },
    {
      key: 'email',
      header: <SortHeader label="E-mail" col="email" sort={sort} onSort={onSort} />,
      render: (u) => u.email,
    },
    {
      key: 'role',
      header: 'Perfil',
      render: (u) => <span className="text-[var(--text-muted)]">{u.role === 'ADMIN' ? 'Administrador' : 'Vendedor'}</span>,
    },
    { key: 'status', header: 'Status', render: (u) => <StatusBadge active={u.active} /> },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (u) => (
        <ActionMenu
          label="usuário"
          active={u.active}
          onEdit={() => setModal({ mode: 'edit', item: u })}
          onCopy={() => setModal({ mode: 'copy', item: u })}
          onToggle={() => toggleEntity.mutate({ entity: 'users', entityId: u.id, active: !u.active })}
        />
      ),
    },
  ]

  return (
    <>
      <TabSection
        action={{ label: '+ Novo usuário', onClick: () => setShowCreateModal(true) }}
        search={<SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Pesquisar usuários…" />}
        footer={<Pagination page={page} total={table.total} pages={table.pages} onPage={setPage} />}
      >
        <div className="overflow-auto max-h-[520px]">
          {company.users.length === 0 ? (
            <TableEmptyState title="Nenhum usuário" description="Adicione o primeiro usuário desta empresa." />
          ) : table.total === 0 && search ? (
            <NoResultsState />
          ) : (
            <Table columns={columns} data={table.rows} rowKey={(u) => u.id} className="rounded-none" />
          )}
        </div>
      </TabSection>

      {showCreateModal && (
        <CreateUserModal
          isOpen
          onClose={() => setShowCreateModal(false)}
          companyId={company.id}
        />
      )}

      {modal && (
        <UserModal
          companyId={company.id}
          mode={modal.mode}
          user={modal.item}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            queryClient.invalidateQueries({ queryKey: companiesKeys.detail(company.id) })
          }}
        />
      )}
    </>
  )
}
