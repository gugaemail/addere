'use client'

import { useState } from 'react'
import type { CompanyOrder, OrderStatus } from '@addere/types'
import { Table, type Column } from '@/components/ui/Table'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useCompanyOrders, useCancelOrder } from '@/hooks/useCompany'
import { ConfirmModal } from '../ConfirmModal'
import {
  TabSection, SearchInput, SortHeader, Pagination, TableEmptyState, NoResultsState,
  applyTable, toggleSort, type SortConfig,
} from './shared'

function OrderStatusBadge({ status }: { status: OrderStatus | string }) {
  const variants: Record<string, 'warning' | 'success' | 'danger'> = {
    PENDING: 'warning', SYNCED: 'success', CANCELLED: 'danger',
  }
  const labels: Record<string, string> = {
    PENDING: 'Pendente', SYNCED: 'Sincronizado', CANCELLED: 'Cancelado',
  }
  return <Badge variant={variants[status] ?? 'neutral'}>{labels[status] ?? status}</Badge>
}

// Detalhe expandido do pedido (itens + metadados de sincronização)
function OrderDetail({ order }: { order: CompanyOrder }) {
  return (
    <div className="rounded-lg border border-[var(--border)] overflow-hidden mt-1">
      <table className="w-full text-xs">
        <thead className="bg-[var(--bg-surface)]">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-[var(--text-secondary)]">Produto</th>
            <th className="text-right px-3 py-2 font-medium text-[var(--text-secondary)]">Qtd</th>
            <th className="text-right px-3 py-2 font-medium text-[var(--text-secondary)]">Preço unit.</th>
            <th className="text-right px-3 py-2 font-medium text-[var(--text-secondary)]">Desc. %</th>
            <th className="text-right px-3 py-2 font-medium text-[var(--text-secondary)]">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {order.items.map((item) => (
            <tr key={item.id}>
              <td className="px-3 py-2 text-[var(--text-primary)]">{item.product.name}</td>
              <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{Number(item.quantity).toFixed(3)} {item.product.unit}</td>
              <td className="px-3 py-2 text-right text-[var(--text-secondary)]">R$ {Number(item.unitPrice).toFixed(2)}</td>
              <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{Number(item.discount).toFixed(1)}%</td>
              <td className="px-3 py-2 text-right font-medium text-[var(--text-primary)]">R$ {Number(item.total).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(order.protheusOrderId || order.notes) && (
        <div className="px-3 py-2 bg-[var(--bg-surface)] border-t border-[var(--border)] flex gap-6 text-xs text-[var(--text-muted)]">
          {order.protheusOrderId && <span>Pedido Protheus: <span className="font-mono">{order.protheusOrderId}</span></span>}
          {order.notes && <span>Obs: {order.notes}</span>}
          {order.syncedAt && <span>Sincronizado: {new Date(order.syncedAt).toLocaleString('pt-BR')}</span>}
        </div>
      )}
    </div>
  )
}

export function OrdersTab({ companyId }: { companyId: string }) {
  const { data: orders = [] } = useCompanyOrders(companyId)
  const cancelOrder = useCancelOrder(companyId)

  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortConfig>(null)

  const q = search.toLowerCase()
  const table = applyTable(
    orders,
    (o) => !q || o.id.slice(0, 8).toLowerCase().includes(q) || o.customer.name.toLowerCase().includes(q) || o.user.name.toLowerCase().includes(q) || o.status.toLowerCase().includes(q),
    sort,
    (o, col) => {
      if (col === 'id') return o.id
      if (col === 'customer') return o.customer.name
      if (col === 'date') return o.createdAt
      return ''
    },
    page,
  )

  const onSort = (c: string) => { setSort(toggleSort(sort, c)); setPage(1) }

  const columns: Column<CompanyOrder>[] = [
    {
      key: 'id',
      header: <SortHeader label="#" col="id" sort={sort} onSort={onSort} />,
      render: (o) => <span className="text-[var(--text-muted)] font-mono text-xs">{o.id.slice(0, 8)}</span>,
    },
    {
      key: 'customer',
      header: <SortHeader label="Cliente" col="customer" sort={sort} onSort={onSort} />,
      render: (o) => <span className="font-medium text-[var(--text-primary)]">{o.customer.name}</span>,
    },
    { key: 'user', header: 'Vendedor', render: (o) => <span className="text-[var(--text-muted)]">{o.user.name}</span> },
    { key: 'branch', header: 'Filial', render: (o) => <span className="text-[var(--text-muted)]">{o.branch?.name ?? '—'}</span> },
    { key: 'items', header: 'Itens', className: 'text-center', render: (o) => o.items.length },
    { key: 'total', header: 'Total', render: (o) => <>R$ {Number(o.total).toFixed(2)}</> },
    { key: 'status', header: 'Status', render: (o) => <OrderStatusBadge status={o.status} /> },
    {
      key: 'date',
      header: <SortHeader label="Data" col="date" sort={sort} onSort={onSort} />,
      render: (o) => <span className="text-[var(--text-muted)] text-xs">{new Date(o.createdAt).toLocaleDateString('pt-BR')}</span>,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (o) => o.status !== 'CANCELLED' ? (
        <Button
          variant="danger-outline"
          size="xs"
          onClick={(e) => { e.stopPropagation(); setConfirmCancel(o.id) }}
        >
          Cancelar
        </Button>
      ) : null,
    },
  ]

  return (
    <>
      <TabSection
        search={<SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Pesquisar pedidos…" />}
        footer={<Pagination page={page} total={table.total} pages={table.pages} onPage={setPage} />}
      >
        <div className="overflow-auto max-h-[520px]">
          {orders.length === 0 ? (
            <TableEmptyState title="Nenhum pedido ainda" description="Os pedidos criados pelos vendedores aparecerão aqui." />
          ) : table.total === 0 && search ? (
            <NoResultsState />
          ) : (
            <Table
              columns={columns}
              data={table.rows}
              rowKey={(o) => o.id}
              className="rounded-none"
              onRowClick={(o) => setExpandedOrder(expandedOrder === o.id ? null : o.id)}
              renderExpanded={(o) => expandedOrder === o.id ? <OrderDetail order={o} /> : null}
            />
          )}
        </div>
      </TabSection>

      {confirmCancel && (
        <ConfirmModal
          title="Cancelar pedido?"
          description={`O pedido #${confirmCancel.slice(0, 8)} será cancelado e não poderá ser reaberto.`}
          confirmLabel="Sim, cancelar"
          onConfirm={() => cancelOrder.mutate(confirmCancel)}
          onClose={() => setConfirmCancel(null)}
        />
      )}
    </>
  )
}
