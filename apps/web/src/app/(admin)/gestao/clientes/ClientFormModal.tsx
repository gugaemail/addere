'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { BRAZIL_UFS, type ClientDetailDto, type ClientInput } from '@addere/types'
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api'
import { maskCEP, maskDocument } from '@/lib/utils'
import { clientFormSchema, type ClientFormData } from '@/lib/schemas'
import { useCreateClient, useUpdateClient } from '@/hooks/useBilling'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { FormField, FormSelect } from '@/components/ui/FormField'
import { Textarea } from '@/components/ui/Textarea'

// Igual ao de empresas/[id]/EntityModals.tsx (copiado, não importado)
const SECTION_TITLE = 'text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide'
// Duas colunas a partir de sm; uma no celular (o plano 008 corrigiu modais a 390 px)
const GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2'

interface ClientFormModalProps {
  mode: 'create' | 'edit'
  /** Obrigatório no modo edit */
  client?: ClientDetailDto
  onClose: () => void
}

function defaultsFor(client: ClientDetailDto | undefined): ClientFormData {
  const p = client?.profile
  return {
    name: client?.company.name ?? '',
    cnpj: client?.company.cnpj ?? '',
    idProtheus: client?.company.idProtheus ?? '',
    stateRegistration: p?.stateRegistration ?? '',
    // Empresa criada antes do cadastro comercial: a razão social começa com o nome
    legalName: p?.legalName ?? client?.company.name ?? '',
    tradeName: p?.tradeName ?? '',
    addressStreet: p?.addressStreet ?? '',
    addressNumber: p?.addressNumber ?? '',
    addressComplement: p?.addressComplement ?? '',
    addressDistrict: p?.addressDistrict ?? '',
    addressCity: p?.addressCity ?? '',
    addressState: p?.addressState ?? '',
    addressZip: maskCEP(p?.addressZip ?? ''),
    legalRepName: p?.legalRepName ?? '',
    legalRepCpf: maskDocument(p?.legalRepCpf ?? ''),
    legalRepRole: p?.legalRepRole ?? '',
    contactName: p?.contactName ?? '',
    contactEmail: p?.contactEmail ?? '',
    contactPhone: p?.contactPhone ?? '',
    billingContactName: p?.billingContactName ?? '',
    billingEmail: p?.billingEmail ?? '',
    billingPhone: p?.billingPhone ?? '',
    notes: p?.notes ?? '',
  }
}

// String vazia vira null; CPF e CEP vão só com dígitos
const text = (v: string | undefined) => (v?.trim() ? v.trim() : null)
const digits = (v: string | undefined) => (v ?? '').replace(/\D/g, '') || null

function toInput(data: ClientFormData): ClientInput {
  return {
    name: data.name.trim(),
    cnpj: data.cnpj.trim(),
    idProtheus: text(data.idProtheus),
    profile: {
      legalName: data.legalName.trim(),
      tradeName: text(data.tradeName),
      stateRegistration: text(data.stateRegistration),
      addressStreet: text(data.addressStreet),
      addressNumber: text(data.addressNumber),
      addressComplement: text(data.addressComplement),
      addressDistrict: text(data.addressDistrict),
      addressCity: text(data.addressCity),
      addressState: text(data.addressState),
      addressZip: digits(data.addressZip),
      legalRepName: text(data.legalRepName),
      legalRepCpf: digits(data.legalRepCpf),
      legalRepRole: text(data.legalRepRole),
      contactName: text(data.contactName),
      contactEmail: text(data.contactEmail),
      contactPhone: text(data.contactPhone),
      billingContactName: text(data.billingContactName),
      billingEmail: text(data.billingEmail),
      billingPhone: text(data.billingPhone),
      notes: text(data.notes),
    },
  }
}

// Novo cliente e edição do cadastro comercial (o mesmo modal). No create, a
// empresa nasce pelo POST /companies e a tela segue para a ficha do cliente.
export function ClientFormModal({ mode, client, onClose }: ClientFormModalProps) {
  const router = useRouter()
  const createClient = useCreateClient()
  const updateClient = useUpdateClient(client?.company.id ?? '')

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormData>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: defaultsFor(mode === 'edit' ? client : undefined),
  })

  async function onSubmit(data: ClientFormData) {
    try {
      const input = toInput(data)
      if (mode === 'edit' && client) {
        await updateClient.mutateAsync(input)
        toast.success('Cadastro salvo.')
        onClose()
      } else {
        const created = await createClient.mutateAsync(input)
        toast.success('Cliente cadastrado.')
        onClose()
        router.push(`/gestao/clientes/${created.id}`)
      }
    } catch (err: unknown) {
      if (getApiErrorCode(err) === 'CNPJ_TAKEN') {
        setError('cnpj', {
          message: getApiErrorMessage(err, 'Já existe uma empresa com este CNPJ'),
        })
        return
      }
      toast.error(getApiErrorMessage(err, 'Erro ao salvar o cliente.'))
    }
  }

  const title =
    mode === 'create' ? 'Novo cliente' : client?.profile ? 'Editar cadastro' : 'Preencher cadastro'

  return (
    <Modal isOpen onClose={onClose} title={title} className="max-w-2xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        <p className={SECTION_TITLE}>Empresa</p>
        <div className={GRID}>
          <FormField label="Nome no sistema *" error={errors.name?.message} {...register('name')} />
          <FormField
            label="CNPJ *"
            placeholder="00.000.000/0000-00"
            inputMode="numeric"
            error={errors.cnpj?.message}
            {...register('cnpj', {
              onChange: (e) => setValue('cnpj', maskDocument(e.target.value)),
            })}
          />
          <FormField
            label="Código Protheus"
            placeholder="Opcional"
            error={errors.idProtheus?.message}
            {...register('idProtheus')}
          />
          <FormField
            label="Inscrição estadual"
            placeholder="Opcional ou ISENTO"
            {...register('stateRegistration')}
          />
          <FormField
            label="Razão social *"
            error={errors.legalName?.message}
            {...register('legalName')}
          />
          <FormField label="Nome fantasia" placeholder="Opcional" {...register('tradeName')} />
        </div>

        <p className={`${SECTION_TITLE} pt-2`}>Endereço</p>
        <div className={GRID}>
          <FormField label="Logradouro" {...register('addressStreet')} />
          <FormField label="Número" {...register('addressNumber')} />
          <FormField label="Complemento" {...register('addressComplement')} />
          <FormField label="Bairro" {...register('addressDistrict')} />
          <FormField label="Cidade" {...register('addressCity')} />
          <div className="grid grid-cols-2 gap-3">
            <FormSelect label="UF" {...register('addressState')}>
              <option value="">—</option>
              {BRAZIL_UFS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </FormSelect>
            <FormField
              label="CEP"
              placeholder="00000-000"
              inputMode="numeric"
              error={errors.addressZip?.message}
              {...register('addressZip', {
                onChange: (e) => setValue('addressZip', maskCEP(e.target.value)),
              })}
            />
          </div>
        </div>

        <p className={`${SECTION_TITLE} pt-2`}>Representante legal (vai no contrato)</p>
        <div className={GRID}>
          <FormField label="Nome" {...register('legalRepName')} />
          <FormField
            label="CPF"
            placeholder="000.000.000-00"
            inputMode="numeric"
            error={errors.legalRepCpf?.message}
            {...register('legalRepCpf', {
              // CPF: no máximo 11 dígitos, senão a máscara vira a de CNPJ
              onChange: (e) =>
                setValue(
                  'legalRepCpf',
                  maskDocument(e.target.value.replace(/\D/g, '').slice(0, 11))
                ),
            })}
          />
          <FormField label="Cargo" {...register('legalRepRole')} />
        </div>

        <p className={`${SECTION_TITLE} pt-2`}>Contato principal</p>
        <div className={GRID}>
          <FormField label="Nome" {...register('contactName')} />
          <FormField
            label="E-mail"
            type="email"
            error={errors.contactEmail?.message}
            {...register('contactEmail')}
          />
          <FormField label="Telefone" type="tel" {...register('contactPhone')} />
        </div>

        <p className={`${SECTION_TITLE} pt-2`}>Cobrança (recebe as faturas)</p>
        <div className={GRID}>
          <FormField label="Nome" {...register('billingContactName')} />
          <FormField
            label="E-mail"
            type="email"
            error={errors.billingEmail?.message}
            {...register('billingEmail')}
          />
          <FormField label="Telefone" type="tel" {...register('billingPhone')} />
        </div>

        <p className={`${SECTION_TITLE} pt-2`}>Observações (só a Addere vê)</p>
        <Textarea
          aria-label="Observações"
          rows={3}
          error={errors.notes?.message}
          {...register('notes')}
        />

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button type="submit" loading={isSubmitting} className="flex-1">
            {mode === 'create' ? 'Criar cliente' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
