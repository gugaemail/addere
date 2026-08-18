'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createUserSchema, type CreateUserFormData } from '@/lib/schemas'
import { useCreateUser, useUsers } from '@/hooks/useUsers'
import { useUserTypes } from '@/hooks/useUserTypes'
import { getApiErrorMessage } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { FormSelect } from '@/components/ui/FormField'

interface CreateUserModalProps {
  isOpen: boolean
  onClose: () => void
  /**
   * Quando informado, cria o usuário dentro da empresa (POST /companies/:id/users)
   * e oculta os campos de tipo/cópia de permissões (conceitos do escopo global).
   */
  companyId?: string
}

export function CreateUserModal({ isOpen, onClose, companyId }: CreateUserModalProps) {
  const createUser = useCreateUser(companyId)
  const isCompanyScope = !!companyId
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
      await createUser.mutateAsync(
        isCompanyScope
          ? { name: data.name, email: data.email, password: data.password, role: data.role }
          : {
              ...data,
              userTypeId: data.userTypeId || undefined,
              copyPermissionsFromUserId: data.copyPermissionsFromUserId || undefined,
            },
      )
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
        <FormSelect label="Perfil" error={errors.role?.message} {...register('role')}>
          <option value="SALESPERSON">Vendedor</option>
          <option value="ADMIN">Administrador</option>
        </FormSelect>

        {!isCompanyScope && (
          <>
            <FormSelect label="Tipo de usuário" {...register('userTypeId')}>
              <option value="">Sem tipo</option>
              {(userTypes ?? []).map((type) => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </FormSelect>

            <div>
              <FormSelect label="Copiar permissões de" {...register('copyPermissionsFromUserId')}>
                <option value="">Nenhuma (nasce sem permissões)</option>
                {(users ?? []).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </FormSelect>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Se não informado, o novo usuário nasce sem nenhuma permissão — o superadmin deverá marcá-las depois.
              </p>
            </div>
          </>
        )}

        {createUser.isError && (
          <p className="text-sm text-danger">
            {getApiErrorMessage(createUser.error, 'Erro ao criar usuário.')}
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
