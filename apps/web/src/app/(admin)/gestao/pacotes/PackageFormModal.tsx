'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import type { LicensePackageDto } from '@addere/types'
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api'
import { moneyApiToInput, moneyInputToApi } from '@/lib/billing-ui'
import { packageFormSchema, type PackageFormData } from '@/lib/schemas'
import { useCreatePackage, useUpdatePackage, type PackageInput } from '@/hooks/useBilling'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'

const SECTION_TITLE = 'text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide'
const GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2'

interface PackageFormModalProps {
  mode: 'create' | 'edit'
  /** Obrigatório no modo edit */
  pkg?: LicensePackageDto
  onClose: () => void
}

function defaultsFor(pkg: LicensePackageDto | undefined): PackageFormData {
  return {
    code: pkg?.code ?? '',
    name: pkg?.name ?? '',
    seats: pkg?.seats != null ? String(pkg.seats) : '',
    listPriceStandard: moneyApiToInput(pkg?.listPriceStandard),
    listPriceIntelligence: moneyApiToInput(pkg?.listPriceIntelligence),
    listExtraSeatPriceStandard: moneyApiToInput(pkg?.listExtraSeatPriceStandard),
    listExtraSeatPriceIntelligence: moneyApiToInput(pkg?.listExtraSeatPriceIntelligence),
    sortOrder: String(pkg?.sortOrder ?? 0),
  }
}

// Pacote do catálogo. O preço de tabela é opcional e só pré-preenche o
// contrato; mudar a quantidade não mexe em contrato nenhum.
export function PackageFormModal({ mode, pkg, onClose }: PackageFormModalProps) {
  const createPackage = useCreatePackage()
  const updatePackage = useUpdatePackage()

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PackageFormData>({
    resolver: zodResolver(packageFormSchema),
    defaultValues: defaultsFor(pkg),
  })

  async function onSubmit(data: PackageFormData) {
    const input: PackageInput = {
      name: data.name.trim(),
      seats: data.seats.trim() ? Number(data.seats) : null,
      listPriceStandard: moneyInputToApi(data.listPriceStandard),
      listPriceIntelligence: moneyInputToApi(data.listPriceIntelligence),
      listExtraSeatPriceStandard: moneyInputToApi(data.listExtraSeatPriceStandard),
      listExtraSeatPriceIntelligence: moneyInputToApi(data.listExtraSeatPriceIntelligence),
      sortOrder: Number(data.sortOrder),
    }
    try {
      if (mode === 'edit' && pkg) {
        await updatePackage.mutateAsync({ id: pkg.id, ...input })
        toast.success('Pacote salvo.')
      } else {
        await createPackage.mutateAsync({ code: data.code.trim(), ...input })
        toast.success('Pacote criado.')
      }
      onClose()
    } catch (err: unknown) {
      if (getApiErrorCode(err) === 'PACKAGE_CODE_TAKEN') {
        setError('code', {
          message: getApiErrorMessage(err, 'Já existe um pacote com este código'),
        })
        return
      }
      toast.error(getApiErrorMessage(err, 'Erro ao salvar o pacote.'))
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={mode === 'create' ? 'Novo pacote' : 'Editar pacote'}
      className="max-w-xl"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        <div className={GRID}>
          <FormField
            label="Código *"
            mono
            placeholder="P50"
            readOnly={mode === 'edit'}
            hint={mode === 'edit' ? 'não muda depois de criado' : 'ex.: P50 ou UNLIMITED'}
            error={errors.code?.message}
            {...register('code', {
              onChange: (e) => setValue('code', e.target.value.toUpperCase()),
            })}
          />
          <FormField label="Nome *" error={errors.name?.message} {...register('name')} />
          <FormField
            label="Licenças"
            inputMode="numeric"
            hint="vazio = quantidade definida no contrato"
            error={errors.seats?.message}
            {...register('seats')}
          />
          <FormField
            label="Ordem na lista"
            inputMode="numeric"
            error={errors.sortOrder?.message}
            {...register('sortOrder')}
          />
        </div>

        <p className={`${SECTION_TITLE} pt-2`}>Preço de tabela do pacote (R$/mês)</p>
        <div className={GRID}>
          <FormField
            label="Padrão"
            inputMode="decimal"
            placeholder="Opcional"
            error={errors.listPriceStandard?.message}
            {...register('listPriceStandard')}
          />
          <FormField
            label="Com Inteligência"
            inputMode="decimal"
            placeholder="Opcional"
            error={errors.listPriceIntelligence?.message}
            {...register('listPriceIntelligence')}
          />
        </div>

        <p className={`${SECTION_TITLE} pt-2`}>Licença adicional (R$/mês, por licença)</p>
        <div className={GRID}>
          <FormField
            label="Padrão"
            inputMode="decimal"
            placeholder="Opcional"
            error={errors.listExtraSeatPriceStandard?.message}
            {...register('listExtraSeatPriceStandard')}
          />
          <FormField
            label="Com Inteligência"
            inputMode="decimal"
            placeholder="Opcional"
            error={errors.listExtraSeatPriceIntelligence?.message}
            {...register('listExtraSeatPriceIntelligence')}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button type="submit" loading={isSubmitting} className="flex-1">
            {mode === 'create' ? 'Criar pacote' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
