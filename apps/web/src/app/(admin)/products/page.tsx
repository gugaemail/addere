'use client'

import { useState } from 'react'
import { useProducts } from '@/hooks/useProducts'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Table, type Column } from '@/components/ui/Table'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { formatCurrency } from '@/lib/utils'
import type { Product } from '@addere/types'

export default function ProductsPage() {
  const [search, setSearch] = useState('')
  const { data: products, isLoading } = useProducts(search || undefined)

  const columns: Column<Product>[] = [
    { key: 'name', header: 'Nome', render: (row) => <span className="font-medium text-white">{row.name}</span> },
    { key: 'protheusCode', header: 'Cód. Protheus', render: (row) => row.protheusCode ?? '—' },
    { key: 'price', header: 'Preço', render: (row) => formatCurrency(row.price) },
    { key: 'stock', header: 'Estoque', render: (row) => `${row.stock} ${row.unit}` },
    {
      key: 'active',
      header: 'Status',
      render: (row) => <Badge status={row.active ? 'ACTIVE' : 'INACTIVE'} />,
    },
  ]

  return (
    <div>
      <PageHeader title="Produtos" subtitle="Catálogo de produtos" />

      <div className="mb-4 max-w-sm">
        <Input
          placeholder="Buscar por nome ou código..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <Table
          columns={columns}
          data={products ?? []}
          emptyMessage="Nenhum produto encontrado."
        />
      )}
    </div>
  )
}
