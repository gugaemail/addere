'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/api'
import { useUserTypes, useCreateUserType, useUpdateUserType } from '@/hooks/useUserTypes'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Table, type Column } from '@/components/ui/Table'
import { Spinner } from '@/components/ui/Spinner'
import type { UserType } from '@addere/types'

export default function UserTypesPage() {
  const { isSuperAdmin } = useAuth()
  const { data: userTypes, isLoading } = useUserTypes()
  const createUserType = useCreateUserType()
  const updateUserType = useUpdateUserType()

  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  if (!isSuperAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[var(--text-muted)]">Acesso restrito ao super administrador.</p>
      </div>
    )
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createUserType.mutateAsync(newName)
      setNewName('')
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Erro ao criar tipo de usuário.'))
    }
  }

  function startEditing(userType: UserType) {
    setEditingId(userType.id)
    setEditingName(userType.name)
  }

  async function handleRename(id: string) {
    try {
      await updateUserType.mutateAsync({ id, name: editingName })
      setEditingId(null)
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Erro ao renomear tipo de usuário.'))
    }
  }

  const columns: Column<UserType>[] = [
    {
      key: 'name',
      header: 'Nome',
      render: (row) =>
        editingId === row.id ? (
          <Input
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            className="py-1 max-w-xs"
            autoFocus
          />
        ) : (
          <span className="font-medium text-[var(--text-primary)]">{row.name}</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        editingId === row.id ? (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>
              Cancelar
            </Button>
            <Button size="sm" loading={updateUserType.isPending} onClick={() => handleRename(row.id)}>
              Salvar
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button size="sm" variant="secondary" onClick={() => startEditing(row)}>
              Renomear
            </Button>
          </div>
        ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Tipos de usuário"
        subtitle="Cadastro usado para caracterizar os usuários (não afeta permissões)"
      />

      <form onSubmit={handleCreate} className="mb-6 flex items-end gap-3">
        <div className="flex-1 max-w-xs">
          <Input
            label="Novo tipo"
            placeholder="Ex: Supervisor"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </div>
        <Button type="submit" loading={createUserType.isPending} disabled={newName.trim().length < 2}>
          Adicionar
        </Button>
      </form>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <Table columns={columns} data={userTypes ?? []} emptyMessage="Nenhum tipo de usuário cadastrado." />
      )}
    </div>
  )
}
