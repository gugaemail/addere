'use client'

import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { useUnblockClient } from '@/hooks/useBilling'
import { getApiErrorMessage } from '@/lib/api'
import { todayYmdSaoPaulo, unblockDateRange, unblockUntilError } from '@/lib/company-block'

// "Liberar até…" (plano 017): a única ação de acesso da ficha. Com data, o
// bloqueio por atraso não volta até o fim daquele dia (São Paulo); sem data,
// ele volta no próximo ciclo se a fatura continuar vencida. Não existe o
// "Bloquear": o bloqueio manual está desabilitado.
export function UnblockClientModal({
  companyId,
  onClose,
}: {
  companyId: string
  onClose: () => void
}) {
  const unblock = useUnblockClient(companyId)
  const todayYmd = todayYmdSaoPaulo()
  const range = unblockDateRange(todayYmd)
  const schema = useMemo(
    () =>
      z.object({
        until: z.string().superRefine((value, ctx) => {
          const error = unblockUntilError(value, todayYmd)
          if (error) ctx.addIssue({ code: 'custom', message: error })
        }),
      }),
    [todayYmd]
  )
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ until: string }>({ resolver: zodResolver(schema), defaultValues: { until: '' } })

  async function onSubmit({ until }: { until: string }) {
    try {
      const result = await unblock.mutateAsync(until ? { until } : {})
      if (result.emailSent === false) toast.warning('Liberado, mas o e-mail não saiu.')
      else toast.success('Acesso liberado.')
      onClose()
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Erro ao liberar o acesso.'))
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Liberar acesso">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          label="Liberar até (opcional)"
          type="date"
          min={range.min}
          max={range.max}
          error={errors.until?.message}
          hint="Até essa data o bloqueio por atraso não volta. Sem data, ele volta no próximo ciclo (até 1 hora) se a fatura continuar vencida."
          {...register('until')}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={isSubmitting}>
            Liberar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
