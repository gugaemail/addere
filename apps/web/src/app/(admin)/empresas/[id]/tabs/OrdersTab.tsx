'use client'

import { useState } from 'react'
import { AlertTriangle, Braces, Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import type { CompanyOrder, OrderStatus } from '@addere/types'
import { Table, type Column } from '@/components/ui/Table'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { getApiErrorMessage } from '@/lib/api'
import { useCompanyOrders, useCancelOrder, useOrderPayload } from '@/hooks/useCompany'
import { ConfirmModal } from '../ConfirmModal'
import {
  TabSection,
  SearchInput,
  SortHeader,
  Pagination,
  TableEmptyState,
  NoResultsState,
  applyTable,
  toggleSort,
  type SortConfig,
} from './shared'

function OrderStatusBadge({ status }: { status: OrderStatus | string }) {
  const variants: Record<string, 'warning' | 'success' | 'danger'> = {
    PENDING: 'warning',
    SYNCED: 'success',
    CANCELLED: 'danger',
  }
  const labels: Record<string, string> = {
    PENDING: 'Pendente',
    SYNCED: 'Sincronizado',
    CANCELLED: 'Cancelado',
  }
  return <Badge variant={variants[status] ?? 'neutral'}>{labels[status] ?? status}</Badge>
}

// Detalhe expandido do pedido (itens + metadados de sincronização)
function OrderDetail({ order }: { order: CompanyOrder }) {
  return (
    <div className="rounded-lg border border-[var(--border)] overflow-hidden mt-1">
      <div className="overflow-x-auto overscroll-x-contain">
        <table className="w-full text-xs">
          <thead className="bg-[var(--bg-surface)]">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-[var(--text-secondary)]">
                Produto
              </th>
              <th className="text-right px-3 py-2 font-medium text-[var(--text-secondary)]">Qtd</th>
              <th className="text-right px-3 py-2 font-medium text-[var(--text-secondary)]">
                Preço unit.
              </th>
              <th className="text-right px-3 py-2 font-medium text-[var(--text-secondary)]">
                Desc. %
              </th>
              <th className="text-right px-3 py-2 font-medium text-[var(--text-secondary)]">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {order.items.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2 text-[var(--text-primary)]">{item.product.name}</td>
                <td className="px-3 py-2 text-right text-[var(--text-secondary)]">
                  {Number(item.quantity).toFixed(3)} {item.product.unit}
                </td>
                <td className="px-3 py-2 text-right text-[var(--text-secondary)]">
                  R$ {Number(item.unitPrice).toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right text-[var(--text-secondary)]">
                  {Number(item.discount).toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right font-medium text-[var(--text-primary)]">
                  R$ {Number(item.total).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(order.protheusOrderId || order.notes) && (
        <div className="px-3 py-2 bg-[var(--bg-surface)] border-t border-[var(--border)] flex gap-6 text-xs text-[var(--text-muted)]">
          {order.protheusOrderId && (
            <span>
              Pedido Protheus: <span className="font-mono">{order.protheusOrderId}</span>
            </span>
          )}
          {order.notes && <span>Obs: {order.notes}</span>}
          {order.syncedAt && (
            <span>Sincronizado: {new Date(order.syncedAt).toLocaleString('pt-BR')}</span>
          )}
        </div>
      )}
    </div>
  )
}

// JSON do pedido no formato do Protheus (C5/C6), do mesmo builder do envio real.
// Abrir não envia nada; cadastro incompleto aparece como o motivo que trava o envio
function OrderJsonModal({
  companyId,
  order,
  onClose,
}: {
  companyId: string
  order: CompanyOrder
  onClose: () => void
}) {
  const { data, isLoading, error } = useOrderPayload(companyId, order.id)
  const [copied, setCopied] = useState(false)
  const json = data ? JSON.stringify(data, null, 2) : ''

  async function copy() {
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Não foi possível copiar — selecione o texto manualmente')
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      className="max-w-2xl"
      title={`JSON do pedido #${order.id.slice(0, 8)}`}
    >
      <p className="mb-3 text-xs text-[var(--text-muted)]">
        {order.status === 'SYNCED'
          ? 'Remontado agora com o cadastro atual — pode diferir do que foi enviado se cliente, produto ou vendedor mudaram depois.'
          : 'O que o app envia ao Protheus, montado agora com o cadastro atual. Abrir aqui não envia nada.'}
      </p>
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-lg bg-danger/10 p-3 text-sm text-danger">
          <AlertTriangle size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden />
          <span>{getApiErrorMessage(error, 'Não foi possível montar o JSON do pedido.')}</span>
        </div>
      ) : (
        <>
          <pre className="max-h-[60vh] overflow-auto rounded-xl bg-[var(--bg-subtle)] p-4 font-mono text-xs text-[var(--text-secondary)] whitespace-pre-wrap break-all">
            {json}
          </pre>
          <div className="mt-3 flex justify-end">
            <Button variant="outline" size="sm" leftIcon={copied ? Check : Copy} onClick={copy}>
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

export function OrdersTab({ companyId }: { companyId: string }) {
  const { data: orders = [] } = useCompanyOrders(companyId)
  const cancelOrder = useCancelOrder(companyId)

  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null)
  const [jsonOrder, setJsonOrder] = useState<CompanyOrder | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortConfig>(null)

  const q = search.toLowerCase()
  const table = applyTable(
    orders,
    (o) =>
      !q ||
      o.id.slice(0, 8).toLowerCase().includes(q) ||
      o.customer.name.toLowerCase().includes(q) ||
      o.user.name.toLowerCase().includes(q) ||
      o.status.toLowerCase().includes(q),
    sort,
    (o, col) => {
      if (col === 'id') return o.id
      if (col === 'customer') return o.customer.name
      if (col === 'date') return o.createdAt
      return ''
    },
    page
  )

  const onSort = (c: string) => {
    setSort(toggleSort(sort, c))
    setPage(1)
  }

  const columns: Column<CompanyOrder>[] = [
    {
      key: 'id',
      header: <SortHeader label="#" col="id" sort={sort} onSort={onSort} />,
      render: (o) => (
        <span className="text-[var(--text-muted)] font-mono text-xs">{o.id.slice(0, 8)}</span>
      ),
    },
    {
      key: 'customer',
      header: <SortHeader label="Cliente" col="customer" sort={sort} onSort={onSort} />,
      render: (o) => (
        <span className="font-medium text-[var(--text-primary)]">{o.customer.name}</span>
      ),
    },
    {
      key: 'user',
      header: 'Vendedor',
      render: (o) => <span className="text-[var(--text-muted)]">{o.user.name}</span>,
    },
    {
      key: 'branch',
      header: 'Filial',
      render: (o) => <span className="text-[var(--text-muted)]">{o.branch?.name ?? '—'}</span>,
    },
    { key: 'items', header: 'Itens', className: 'text-center', render: (o) => o.items.length },
    { key: 'total', header: 'Total', render: (o) => <>R$ {Number(o.total).toFixed(2)}</> },
    { key: 'status', header: 'Status', render: (o) => <OrderStatusBadge status={o.status} /> },
    {
      key: 'date',
      header: <SortHeader label="Data" col="date" sort={sort} onSort={onSort} />,
      render: (o) => (
        <span className="text-[var(--text-muted)] text-xs">
          {new Date(o.createdAt).toLocaleDateString('pt-BR')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (o) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="xs"
            leftIcon={Braces}
            aria-label={`Ver JSON do pedido #${o.id.slice(0, 8)}`}
            onClick={(e) => {
              e.stopPropagation()
              setJsonOrder(o)
            }}
          >
            JSON
          </Button>
          {o.status !== 'CANCELLED' && (
            <Button
              variant="danger-outline"
              size="xs"
              onClick={(e) => {
                e.stopPropagation()
                setConfirmCancel(o.id)
              }}
            >
              Cancelar
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      <TabSection
        search={
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v)
              setPage(1)
            }}
            placeholder="Pesquisar pedidos…"
          />
        }
        footer={<Pagination page={page} total={table.total} pages={table.pages} onPage={setPage} />}
      >
        <div className="overflow-auto max-h-[520px]">
          {orders.length === 0 ? (
            <TableEmptyState
              title="Nenhum pedido ainda"
              description="Os pedidos criados pelos vendedores aparecerão aqui."
            />
          ) : table.total === 0 && search ? (
            <NoResultsState />
          ) : (
            <Table
              columns={columns}
              data={table.rows}
              rowKey={(o) => o.id}
              className="rounded-none"
              onRowClick={(o) => setExpandedOrder(expandedOrder === o.id ? null : o.id)}
              renderExpanded={(o) => (expandedOrder === o.id ? <OrderDetail order={o} /> : null)}
            />
          )}
        </div>
      </TabSection>

      {jsonOrder && (
        <OrderJsonModal
          companyId={companyId}
          order={jsonOrder}
          onClose={() => setJsonOrder(null)}
        />
      )}

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
