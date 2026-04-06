'use client'

import { useState } from 'react'
import { useCustomers } from '@/hooks/useCustomers'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Table, type Column } from '@/components/ui/Table'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import type { Customer } from '@addere/types'

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const { data: customers, isLoading } = useCustomers(search || undefined)

  const columns: Column<Customer>[] = [
    { key: 'name', header: 'Nome', render: (row) => <span className="font-medium text-white">{row.name}</span> },
    { key: 'document', header: 'CPF/CNPJ', render: (row) => row.document ?? '—' },
    { key: 'email', header: 'Email', render: (row) => row.email ?? '—' },
    { key: 'phone', header: 'Telefone', render: (row) => row.phone ?? '—' },
    {
      key: 'active',
      header: 'Status',
      render: (row) => <Badge status={row.active ? 'ACTIVE' : 'INACTIVE'} />,
    },
  ]

  return (
    <div>
      <PageHeader title="Clientes" subtitle="Base de clientes cadastrados" />

      <div className="mb-4 max-w-sm">
        <Input
          placeholder="Buscar por nome ou documento..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <Table
          columns={columns}
          data={customers ?? []}
          emptyMessage="Nenhum cliente encontrado."
        />
      )}
    </div>
  )
}
