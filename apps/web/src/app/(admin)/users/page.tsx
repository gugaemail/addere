'use client'

import { useState } from 'react'
import { useUsers, useToggleUser } from '@/hooks/useUsers'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Table, type Column } from '@/components/ui/Table'
import { Spinner } from '@/components/ui/Spinner'
import { CreateUserModal } from '@/components/users/CreateUserModal'
import { formatDate } from '@/lib/utils'
import type { UserPublic } from '@addere/types'

export default function UsersPage() {
  const { isAdmin } = useAuth()
  const { data: users, isLoading } = useUsers()
  const toggleUser = useToggleUser()
  const [modalOpen, setModalOpen] = useState(false)

  if (!isAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-gray-400">Acesso restrito a administradores.</p>
      </div>
    )
  }

  const columns: Column<UserPublic>[] = [
    { key: 'name', header: 'Nome', render: (row) => <span className="font-medium text-white">{row.name}</span> },
    { key: 'email', header: 'Email', render: (row) => row.email },
    {
      key: 'role',
      header: 'Perfil',
      render: (row) => (
        <span className="text-xs text-gray-400">
          {row.role === 'ADMIN' ? 'Administrador' : 'Vendedor'}
        </span>
      ),
    },
    {
      key: 'active',
      header: 'Status',
      render: (row) => <Badge status={row.active ? 'ACTIVE' : 'INACTIVE'} />,
    },
    { key: 'createdAt', header: 'Criado em', render: (row) => formatDate(row.createdAt) },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <Button
          size="sm"
          variant={row.active ? 'danger' : 'secondary'}
          isLoading={toggleUser.isPending}
          onClick={() => toggleUser.mutate(row.id)}
        >
          {row.active ? 'Desativar' : 'Ativar'}
        </Button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Usuários"
        subtitle="Gerencie vendedores e administradores"
        action={
          <Button onClick={() => setModalOpen(true)}>+ Novo Usuário</Button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <Table columns={columns} data={users ?? []} emptyMessage="Nenhum usuário cadastrado." />
      )}

      <CreateUserModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}
