'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createUserSchema, type CreateUserFormData } from '@/lib/schemas'
import { useCreateUser, useUsers } from '@/hooks/useUsers'
import { useUserTypes } from '@/hooks/useUserTypes'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

interface CreateUserModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CreateUserModal({ isOpen, onClose }: CreateUserModalProps) {
  const createUser = useCreateUser()
  const { data: userTypes } = useUserTypes()
  const { data: users } = useUsers()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormData>({ resolver: zodResolver(createUserSchema) })

  const onSubmit = async (data: CreateUserFormData) => {
    try {
      await createUser.mutateAsync({
        ...data,
        userTypeId: data.userTypeId || undefined,
        copyPermissionsFromUserId: data.copyPermissionsFromUserId || undefined,
      })
      reset()
      onClose()
    } catch {
      // erro tratado pelo estado do mutation
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Novo Usuário">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label="Nome" error={errors.name?.message} {...register('name')} />
        <Input label="Email" type="email" error={errors.email?.message} {...register('email')} />
        <Input
          label="Senha"
          type="password"
          error={errors.password?.message}
          {...register('password')}
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-300">Perfil</label>
          <select
            {...register('role')}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="SALESPERSON">Vendedor</option>
            <option value="ADMIN">Administrador</option>
          </select>
          {errors.role && <p className="text-xs text-red-400">{errors.role.message}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-300">Tipo de usuário</label>
          <select
            {...register('userTypeId')}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Sem tipo</option>
            {(userTypes ?? []).map((type) => (
              <option key={type.id} value={type.id}>{type.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-300">Copiar permissões de</label>
          <select
            {...register('copyPermissionsFromUserId')}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Nenhuma (nasce sem permissões)</option>
            {(users ?? []).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500">
            Se não informado, o novo usuário nasce sem nenhuma permissão — o superadmin deverá marcá-las depois.
          </p>
        </div>

        {createUser.isError && (
          <p className="text-sm text-red-400">
            {(createUser.error as Error)?.message ?? 'Erro ao criar usuário.'}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={isSubmitting}>
            Criar usuário
          </Button>
        </div>
      </form>
    </Modal>
  )
}
