'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Customer } from '@addere/types'
import { Table, type Column } from '@/components/ui/Table'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { companiesKeys } from '@/hooks/useCompanies'
import { useCompanyCustomers, useToggleCompanyEntity } from '@/hooks/useCompany'
import { CustomerModal, ActionMenu } from '../EntityModals'
import {
  TabSection, SearchInput, SortHeader, Pagination, TableEmptyState, NoResultsState,
  applyTable, toggleSort, type ModalState, type SortConfig,
} from './shared'

export function CustomersTab({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient()
  const { data: customers = [] } = useCompanyCustomers(companyId)
  const toggleEntity = useToggleCompanyEntity(companyId)

  const [modal, setModal] = useState<ModalState<Customer>>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortConfig>(null)

  const q = search.toLowerCase()
  const table = applyTable(
    customers,
    (c) => !q || c.name.toLowerCase().includes(q) || (c.document ?? '').toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q) || (c.protheusCode ?? '').toLowerCase().includes(q),
    sort,
    (c, col) => col === 'name' ? c.name : (c.protheusCode ?? ''),
    page,
  )

  const onSort = (c: string) => { setSort(toggleSort(sort, c)); setPage(1) }

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: <SortHeader label="Nome" col="name" sort={sort} onSort={onSort} />,
      render: (c) => <span className="font-medium text-[var(--text-primary)]">{c.name}</span>,
    },
    { key: 'document', header: 'Documento', render: (c) => <span className="text-[var(--text-muted)]">{c.document ?? '—'}</span> },
    { key: 'email', header: 'E-mail', render: (c) => <span className="text-[var(--text-muted)]">{c.email ?? '—'}</span> },
    { key: 'phone', header: 'Telefone', render: (c) => <span className="text-[var(--text-muted)]">{c.phone ?? '—'}</span> },
    {
      key: 'code',
      header: <SortHeader label="Protheus" col="code" sort={sort} onSort={onSort} />,
      render: (c) => (
        <span className="text-[var(--text-muted)]">
          {c.protheusCode ? `${c.protheusCode}${c.loja ? `/${c.loja}` : ''}` : '—'}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (c) => <StatusBadge active={c.active} /> },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (c) => (
        <ActionMenu
          label="cliente"
          active={c.active}
          onView={() => setModal({ mode: 'view', item: c })}
          onEdit={() => setModal({ mode: 'edit', item: c })}
          onCopy={() => setModal({ mode: 'copy', item: c })}
          onToggle={() => toggleEntity.mutate({ entity: 'customers', entityId: c.id, active: !c.active })}
        />
      ),
    },
  ]

  return (
    <>
      <TabSection
        action={{ label: 'Novo cliente', onClick: () => setModal({ mode: 'create' }) }}
        search={<SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Pesquisar clientes…" />}
        footer={<Pagination page={page} total={table.total} pages={table.pages} onPage={setPage} />}
      >
        <div className="overflow-auto max-h-[520px]">
          {customers.length === 0 ? (
            <TableEmptyState title="Nenhum cliente" description="Adicione manualmente ou sincronize via Protheus." />
          ) : table.total === 0 && search ? (
            <NoResultsState />
          ) : (
            <Table columns={columns} data={table.rows} rowKey={(c) => c.id} className="rounded-none" />
          )}
        </div>
      </TabSection>

      {modal && (
        <CustomerModal
          companyId={companyId}
          mode={modal.mode}
          customer={modal.item}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            queryClient.invalidateQueries({ queryKey: companiesKeys.entity(companyId, 'customers') })
          }}
        />
      )}
    </>
  )
}
