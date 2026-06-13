'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useUsers, useToggleUser } from '@/hooks/useUsers'
import { useUserTypes } from '@/hooks/useUserTypes'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Table, type Column } from '@/components/ui/Table'
import { Spinner } from '@/components/ui/Spinner'
import { CreateUserModal } from '@/components/users/CreateUserModal'
import { PermissionsModal } from '@/components/users/PermissionsModal'
import { formatDate } from '@/lib/utils'
import type { UserPublic } from '@addere/types'

export default function UsersPage() {
  const { isAdmin, isSuperAdmin } = useAuth()
  const { data: users, isLoading } = useUsers()
  const { data: userTypes } = useUserTypes()
  const toggleUser = useToggleUser()
  const [modalOpen, setModalOpen] = useState(false)
  const [permissionsUser, setPermissionsUser] = useState<UserPublic | null>(null)

  if (!isAdmin && !isSuperAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-gray-400">Acesso restrito a administradores.</p>
      </div>
    )
  }

  const userTypeName = (id: string | null) => userTypes?.find((t) => t.id === id)?.name ?? '—'

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
      key: 'userTypeId',
      header: 'Tipo',
      render: (row) => <span className="text-xs text-gray-400">{userTypeName(row.userTypeId)}</span>,
    },
    {
      key: 'active',
      header: 'Status',
      render: (row) => <Badge variant={row.active ? 'success' : 'danger'}>{row.active ? 'Ativo' : 'Inativo'}</Badge>,
    },
    { key: 'createdAt', header: 'Criado em', render: (row) => formatDate(row.createdAt) },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="flex justify-end gap-2">
          {isSuperAdmin && row.role !== 'SUPERADMIN' && (
            <Button size="sm" variant="secondary" onClick={() => setPermissionsUser(row)}>
              Permissões
            </Button>
          )}
          <Button
            size="sm"
            variant={row.active ? 'danger' : 'secondary'}
            loading={toggleUser.isPending}
            onClick={() => toggleUser.mutate(row.id)}
          >
            {row.active ? 'Desativar' : 'Ativar'}
          </Button>
        </div>
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
      {isSuperAdmin && (
        <PermissionsModal
          isOpen={!!permissionsUser}
          onClose={() => setPermissionsUser(null)}
          user={permissionsUser}
        />
      )}
    </div>
  )
}
