'use client'

import { useOrders, useOrderStats } from '@/hooks/useOrders'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Table, type Column } from '@/components/ui/Table'
import { Spinner } from '@/components/ui/Spinner'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Order } from '@addere/types'

export default function OrdersPage() {
  const { data: orders, isLoading } = useOrders()
  const { data: stats } = useOrderStats()

  const columns: Column<Order>[] = [
    {
      key: 'id',
      header: 'ID',
      render: (row) => (
        <span className="font-mono text-xs text-gray-500">{row.id.slice(0, 8)}…</span>
      ),
    },
    { key: 'customer', header: 'Cliente', render: (row) => row.customer.name },
    { key: 'total', header: 'Total', render: (row) => formatCurrency(row.total) },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge status={row.status} />,
    },
    {
      key: 'protheusId',
      header: 'Protheus ID',
      render: (row) => row.protheusOrderId ?? <span className="text-gray-600">—</span>,
    },
    { key: 'createdAt', header: 'Data', render: (row) => formatDate(row.createdAt) },
  ]

  return (
    <div>
      <PageHeader
        title="Pedidos"
        subtitle={
          stats
            ? `${stats.totalOrders} total · ${stats.pendingOrders} pendentes · ${stats.syncedOrders} sincronizados`
            : undefined
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <Table columns={columns} data={orders ?? []} emptyMessage="Nenhum pedido encontrado." />
      )}
    </div>
  )
}
