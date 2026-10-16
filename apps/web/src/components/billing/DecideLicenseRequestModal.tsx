'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import type { LicenseRequestDto } from '@addere/types'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { useDecideLicenseRequest } from '@/hooks/useBilling'
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api'

// Aprovar ou recusar um pedido de licenças (plano 015, SUPERADMIN). A
// aprovação mostra o que o cliente aceitou (a declaração, o IP e o começo do
// hash); a recusa exige o motivo, que o ADMIN vê no /plano. Os 409 da API
// (AMENDMENT_PENDING, LICENSE_PRICE_CHANGED, AMENDMENT_NOT_YET_EFFECTIVE,
// LICENSE_REQUEST_ALREADY_DECIDED) aparecem com a mensagem dela.

export type LicenseDecision = 'APPROVE' | 'REJECT'

const REASON_MIN = 3
const REASON_MAX = 500

export function DecideLicenseRequestModal({
  request,
  decision,
  onClose,
}: {
  request: LicenseRequestDto
  decision: LicenseDecision
  onClose: () => void
}) {
  const decide = useDecideLicenseRequest()
  const [reason, setReason] = useState('')
  const reasonOk = reason.trim().length >= REASON_MIN
  const approving = decision === 'APPROVE'

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!approving && !reasonOk) return
    decide.mutate(
      approving
        ? { id: request.id, decision: 'APPROVE' }
        : { id: request.id, decision: 'REJECT', reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(approving ? 'Pedido aprovado: licenças liberadas.' : 'Pedido recusado.')
          onClose()
        },
        onError: (err) => {
          toast.error(getApiErrorMessage(err, 'Erro ao decidir o pedido.'))
          // Outro superadmin decidiu antes: a lista recarrega e o modal fecha
          if (getApiErrorCode(err) === 'LICENSE_REQUEST_ALREADY_DECIDED') onClose()
        },
      }
    )
  }

  const seatsLabel = request.quantity === 1 ? '1 licença' : `${request.quantity} licenças`

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={approving ? 'Aprovar pedido de licenças' : 'Recusar pedido de licenças'}
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">{request.companyName}</span> ·{' '}
          {seatsLabel} {request.quantity === 1 ? 'pedida' : 'pedidas'} por {request.requestedByName}
        </p>

        {approving ? (
          <>
            <p className="text-sm text-[var(--text-primary)]">
              Aprovar libera {seatsLabel} agora e cria uma nova versão dos termos (origem: pedido de
              licenças). A cobrança começa na competência seguinte.
            </p>
            <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2">
              <p className="text-xs font-medium text-[var(--text-muted)]">Declaração aceita</p>
              <p className="text-sm text-[var(--text-primary)]">{request.declarationText}</p>
              <p className="text-xs text-[var(--text-muted)]">
                IP {request.requestedIp ?? '—'} · SHA-256{' '}
                <span className="font-mono">{request.declarationSha256?.slice(0, 12) ?? '—'}</span>…
              </p>
            </div>
          </>
        ) : (
          <Textarea
            label="Motivo da recusa"
            value={reason}
            maxLength={REASON_MAX}
            onChange={(e) => setReason(e.target.value)}
            hint="O administrador da empresa vê este motivo em Plano e cobrança."
          />
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant={approving ? 'primary' : 'danger'}
            loading={decide.isPending}
            disabled={!approving && !reasonOk}
          >
            {approving ? 'Aprovar' : 'Recusar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
