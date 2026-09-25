'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Product } from '@addere/types'
import { Table, type Column } from '@/components/ui/Table'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { companiesKeys } from '@/hooks/useCompanies'
import { useCompanyProducts, useToggleCompanyEntity } from '@/hooks/useCompany'
import { ProductModal, ActionMenu } from '../EntityModals'
import {
  TabSection,
  SearchInput,
  SortHeader,
  Pagination,
  TableEmptyState,
  NoResultsState,
  applyTable,
  toggleSort,
  type ModalState,
  type SortConfig,
} from './shared'

export function ProductsTab({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient()
  const { data: products = [] } = useCompanyProducts(companyId)
  const toggleEntity = useToggleCompanyEntity(companyId)

  const [modal, setModal] = useState<ModalState<Product>>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortConfig>(null)

  const q = search.toLowerCase()
  const table = applyTable(
    products,
    (p) =>
      !q || p.name.toLowerCase().includes(q) || (p.protheusCode ?? '').toLowerCase().includes(q),
    sort,
    (p, col) => (col === 'name' ? p.name : (p.protheusCode ?? '')),
    page
  )

  const onSort = (c: string) => {
    setSort(toggleSort(sort, c))
    setPage(1)
  }

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: <SortHeader label="Nome" col="name" sort={sort} onSort={onSort} />,
      render: (p) => <span className="font-medium text-[var(--text-primary)]">{p.name}</span>,
    },
    {
      key: 'code',
      header: <SortHeader label="Protheus" col="code" sort={sort} onSort={onSort} />,
      render: (p) => <span className="text-[var(--text-muted)]">{p.protheusCode ?? '—'}</span>,
    },
    {
      key: 'unit',
      header: 'Unidade',
      render: (p) => <span className="text-[var(--text-muted)]">{p.unit}</span>,
    },
    { key: 'price', header: 'Preço', render: (p) => <>R$ {Number(p.price).toFixed(2)}</> },
    {
      key: 'stock',
      header: 'Estoque',
      render: (p) => <span className="text-[var(--text-muted)]">{Number(p.stock).toFixed(3)}</span>,
    },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge active={p.active} /> },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (p) => (
        <ActionMenu
          label="produto"
          active={p.active}
          onView={() => setModal({ mode: 'view', item: p })}
          onEdit={() => setModal({ mode: 'edit', item: p })}
          onCopy={() => setModal({ mode: 'copy', item: p })}
          onToggle={() =>
            toggleEntity.mutate({ entity: 'products', entityId: p.id, active: !p.active })
          }
        />
      ),
    },
  ]

  return (
    <>
      <TabSection
        action={{ label: 'Novo produto', onClick: () => setModal({ mode: 'create' }) }}
        search={
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v)
              setPage(1)
            }}
            placeholder="Pesquisar produtos…"
          />
        }
        footer={<Pagination page={page} total={table.total} pages={table.pages} onPage={setPage} />}
      >
        <div className="overflow-auto max-h-[520px]">
          {products.length === 0 ? (
            <TableEmptyState
              title="Nenhum produto"
              description="Adicione manualmente ou sincronize via Protheus."
            />
          ) : table.total === 0 && search ? (
            <NoResultsState />
          ) : (
            <Table
              columns={columns}
              data={table.rows}
              rowKey={(p) => p.id}
              className="rounded-none"
            />
          )}
        </div>
      </TabSection>

      {modal && (
        <ProductModal
          companyId={companyId}
          mode={modal.mode}
          product={modal.item}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            queryClient.invalidateQueries({ queryKey: companiesKeys.entity(companyId, 'products') })
          }}
        />
      )}
    </>
  )
}
