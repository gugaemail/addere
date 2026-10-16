'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { formatBrl, licenseRequestDeclaration } from '@addere/types'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { useCreateLicenseRequest } from '@/hooks/useBilling'
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api'
import { monthlyIncrease, parseLicenseQuantity } from '@/lib/seats'

// "Solicitar mais licenças" (plano 015). O pedido vale como contratação: a
// declaração sai de licenseRequestDeclaration, a mesma função que a API usa
// para gravar o texto e o hash, com o preço por licença dos termos atuais.

const MESSAGE_MAX = 500

export function LicenseRequestModal({
  extraSeatPrice,
  onClose,
  onChanged,
}: {
  /** Preço por licença dos termos atuais, '99.00' */
  extraSeatPrice: string
  onClose: () => void
  /** Recarrega o GET /billing/me (pedido criado, preço mudou, indicado mudou) */
  onChanged: () => void
}) {
  const create = useCreateLicenseRequest()
  const [quantityText, setQuantityText] = useState('1')
  const [message, setMessage] = useState('')

  const quantity = parseLicenseQuantity(quantityText)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (quantity === null) return
    create.mutate(
      {
        quantity,
        message: message.trim() || undefined,
        unitPriceShown: extraSeatPrice,
      },
      {
        onSuccess: () => {
          toast.success('Pedido enviado. A Addere avisa quando as licenças forem liberadas.')
          onChanged()
          onClose()
        },
        onError: (err) => {
          const code = getApiErrorCode(err)
          toast.error(getApiErrorMessage(err, 'Erro ao enviar o pedido.'))
          // Preço novo: o modal continua aberto e passa a mostrar o valor atual
          if (code === 'LICENSE_PRICE_CHANGED') onChanged()
          // Já há pedido, ou o indicado mudou com a página aberta
          if (code === 'LICENSE_REQUEST_PENDING' || code === 'NOT_DESIGNATED_ADMIN') {
            onChanged()
            onClose()
          }
        },
      }
    )
  }

  return (
    <Modal isOpen onClose={onClose} title="Solicitar mais licenças">
      <form onSubmit={submit} className="space-y-4">
        <FormField
          type="number"
          min={1}
          max={100}
          step={1}
          inputMode="numeric"
          label="Quantidade"
          value={quantityText}
          onChange={(e) => setQuantityText(e.target.value)}
          error={quantity === null ? 'De 1 a 100 licenças' : undefined}
        />

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-[var(--text-secondary)]">Valor por licença</dt>
          <dd className="text-right font-medium text-[var(--text-primary)]">
            {formatBrl(extraSeatPrice)} por mês
          </dd>
          <dt className="text-[var(--text-secondary)]">Aumento mensal</dt>
          <dd className="text-right font-medium text-[var(--text-primary)]">
            {quantity === null ? '—' : formatBrl(monthlyIncrease(quantity, extraSeatPrice))}
          </dd>
        </dl>

        <Textarea
          label="Mensagem (opcional)"
          value={message}
          maxLength={MESSAGE_MAX}
          onChange={(e) => setMessage(e.target.value)}
          hint={`${message.length}/${MESSAGE_MAX}`}
        />

        {quantity !== null && (
          <p className="rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm text-[var(--text-primary)]">
            {licenseRequestDeclaration(quantity, extraSeatPrice)}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={create.isPending} disabled={quantity === null}>
            Enviar pedido
          </Button>
        </div>
      </form>
    </Modal>
  )
}
