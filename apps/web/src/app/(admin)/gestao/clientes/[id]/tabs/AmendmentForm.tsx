'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  LICENSE_TYPES,
  civilDaySaoPaulo,
  civilYmd,
  formatYmd,
  isPriceIncrease,
  minimumEffectiveDate,
  type AmendmentInput,
  type ClientDetailDto,
  type ClientDocumentsDto,
  type LicenseType,
} from '@addere/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FormField, FormSelect } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import {
  LICENSE_TYPE_LABELS,
  currentTermsOf,
  draftMonthlyTotal,
  listPricesFor,
  moneyApiToInput,
  moneyInputToApi,
} from '@/lib/billing-ui'
import { amendmentFormSchema, type AmendmentFormData } from '@/lib/schemas'
import { usePackages } from '@/hooks/useBilling'
import { useSaveAmendment, useWithdrawAmendment } from '@/hooks/useContracts'

const SECTION_TITLE = 'text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide'
const LABEL = 'mb-1.5 block text-sm font-medium text-[var(--text-secondary)]'
const CHECKBOX =
  'h-4 w-4 cursor-pointer rounded border-[var(--border)] accent-brand focus:ring-brand'

function defaultsFor(client: ClientDetailDto, docs: ClientDocumentsDto): AmendmentFormData {
  const contract = client.contract
  // O aditivo proposto, se houver; senão parte dos termos em vigor
  const proposed =
    contract?.terms.find((t) => t.status === 'PROPOSED' && t.origin === 'AMENDMENT') ?? null
  const t = proposed ?? currentTermsOf(contract, new Date())
  return {
    packageId: t?.packageId ?? '',
    licenseType: t?.licenseType ?? 'STANDARD',
    includedSeats: t ? String(t.includedSeats) : '',
    extraSeats: String(t?.extraSeats ?? 0),
    packagePrice: moneyApiToInput(t?.packagePrice),
    extraSeatPrice: moneyApiToInput(t?.extraSeatPrice),
    proposedEffectiveFrom: proposed ? (docs.amendment?.proposedEffectiveFrom ?? '') : '',
    reason: proposed?.reason ?? '',
    requestedByClient: proposed ? (docs.amendment?.requestedByClient ?? false) : false,
    carryConditions: false,
  }
}

/**
 * Propor aditivo (plano 014), só com contrato ACTIVE. Aumento de preço (valor
 * do pacote ou do adicional) ou condições gerais novas exigem "vale a partir
 * de" de no mínimo 30 dias, salvo a pedido da Empresa (decisão de desenho 7);
 * a API confere de novo ao salvar e ao enviar.
 */
export function AmendmentForm({
  client,
  docs,
  onCarryConditionsChange,
}: {
  client: ClientDetailDto
  docs: ClientDocumentsDto
  onCarryConditionsChange: (carry: boolean) => void
}) {
  const companyId = client.company.id
  const { data: packages = [] } = usePackages()
  const save = useSaveAmendment(companyId)
  const withdraw = useWithdrawAmendment(companyId)
  const [confirmWithdraw, setConfirmWithdraw] = useState(false)
  const hasProposal = !!docs.amendment

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AmendmentFormData>({
    resolver: zodResolver(amendmentFormSchema),
    defaultValues: defaultsFor(client, docs),
  })

  const values = watch()
  const selected = packages.find((p) => p.id === values.packageId) ?? null
  const fixedSeats = selected?.seats ?? null
  const packageOptions = packages.filter((p) => p.active || p.id === values.packageId)
  const total = draftMonthlyTotal(values)
  const { acceptedVersion, latestPublishedVersion } = docs.conditions
  const newConditions =
    latestPublishedVersion !== null &&
    (acceptedVersion === null || latestPublishedVersion > acceptedVersion)

  // Aviso ao vivo do aumento de preço e da data mínima
  const current = currentTermsOf(client.contract, new Date())
  const proposedPrices = {
    packagePrice: moneyInputToApi(values.packagePrice),
    extraSeatPrice: moneyInputToApi(values.extraSeatPrice),
  }
  const increase =
    current && proposedPrices.packagePrice !== null && proposedPrices.extraSeatPrice !== null
      ? isPriceIncrease(
          current,
          {
            packagePrice: proposedPrices.packagePrice,
            extraSeatPrice: proposedPrices.extraSeatPrice,
          },
          values.carryConditions
        )
      : values.carryConditions
  const noticeRequired = values.carryConditions || (increase && !values.requestedByClient)
  const minimum = minimumEffectiveDate(civilYmd(civilDaySaoPaulo(new Date())))

  // Mesmo pré-preenchimento pela tabela do rascunho do 013
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

  async function onSubmit(data: AmendmentFormData) {
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
    const input: AmendmentInput = {
      packageId: pkg.id,
      licenseType: data.licenseType,
      includedSeats: openSeats ? Number(data.includedSeats) : undefined,
      extraSeats: Number(data.extraSeats),
      packagePrice: moneyInputToApi(data.packagePrice) ?? '',
      extraSeatPrice: moneyInputToApi(data.extraSeatPrice) ?? '',
      proposedEffectiveFrom: data.proposedEffectiveFrom || null,
      reason: data.reason.trim(),
      requestedByClient: data.requestedByClient,
      carryConditions: data.carryConditions,
      // A versão que a tela mostra: se o cliente aceitou no meio, a API recusa
      // (409 TERMS_NOT_EDITABLE) em vez de criar outra proposta
      termsVersion: docs.amendment?.version ?? null,
    }
    try {
      const result = await save.mutateAsync(input)
      toast.success(
        result.changed
          ? `Aditivo v${result.termsVersion} salvo. Agora envie para aceite.`
          : 'Nada mudou no aditivo.'
      )
    } catch (err) {
      const code = getApiErrorCode(err)
      const message = getApiErrorMessage(err, 'Erro ao salvar o aditivo.')
      if (code === 'AMENDMENT_NOTICE_TOO_SHORT') setError('proposedEffectiveFrom', { message })
      else if (code === 'AMENDMENT_REASON_REQUIRED') setError('reason', { message })
      else if (code === 'PACKAGE_INACTIVE') setError('packageId', { message })
      else if (code === 'INCLUDED_SEATS_REQUIRED') setError('includedSeats', { message })
      else toast.error(message)
    }
  }

  async function handleWithdraw() {
    setConfirmWithdraw(false)
    try {
      await withdraw.mutateAsync()
      toast.success('Aditivo descartado.')
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao descartar o aditivo.'))
    }
  }

  return (
    <Card className="p-4 sm:p-6">
      <p className={SECTION_TITLE}>{hasProposal ? 'Aditivo proposto' : 'Propor aditivo'}</p>
      <p className="mb-4 mt-1 text-xs text-[var(--text-muted)]">
        Troca de pacote, de tipo ou de valor. Até o aceite do aditivo valem os termos atuais.
        {hasProposal && ' Salvar com o aditivo enviado cancela o envio.'}
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormSelect
            label="Pacote"
            error={errors.packageId?.message}
            {...register('packageId', {
              onChange: (e) => applyPackage(e.target.value, getValues('licenseType'), true),
            })}
          >
            <option value="">Escolha o pacote</option>
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
                        applyPackage(getValues('packageId'), e.target.value as LicenseType, false),
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
            hint={fixedSeats !== null ? 'vem do pacote' : 'digitada no contrato (ex.: 100)'}
            error={errors.includedSeats?.message}
            {...register('includedSeats')}
          />
          <FormField
            label="Valor do pacote (R$/mês)"
            inputMode="decimal"
            placeholder="0,00"
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
            error={errors.extraSeatPrice?.message}
            {...register('extraSeatPrice')}
          />
          <FormField
            label="Vale a partir de (opcional)"
            type="date"
            min={noticeRequired ? minimum : undefined}
            hint="Sem data, vale no aceite"
            error={errors.proposedEffectiveFrom?.message}
            {...register('proposedEffectiveFrom')}
          />
          <FormField
            label="Motivo"
            placeholder="Entra no texto do aditivo"
            maxLength={500}
            error={errors.reason?.message}
            {...register('reason')}
          />
        </div>

        <p className="text-sm text-[var(--text-secondary)]">
          Total mensal proposto{' '}
          <span className="font-semibold text-[var(--text-primary)]">
            {total ? formatCurrency(total) : '—'}
          </span>
          {current && <> · hoje {formatCurrency(current.monthlyTotal)}</>}
        </p>

        <div className="space-y-2">
          <label className="flex cursor-pointer items-start gap-2 text-sm text-[var(--text-primary)]">
            <input
              type="checkbox"
              className={`${CHECKBOX} mt-0.5`}
              {...register('requestedByClient')}
            />
            <span>
              A pedido da Empresa Contratante
              <span className="block text-xs text-[var(--text-muted)]">
                Vale no aceite mesmo com aumento de preço. Escreva no motivo o que a Empresa pediu.
              </span>
            </span>
          </label>
          {newConditions && (
            <label className="flex cursor-pointer items-start gap-2 text-sm text-[var(--text-primary)]">
              <input
                type="checkbox"
                className={`${CHECKBOX} mt-0.5`}
                {...register('carryConditions', {
                  onChange: (e) => onCarryConditionsChange(e.target.checked),
                })}
              />
              <span>
                Levar às condições gerais publicadas (v{latestPublishedVersion})
                <span className="block text-xs text-[var(--text-muted)]">
                  Só com um modelo de aditivo que preveja o anexo das condições gerais; o v1 não
                  prevê.
                </span>
              </span>
            </label>
          )}
        </div>

        {noticeRequired && (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-[var(--text-primary)]">
            {values.carryConditions ? 'Condições gerais novas' : 'Este aditivo aumenta o valor'}:
            vale a partir de, no mínimo, {formatYmd(minimum)}.
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {hasProposal && (
            <Button
              type="button"
              variant="danger-outline"
              onClick={() => setConfirmWithdraw(true)}
              disabled={withdraw.isPending}
            >
              Descartar aditivo
            </Button>
          )}
          <Button type="submit" loading={isSubmitting}>
            {hasProposal ? 'Salvar aditivo' : 'Propor aditivo'}
          </Button>
        </div>
      </form>

      <Modal
        isOpen={confirmWithdraw}
        onClose={() => setConfirmWithdraw(false)}
        title="Descartar o aditivo?"
        className="max-w-md"
      >
        <p className="text-sm text-[var(--text-secondary)]">
          Os termos propostos são descartados e, se o aditivo já foi enviado, o envio é cancelado.
          Os termos atuais continuam valendo.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setConfirmWithdraw(false)}>
            Voltar
          </Button>
          <Button variant="danger" onClick={handleWithdraw}>
            Descartar
          </Button>
        </div>
      </Modal>
    </Card>
  )
}
