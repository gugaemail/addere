'use client'

// Cadastro e edição de usuário — um só modal para /users, criar, editar e
// copiar. Substituiu o CreateUserModal (que só criava) e o UserModal preso à
// aba da empresa (que só editava lá dentro).
import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { consumesSeat, type SeatSubject, type SeatUsage, type UserPublic } from '@addere/types'
import { makeUserFormSchema, type UserFormData } from '@/lib/schemas'
import { api, getApiErrorCode, getApiErrorMessage } from '@/lib/api'
import { seatBlocksSave } from '@/lib/seats'
import { billingKeys } from '@/hooks/useBilling'
import {
  PROFILE_LABELS,
  SELECTABLE_PROFILES,
  hasVendorProfile,
  profileOf,
  profileToPayload,
} from '@/lib/user-profile'
import { isCompanyless } from '@/lib/user-scope'
import { parseCities } from '@/lib/intel-helpers'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { FormField, FormSelect } from '@/components/ui/FormField'

export type UserFormMode = 'create' | 'edit' | 'copy'

interface UserFormModalProps {
  mode: UserFormMode
  user?: UserPublic
  /** Empresa em que o usuário nasce/vive — obrigatória na criação. */
  companyId: string | null
  /** Nome da empresa acima, para o aviso de vínculo dizer qual é. */
  companyName?: string | null
  /** Usuários com intel.manager da mesma empresa (D3b) — select de gerente. */
  managers: { id: string; name: string }[]
  /**
   * Licenças da empresa (plano 015). No limite, o salvar trava quando a
   * escrita passaria a ocupar uma licença; a API confere de novo.
   */
  seats?: SeatUsage | null
  onClose: () => void
  onSaved: () => void
}

const TITLES: Record<UserFormMode, string> = {
  create: 'Novo usuário',
  edit: 'Editar usuário',
  copy: 'Copiar usuário',
}

export function UserFormModal({
  mode,
  user,
  companyId,
  companyName,
  managers,
  seats,
  onClose,
  onSaved,
}: UserFormModalProps) {
  const isNew = mode !== 'edit'
  // Órfão do bug antigo: a edição precisa vinculá-lo, senão a API recusa
  // ("usuário sem empresa não pode ser editado por aqui").
  const orphan = mode === 'edit' && !!user && isCompanyless(user)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UserFormData>({
    resolver: zodResolver(makeUserFormSchema(isNew)),
    defaultValues: {
      name: user?.name ?? '',
      // Copiar reaproveita o perfil, nunca o e-mail — ele é único no sistema
      email: mode === 'copy' ? '' : (user?.email ?? ''),
      password: '',
      profile: user ? (profileOf(user) as 'SALESPERSON' | 'MANAGER' | 'ADMIN') : 'SALESPERSON',
      idVendProt: user?.idVendProt ?? '',
      visitsPerDay: user?.visitsPerDay ? String(user.visitsPerDay) : '',
      vehicle: (user?.vehicle ?? '') as '' | 'CAR' | 'MOTORCYCLE' | 'FOOT',
      servedCities: (user?.servedCities ?? []).join(', '),
      messageTone: (user?.messageTone ?? '') as '' | 'informal' | 'formal',
      managerId: user?.managerId ?? '',
      // Vendedor novo nasce com as duas, como no padrão do perfil na API
      canChangeCarrier: user?.canChangeCarrier ?? true,
      canChangePaymentTerms: user?.canChangePaymentTerms ?? true,
    },
  })

  const profile = watch('profile')
  const showVendorFields = hasVendorProfile(profile)
  // Só o SUPERADMIN cria ou promove administradores (a API devolve 403 para
  // os demais) — o ADMIN da empresa não deve nem ver a opção. Se o usuário
  // editado já é ADMIN, a opção fica para o select mostrar o perfil atual.
  const { isAdmin, isSuperAdmin } = useAuth()
  const queryClient = useQueryClient()
  // Recusa da API por licença (outro ADMIN ocupou a última com o modal aberto)
  const [seatRefusal, setSeatRefusal] = useState<string | null>(null)
  const profiles = SELECTABLE_PROFILES.filter(
    (key) => key !== 'ADMIN' || isSuperAdmin || (user && profileOf(user) === 'ADMIN')
  )

  // Campos do vendedor (E10) — strings do form viram o payload da API
  function vendorBody(data: UserFormData): Record<string, unknown> {
    return {
      idVendProt: data.idVendProt || null,
      visitsPerDay: data.visitsPerDay ? Number(data.visitsPerDay) : null,
      vehicle: data.vehicle || null,
      servedCities: parseCities(data.servedCities ?? ''),
      messageTone: data.messageTone || null,
      managerId: data.managerId || null,
      canChangeCarrier: !!data.canChangeCarrier,
      canChangePaymentTerms: !!data.canChangePaymentTerms,
    }
  }

  async function onSubmit(data: UserFormData) {
    const { role, intelManager } = profileToPayload(data.profile)
    try {
      if (mode === 'edit' && user) {
        const body: Record<string, unknown> = {
          name: data.name,
          email: data.email,
          role,
          intelManager,
        }
        if (data.password) body.password = data.password
        if (orphan && companyId) body.companyId = companyId
        if (hasVendorProfile(data.profile)) Object.assign(body, vendorBody(data))
        await api.patch(`/users/${user.id}`, body)
      } else {
        await api.post('/users', {
          name: data.name,
          email: data.email,
          password: data.password,
          role,
          intelManager,
          companyId: companyId ?? undefined,
          ...(hasVendorProfile(data.profile) && vendorBody(data)),
        })
      }
      void queryClient.invalidateQueries({ queryKey: billingKeys.seats })
      onSaved()
    } catch (err: unknown) {
      const code = getApiErrorCode(err)
      const message = getApiErrorMessage(err, 'Erro ao salvar usuário.')
      toast.error(message)
      if (code === 'SEAT_LIMIT_REACHED' || code === 'CONTRACT_CANCELLED') {
        setSeatRefusal(message)
        void queryClient.invalidateQueries({ queryKey: billingKeys.seats })
      }
    }
  }

  // Sem empresa não dá para criar nem para consertar um órfão: a API grava
  // companyId nulo e o usuário some da empresa e da Equipe em campo, que
  // filtra por ela.
  const missingCompany = (isNew || orphan) && !companyId

  // Licenças (plano 015): o perfil é observado, então trocar para
  // Administrador tira o aviso e libera o salvar
  const seatBefore: SeatSubject | null =
    mode === 'edit' && user
      ? { role: user.role, active: user.active, companyId: user.companyId ?? null }
      : null
  const seatAfter: SeatSubject = {
    role: profileToPayload(profile).role,
    active: mode === 'edit' && user ? user.active : true,
    companyId: orphan ? companyId : mode === 'edit' ? (user?.companyId ?? null) : companyId,
  }
  const atLimit = seatBlocksSave(seats, seatBefore, seatAfter)
  // A recusa da API vale enquanto a escrita ainda ocuparia uma licença
  const refused = seatRefusal !== null && consumesSeat(seatBefore, seatAfter)
  const seatBlocked = atLimit || refused

  return (
    <Modal isOpen onClose={onClose} title={TITLES[mode]}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Nome" error={errors.name?.message} {...register('name')} />
        <FormField label="E-mail" error={errors.email?.message} {...register('email')} />
        <FormField
          type="password"
          label={
            <>
              Senha{' '}
              {!isNew && (
                <span className="font-normal text-[var(--text-muted)]">
                  (deixe em branco para manter)
                </span>
              )}
            </>
          }
          error={errors.password?.message}
          {...register('password')}
        />

        <FormSelect label="Perfil" error={errors.profile?.message} {...register('profile')}>
          {profiles.map((key) => (
            <option key={key} value={key}>
              {PROFILE_LABELS[key]}
            </option>
          ))}
        </FormSelect>
        {profile === 'MANAGER' && (
          <p className="-mt-2 text-xs text-[var(--text-muted)]">
            O gerente acompanha a Equipe em campo e lê a Saúde dos dados. Configurar consultas e
            premissas continua sendo do administrador.
          </p>
        )}

        {showVendorFields && (
          <>
            <FormField
              label="Cód. Vendedor (Protheus)"
              placeholder="Código do vendedor no ERP (ex: 001)"
              {...register('idVendProt')}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                type="number"
                min={1}
                max={30}
                label="Visitas por dia"
                placeholder="padrão da empresa"
                {...register('visitsPerDay')}
              />
              <FormSelect label="Veículo" {...register('vehicle')}>
                <option value="">—</option>
                <option value="CAR">Carro</option>
                <option value="MOTORCYCLE">Moto</option>
                <option value="FOOT">A pé</option>
              </FormSelect>
            </div>
            <FormField
              label="Cidades atendidas"
              placeholder="Campinas, Valinhos (separadas por vírgula)"
              {...register('servedCities')}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormSelect label="Tom das mensagens" {...register('messageTone')}>
                <option value="">Herdar da empresa</option>
                <option value="informal">Informal</option>
                <option value="formal">Formal</option>
              </FormSelect>
              <FormSelect label="Gerente" {...register('managerId')}>
                <option value="">Sem gerente</option>
                {managers
                  .filter((m) => m.id !== user?.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </FormSelect>
            </div>
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-sm font-medium text-[var(--text-secondary)]">
                No pedido, pode alterar
              </legend>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer rounded border-[var(--border)] accent-brand focus:ring-brand"
                  {...register('canChangeCarrier')}
                />
                a transportadora
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer rounded border-[var(--border)] accent-brand focus:ring-brand"
                  {...register('canChangePaymentTerms')}
                />
                a condição de pagamento
              </label>
              <p className="text-xs text-[var(--text-muted)]">
                Desmarcado, o pedido sai com a transportadora e a condição de pagamento do cadastro
                do cliente. O vendedor vê a mudança quando fechar e abrir o app de novo.
              </p>
            </fieldset>
          </>
        )}

        {missingCompany && (
          <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-[var(--text-secondary)]">
            {orphan
              ? 'Este usuário não pertence a nenhuma empresa. Escolha a empresa ativa na barra lateral para vinculá-lo — enquanto isso, ele não pode ser editado.'
              : 'Escolha a empresa ativa na barra lateral antes de criar o usuário — sem ela o cadastro nasceria sem empresa e não apareceria em lugar nenhum.'}
          </p>
        )}
        {orphan && companyId && (
          <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-[var(--text-secondary)]">
            Este usuário não pertence a nenhuma empresa. Ao salvar, ele será vinculado a{' '}
            <strong className="font-semibold text-[var(--text-primary)]">
              {companyName ?? 'empresa ativa'}
            </strong>
            .
          </p>
        )}

        {seatBlocked && (
          <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-[var(--text-secondary)]">
            <AlertTriangle
              size={16}
              strokeWidth={1.5}
              className="mt-0.5 shrink-0 text-warning"
              aria-hidden
            />
            <span>
              {atLimit && seats?.limit != null ? (
                <>
                  {isSuperAdmin ? 'A empresa' : 'Sua empresa'} já usa {seats.used} de {seats.limit}{' '}
                  licenças. Vendedores e gerentes ocupam licença; administradores não.{' '}
                  {isSuperAdmin ? (
                    'Desative alguém ou ajuste o contrato em Gestão Addere › Clientes.'
                  ) : isAdmin ? (
                    <>
                      Desative alguém ou{' '}
                      <Link href="/plano" className="font-medium text-brand hover:underline">
                        solicite mais licenças →
                      </Link>
                    </>
                  ) : (
                    'Desative alguém para liberar uma licença.'
                  )}
                </>
              ) : (
                seatRefusal
              )}
            </span>
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={isSubmitting} disabled={missingCompany || seatBlocked}>
            {mode === 'edit' ? 'Salvar' : 'Criar usuário'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
