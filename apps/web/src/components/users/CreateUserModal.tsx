'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createUserSchema, type CreateUserFormData } from '@/lib/schemas'
import { useCreateUser } from '@/hooks/useUsers'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

interface CreateUserModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CreateUserModal({ isOpen, onClose }: CreateUserModalProps) {
  const createUser = useCreateUser()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormData>({ resolver: zodResolver(createUserSchema) })

  const onSubmit = async (data: CreateUserFormData) => {
    try {
      await createUser.mutateAsync(data)
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

        {createUser.isError && (
          <p className="text-sm text-red-400">
            {(createUser.error as Error)?.message ?? 'Erro ao criar usuário.'}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Criar usuário
          </Button>
        </div>
      </form>
    </Modal>
  )
}
