'use client'

import { useOrderStats, useOrders } from '@/hooks/useOrders'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Table, type Column } from '@/components/ui/Table'
import { Spinner } from '@/components/ui/Spinner'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Order } from '@addere/types'

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useOrderStats()
  const { data: orders, isLoading: ordersLoading } = useOrders(5)

  const columns: Column<Order>[] = [
    { key: 'customer', header: 'Cliente', render: (row) => row.customer.name },
    { key: 'total', header: 'Total', render: (row) => formatCurrency(row.total) },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge status={row.status} />,
    },
    { key: 'createdAt', header: 'Data', render: (row) => formatDate(row.createdAt) },
  ]

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Visão geral das vendas" />

      {/* Stats */}
      {statsLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card>
            <p className="text-sm text-gray-400">Total de Pedidos</p>
            <p className="mt-2 text-3xl font-bold text-white">{stats?.totalOrders ?? 0}</p>
          </Card>
          <Card>
            <p className="text-sm text-gray-400">Pendentes</p>
            <p className="mt-2 text-3xl font-bold text-yellow-400">{stats?.pendingOrders ?? 0}</p>
          </Card>
          <Card>
            <p className="text-sm text-gray-400">Sincronizados</p>
            <p className="mt-2 text-3xl font-bold text-green-400">{stats?.syncedOrders ?? 0}</p>
          </Card>
          <Card>
            <p className="text-sm text-gray-400">Receita Total</p>
            <p className="mt-2 text-3xl font-bold text-blue-400">
              {formatCurrency(stats?.totalRevenue ?? '0')}
            </p>
          </Card>
        </div>
      )}

      {/* Últimos pedidos */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-white">Últimos Pedidos</h2>
        {ordersLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <Table
            columns={columns}
            data={orders ?? []}
            emptyMessage="Nenhum pedido encontrado."
          />
        )}
      </div>
    </div>
  )
}
