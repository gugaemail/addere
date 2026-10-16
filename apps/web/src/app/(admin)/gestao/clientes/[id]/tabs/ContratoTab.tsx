'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  DUE_DAY_MAX,
  DUE_DAY_MIN,
  LICENSE_TYPES,
  formatBillingDate,
  formatCompetence,
  type ClientDetailDto,
  type CompanyContractDto,
  type ContractDraftInput,
  type ContractTermsDto,
  type LicenseType,
} from '@addere/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FormField, FormSelect } from '@/components/ui/FormField'
import { Table, type Column } from '@/components/ui/Table'
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  LICENSE_TYPE_LABELS,
  TERMS_STATUS_LABELS,
  acceptancePreview,
  currentTermsOf,
  draftMonthlyTotal,
  listPricesFor,
  moneyApiToInput,
  moneyInputToApi,
  proposedTermsOf,
  todayInSaoPaulo,
} from '@/lib/billing-ui'
import { contractDraftFormSchema, type ContractDraftFormData } from '@/lib/schemas'
import {
  billingKeys,
  useBillingSettings,
  usePackages,
  useSaveContractDraft,
} from '@/hooks/useBilling'

const SECTION_TITLE = 'text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide'
const LABEL = 'mb-1.5 block text-sm font-medium text-[var(--text-secondary)]'
const DUE_DAYS = Array.from({ length: DUE_DAY_MAX - DUE_DAY_MIN + 1 }, (_, i) => DUE_DAY_MIN + i)

// O rascunho edita a proposta em aberto; contrato que já saiu do rascunho
// mostra, só leitura, a proposta ou os termos em vigor
function defaultsFor(contract: CompanyContractDto | null): ContractDraftFormData {
  const t = proposedTermsOf(contract) ?? currentTermsOf(contract, new Date())
  return {
    packageId: t?.packageId ?? '',
    licenseType: t?.licenseType ?? 'STANDARD',
    includedSeats: t ? String(t.includedSeats) : '',
    extraSeats: String(t?.extraSeats ?? 0),
    packagePrice: moneyApiToInput(t?.packagePrice),
    extraSeatPrice: moneyApiToInput(t?.extraSeatPrice),
    graceMonths: String(contract?.graceMonths ?? 0),
    dueDay: String(contract?.dueDay ?? DUE_DAY_MAX),
    useDefaultBlockDays: (contract?.overdueBlockDays ?? null) === null,
    overdueBlockDays: contract?.overdueBlockDays != null ? String(contract.overdueBlockDays) : '',
    reason: t?.reason ?? '',
  }
}

const versionColumns: Column<ContractTermsDto>[] = [
  { key: 'version', header: 'Versão', render: (t) => `v${t.version}` },
  { key: 'status', header: 'Status', render: (t) => TERMS_STATUS_LABELS[t.status] },
  {
    key: 'package',
    header: 'Pacote e tipo',
    render: (t) => `${t.packageName} · ${LICENSE_TYPE_LABELS[t.licenseType]}`,
  },
  {
    key: 'seats',
    header: 'Licenças',
    className: 'whitespace-nowrap',
    render: (t) => `${t.includedSeats} + ${t.extraSeats}`,
  },
  {
    key: 'total',
    header: 'Total mensal',
    className: 'whitespace-nowrap',
    render: (t) => formatCurrency(t.monthlyTotal),
  },
  { key: 'author', header: 'Autor', render: (t) => t.createdByName ?? '—' },
  {
    key: 'date',
    header: 'Data',
    className: 'whitespace-nowrap',
    render: (t) => formatDate(t.createdAt),
  },
]

// Aba Contrato da ficha (plano 013). Só o DRAFT é editável; enviar para aceite,
// pré-visualizar e propor aditivo são do plano 014.
export function ContratoTab({ client }: { client: ClientDetailDto }) {
  const queryClient = useQueryClient()
  const contract = client.contract
  const isDraft = !contract || contract.status === 'DRAFT'

  const { data: packages = [], isLoading: loadingPackages } = usePackages()
  const { data: settings } = useBillingSettings()
  const save = useSaveContractDraft(client.company.id)

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    setError,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ContractDraftFormData>({
    resolver: zodResolver(contractDraftFormSchema),
    defaultValues: defaultsFor(contract),
  })

  const values = watch()
  const selected = packages.find((p) => p.id === values.packageId) ?? null
  const fixedSeats = selected?.seats ?? null
  const listPrices = selected ? listPricesFor(selected, values.licenseType) : null
  // Pacote desativado continua na lista se o rascunho o usa (a API recusa salvar)
  const packageOptions = packages.filter((p) => p.active || p.id === values.packageId)

  const total = draftMonthlyTotal(values)
  const now = new Date()
  const preview = acceptancePreview(values, now)
  const graceMonths = Number(values.graceMonths)

  // Trocar o pacote ou o tipo traz o preço de tabela, quando existe; os campos
  // continuam editáveis. No Ilimitado o valor do pacote não é pré-preenchido,
  // porque a quantidade varia (decisão de desenho 3).
  function applyPackage(packageId: string, licenseType: LicenseType, packageChanged: boolean) {
    const pkg = packages.find((p) => p.id === packageId)
    if (!pkg) return
    if (pkg.seats !== null) setValue('includedSeats', String(pkg.seats))
    else if (packageChanged) setValue('includedSeats', '')
    const list = listPricesFor(pkg, licenseType)
    if (pkg.seats !== null && list.packagePrice) {
      setValue('packagePrice', moneyApiToInput(list.packagePrice), { shouldValidate: true })
    }
    if (list.extraSeatPrice) {
      setValue('extraSeatPrice', moneyApiToInput(list.extraSeatPrice), { shouldValidate: true })
    }
  }

  async function onSubmit(data: ContractDraftFormData) {
    const pkg = packages.find((p) => p.id === data.packageId)
    if (!pkg) {
      setError('packageId', { message: 'Escolha o pacote' })
      return
    }
    const openSeats = pkg.seats === null
    if (openSeats && !data.includedSeats.trim()) {
      setError('includedSeats', { message: 'Informe a quantidade de licenças do pacote' })
      return
    }
    const input: ContractDraftInput = {
      packageId: pkg.id,
      licenseType: data.licenseType,
      includedSeats: openSeats ? Number(data.includedSeats) : undefined,
      extraSeats: Number(data.extraSeats),
      packagePrice: moneyInputToApi(data.packagePrice) ?? '',
      extraSeatPrice: moneyInputToApi(data.extraSeatPrice) ?? '',
      graceMonths: Number(data.graceMonths),
      dueDay: Number(data.dueDay),
      overdueBlockDays: data.useDefaultBlockDays ? null : Number(data.overdueBlockDays),
      reason: data.reason.trim() || null,
    }
    try {
      const saved = await save.mutateAsync(input)
      reset(defaultsFor(saved))
      toast.success('Rascunho salvo.')
    } catch (err: unknown) {
      const code = getApiErrorCode(err)
      const message = getApiErrorMessage(err, 'Erro ao salvar o rascunho.')
      if (code === 'CONTRACT_NOT_DRAFT') {
        toast.error(message)
        await queryClient.invalidateQueries({ queryKey: billingKeys.all })
      } else if (code === 'PACKAGE_INACTIVE') {
        setError('packageId', { message })
      } else if (code === 'INCLUDED_SEATS_REQUIRED') {
        setError('includedSeats', { message })
      } else {
        toast.error(message)
      }
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-4 sm:p-6">
        <p className="mb-4 text-sm font-medium text-[var(--text-primary)]">
          {isDraft
            ? 'Rascunho — o cliente ainda não vê este contrato.'
            : 'Este contrato já saiu do rascunho.'}
        </p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          {/* Fora do rascunho, tudo fica só de leitura */}
          <fieldset disabled={!isDraft} className="space-y-5">
            <section className="space-y-3">
              <p className={SECTION_TITLE}>Pacote</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormSelect
                  label="Pacote"
                  error={errors.packageId?.message}
                  {...register('packageId', {
                    onChange: (e) => applyPackage(e.target.value, getValues('licenseType'), true),
                  })}
                >
                  <option value="">{loadingPackages ? 'Carregando…' : 'Escolha o pacote'}</option>
                  {packageOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.seats !== null ? ` (${p.seats} licenças)` : ' (quantidade no contrato)'}
                      {p.active ? '' : ' (desativado)'}
                    </option>
                  ))}
                </FormSelect>
                <fieldset>
                  <legend className={LABEL}>Tipo de licença</legend>
                  <div className="flex flex-wrap gap-x-5 gap-y-2 pt-2">
                    {LICENSE_TYPES.map((type) => (
                      <label
                        key={type}
                        className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-primary)]"
                      >
                        <input
                          type="radio"
                          value={type}
                          className="h-4 w-4 cursor-pointer accent-brand"
                          {...register('licenseType', {
                            onChange: (e) =>
                              applyPackage(
                                getValues('packageId'),
                                e.target.value as LicenseType,
                                false
                              ),
                          })}
                        />
                        {LICENSE_TYPE_LABELS[type]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <FormField
                  label="Licenças incluídas"
                  inputMode="numeric"
                  readOnly={fixedSeats !== null || !selected}
                  hint={
                    !selected
                      ? 'Escolha o pacote'
                      : fixedSeats !== null
                        ? 'vem do pacote'
                        : 'digitada no contrato (ex.: 100)'
                  }
                  error={errors.includedSeats?.message}
                  {...register('includedSeats')}
                />
                <FormField
                  label="Valor do pacote (R$/mês)"
                  inputMode="decimal"
                  placeholder="0,00"
                  hint={
                    fixedSeats !== null && listPrices?.packagePrice
                      ? `tabela: ${formatCurrency(listPrices.packagePrice)}`
                      : undefined
                  }
                  error={errors.packagePrice?.message}
                  {...register('packagePrice')}
                />
                <FormField
                  label="Licenças adicionais"
                  inputMode="numeric"
                  error={errors.extraSeats?.message}
                  {...register('extraSeats')}
                />
                <FormField
                  label="Preço do adicional (R$/mês)"
                  inputMode="decimal"
                  placeholder="0,00"
                  hint={
                    listPrices?.extraSeatPrice
                      ? `tabela: ${formatCurrency(listPrices.extraSeatPrice)}`
                      : undefined
                  }
                  error={errors.extraSeatPrice?.message}
                  {...register('extraSeatPrice')}
                />
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                Total mensal{' '}
                <span className="font-semibold text-[var(--text-primary)]">
                  {total ? formatCurrency(total) : '—'}
                </span>
              </p>
            </section>

            <section className="space-y-3">
              <p className={SECTION_TITLE}>Cobrança</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  label="Carência (meses)"
                  inputMode="numeric"
                  hint="0 = sem carência"
                  error={errors.graceMonths?.message}
                  {...register('graceMonths')}
                />
                <FormSelect
                  label="Dia de vencimento"
                  error={errors.dueDay?.message}
                  {...register('dueDay')}
                >
                  {DUE_DAYS.map((d) => (
                    <option key={d} value={String(d)}>
                      {d}
                    </option>
                  ))}
                </FormSelect>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer rounded border-[var(--border)] accent-brand focus:ring-brand"
                      {...register('useDefaultBlockDays')}
                    />
                    usar o padrão ({settings ? `${settings.overdueBlockDays} dias` : '…'})
                  </label>
                  <FormField
                    label="Dias para suspender"
                    inputMode="numeric"
                    readOnly={values.useDefaultBlockDays}
                    className={values.useDefaultBlockDays ? 'opacity-40' : undefined}
                    hint="Dias de atraso até a suspensão, quando o faturamento estiver ligado"
                    error={errors.overdueBlockDays?.message}
                    {...register('overdueBlockDays')}
                  />
                </div>
                <FormField
                  label="Observação"
                  placeholder="Opcional"
                  error={errors.reason?.message}
                  {...register('reason')}
                />
              </div>
            </section>

            {isDraft && preview && (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3 text-sm">
                <p className="font-medium text-[var(--text-primary)]">
                  Se aceito hoje ({todayInSaoPaulo(now)})
                </p>
                <p className="mt-1 text-[var(--text-secondary)]">
                  1ª competência cobrada {formatCompetence(preview.firstBilledCompetence)} · 1ª
                  fatura vence em {formatBillingDate(preview.firstDueDate)}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  O mês do aceite não é cobrado.
                  {graceMonths > 0 &&
                    ` Depois dele, ${graceMonths} ${graceMonths === 1 ? 'mês' : 'meses'} de carência.`}
                </p>
              </div>
            )}

            {isDraft && (
              <div className="flex justify-end">
                <Button type="submit" loading={isSubmitting}>
                  Salvar rascunho
                </Button>
              </div>
            )}
          </fieldset>
        </form>
      </Card>

      <section className="space-y-2">
        <p className={SECTION_TITLE}>Versões dos termos</p>
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-card">
          <Table
            columns={versionColumns}
            data={contract?.terms ?? []}
            rowKey={(t) => t.id}
            className="rounded-none"
            emptyMessage="Nenhuma versão: salve o rascunho para criar a primeira."
          />
        </div>
      </section>
    </div>
  )
}
