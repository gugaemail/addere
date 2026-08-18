'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Branch, CompanyDetail } from '@addere/types'
import { Table, type Column } from '@/components/ui/Table'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { companiesKeys } from '@/hooks/useCompanies'
import { useToggleCompanyEntity } from '@/hooks/useCompany'
import { BranchModal, ActionMenu } from '../EntityModals'
import {
  TabSection, SearchInput, SortHeader, Pagination, TableEmptyState, NoResultsState,
  applyTable, toggleSort, type ModalState, type SortConfig,
} from './shared'

export function BranchesTab({ company }: { company: CompanyDetail }) {
  const queryClient = useQueryClient()
  const toggleEntity = useToggleCompanyEntity(company.id)

  const [modal, setModal] = useState<ModalState<Branch>>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortConfig>(null)

  const q = search.toLowerCase()
  const table = applyTable(
    company.branches,
    (b) => !q || b.name.toLowerCase().includes(q) || (b.cnpj ?? '').toLowerCase().includes(q) || (b.idProtheus ?? '').toLowerCase().includes(q),
    sort,
    (b, col) => col === 'name' ? b.name : (b.idProtheus ?? ''),
    page,
  )

  const onSort = (c: string) => { setSort(toggleSort(sort, c)); setPage(1) }

  const columns: Column<Branch>[] = [
    {
      key: 'name',
      header: <SortHeader label="Nome" col="name" sort={sort} onSort={onSort} />,
      render: (b) => <span className="font-medium text-[var(--text-primary)]">{b.name}</span>,
    },
    { key: 'cnpj', header: 'CNPJ', render: (b) => <span className="text-[var(--text-muted)]">{b.cnpj ?? '—'}</span> },
    {
      key: 'code',
      header: <SortHeader label="Protheus" col="code" sort={sort} onSort={onSort} />,
      render: (b) => <span className="text-[var(--text-muted)]">{b.idProtheus ?? '—'}</span>,
    },
    { key: 'status', header: 'Status', render: (b) => <StatusBadge active={b.active} /> },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (b) => (
        <ActionMenu
          label="filial"
          active={b.active}
          onEdit={() => setModal({ mode: 'edit', item: b })}
          onCopy={() => setModal({ mode: 'copy', item: b })}
          onToggle={() => toggleEntity.mutate({ entity: 'branches', entityId: b.id, active: !b.active })}
        />
      ),
    },
  ]

  return (
    <>
      <TabSection
        action={{ label: 'Nova filial', onClick: () => setModal({ mode: 'create' }) }}
        search={<SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Pesquisar filiais…" />}
        footer={<Pagination page={page} total={table.total} pages={table.pages} onPage={setPage} />}
      >
        <div className="overflow-auto max-h-[520px]">
          {company.branches.length === 0 ? (
            <TableEmptyState title="Nenhuma filial" description="Adicione a primeira filial desta empresa." />
          ) : table.total === 0 && search ? (
            <NoResultsState />
          ) : (
            <Table columns={columns} data={table.rows} rowKey={(b) => b.id} className="rounded-none" />
          )}
        </div>
      </TabSection>

      {modal && (
        <BranchModal
          companyId={company.id}
          mode={modal.mode}
          branch={modal.item}
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
