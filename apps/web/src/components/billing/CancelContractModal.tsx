'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { civilDaySaoPaulo, formatBillingDate, type ClientDetailDto } from '@addere/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { ConfirmModal } from '@/app/(admin)/empresas/[id]/ConfirmModal'
import { useRevertContractCancel, useScheduleContractCancel } from '@/hooks/useInvoices'

// Encerramento do contrato (plano 016, §3.9 do contrato): sem fidelidade e sem
// multa. O contrato termina no último dia do mês do pedido, que é cobrado
// (decisão 6), e o cancelamento pode ser desfeito até esse dia (D8). Quem
// calcula a data que vale é a API, no fuso de São Paulo; o painel só mostra a
// prévia.

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** 'YYYY-MM-DD' → 'DD/MM/AAAA' (meia-noite UTC, como o formatador do 013 lê) */
const civilDay = (iso: string) => formatBillingDate(new Date(`${iso}T00:00:00.000Z`))

/** Instante ISO → o dia dele em São Paulo, 'DD/MM/AAAA' */
const daySaoPaulo = (iso: string) => formatBillingDate(civilDaySaoPaulo(new Date(iso)))

/** Prévia do fim: último dia do mês corrente em São Paulo */
function previewEnd(now: Date): { endsAt: Date; month: string; next: string } {
  const today = civilDaySaoPaulo(now)
  const year = today.getUTCFullYear()
  const month = today.getUTCMonth()
  return {
    endsAt: new Date(Date.UTC(year, month + 1, 0)),
    month: MONTHS[month],
    next: MONTHS[(month + 1) % 12],
  }
}

export function CancelContractModal({
  client,
  onClose,
}: {
  client: ClientDetailDto
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  // D7: quem cancela normalmente sai do produto
  const [deactivateCompany, setDeactivateCompany] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const schedule = useScheduleContractCancel(client.company.id)
  const preview = previewEnd(new Date())
  const name = client.profile?.legalName ?? client.company.name

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (reason.trim().length < 3) return setError('Informe o motivo (mínimo de 3 caracteres).')
    setError(null)
    schedule.mutate(
      { reason: reason.trim(), deactivateCompany },
      {
        onSuccess: ({ endsAt }) => {
          toast.success(`Cancelamento agendado: o contrato termina em ${civilDay(endsAt)}.`)
          onClose()
        },
      }
    )
  }

  return (
    <Modal isOpen onClose={onClose} title={`Cancelar contrato — ${name}`} className="max-w-lg">
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        O contrato termina em {formatBillingDate(preview.endsAt)}. {capitalize(preview.month)} será
        faturado em {preview.next}; de {preview.next} em diante, nada é cobrado.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Textarea
          label="Motivo"
          value={reason}
          maxLength={500}
          rows={3}
          placeholder="Cliente pediu por e-mail em DD/MM"
          onChange={(e) => setReason(e.target.value)}
          required
        />
        <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={deactivateCompany}
            onChange={(e) => setDeactivateCompany(e.target.checked)}
          />
          Desativar a empresa também, quando o contrato terminar
        </label>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Voltar
          </Button>
          <Button type="submit" variant="danger" loading={schedule.isPending}>
            Confirmar cancelamento
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** Bloco "Encerramento" da aba Contrato. Some em DRAFT e PENDING_ACCEPTANCE */
export function ContractEnding({ client }: { client: ClientDetailDto }) {
  const contract = client.contract
  const [showCancel, setShowCancel] = useState(false)
  const [confirmRevert, setConfirmRevert] = useState(false)
  const revert = useRevertContractCancel(client.company.id)

  if (!contract || (contract.status !== 'ACTIVE' && contract.status !== 'CANCELLED')) return null

  return (
    <Card className="space-y-2 p-4 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Encerramento
      </p>

      {contract.status === 'CANCELLED' && (
        <p className="text-sm text-[var(--text-secondary)]">
          {contract.endsAt
            ? `Contrato encerrado em ${civilDay(contract.endsAt)}.`
            : 'Contrato encerrado.'}
        </p>
      )}

      {contract.status === 'ACTIVE' && !contract.endsAt && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="max-w-xl text-sm text-[var(--text-secondary)]">
            Sem fidelidade e sem multa. O contrato termina no último dia do mês do pedido, e esse
            mês é cobrado.
          </p>
          <Button variant="danger-outline" onClick={() => setShowCancel(true)}>
            Cancelar contrato
          </Button>
        </div>
      )}

      {contract.status === 'ACTIVE' && contract.endsAt && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1 text-sm text-[var(--text-secondary)]">
            <p className="font-medium text-[var(--text-primary)]">
              Cancelamento agendado: o contrato termina em {civilDay(contract.endsAt)}.
            </p>
            {(contract.cancelRequestedAt || contract.cancelReason) && (
              <p>
                {contract.cancelRequestedAt
                  ? `Pedido em ${daySaoPaulo(contract.cancelRequestedAt)}`
                  : 'Pedido'}
                {contract.cancelReason ? ` · "${contract.cancelReason}"` : ''}
              </p>
            )}
            {contract.deactivateCompanyOnEnd && <p>A empresa será desativada no encerramento.</p>}
          </div>
          <Button
            variant="outline"
            loading={revert.isPending}
            onClick={() => setConfirmRevert(true)}
          >
            Desfazer
          </Button>
        </div>
      )}

      {showCancel && <CancelContractModal client={client} onClose={() => setShowCancel(false)} />}
      {confirmRevert && (
        <ConfirmModal
          title="Desfazer o cancelamento"
          description="O contrato volta a valer sem data de término. Documentos cancelados no agendamento não voltam: um aditivo precisa ser enviado de novo."
          confirmLabel="Desfazer cancelamento"
          destructive={false}
          onClose={() => setConfirmRevert(false)}
          onConfirm={() =>
            revert.mutate(undefined, {
              onSuccess: () => toast.success('Cancelamento desfeito: o contrato segue ativo.'),
            })
          }
        />
      )}
    </Card>
  )
}
