'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import {
  CONTRACT_DOCUMENT_KIND_LABELS,
  civilDaySaoPaulo,
  formatBillingDate,
  formatBrl,
  type MyTermsDto,
} from '@addere/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { AcceptDocumentPanel } from '@/components/contracts/AcceptDocumentPanel'
import { useAuth } from '@/contexts/AuthContext'
import { useMyBilling, useMyDocuments } from '@/hooks/useContracts'
import { getApiErrorMessage } from '@/lib/api'
import { CONTRACT_STATUS_LABELS, LICENSE_TYPE_LABELS } from '@/lib/billing-ui'
import { DOCUMENT_KIND_SHORT, formatDateTimeBrasilia } from '@/lib/contract-ui'

function termsLine(t: MyTermsDto): string {
  return `${t.packageName} · ${LICENSE_TYPE_LABELS[t.licenseType]} · ${t.includedSeats} licenças + ${t.extraSeats} adicionais`
}

// Contrato do ADMIN da empresa (plano 014): o contrato em vigor, o documento
// pendente (aceite só do administrador indicado) e os documentos aceitos.
export default function ContratoPage() {
  const { isSuperAdmin } = useAuth()
  const billing = useMyBilling(!isSuperAdmin)
  const documents = useMyDocuments(!isSuperAdmin)

  if (isSuperAdmin) {
    return (
      <Card className="max-w-2xl p-6">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Contratos</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Os contratos ficam na ficha do cliente, em Gestão Addere.
        </p>
        <Link
          href="/gestao/clientes"
          className="mt-3 inline-block text-sm font-medium text-brand hover:underline"
        >
          Ir para Clientes →
        </Link>
      </Card>
    )
  }

  if (billing.isLoading || documents.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    )
  }

  if (billing.error || documents.error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <p className="font-semibold text-danger">Erro ao carregar o contrato</p>
        <p className="text-sm text-[var(--text-muted)]">
          {getApiErrorMessage(billing.error ?? documents.error, 'Erro ao carregar o contrato')}
        </p>
        <Button
          onClick={() => {
            void billing.refetch()
            void documents.refetch()
          }}
        >
          Tentar novamente
        </Button>
      </div>
    )
  }

  const me = billing.data
  const docs = documents.data
  const contract = me?.contract ?? null
  const current = me?.currentTerms ?? null
  const scheduled = me?.scheduledTerms ?? null
  const pending = docs?.pending ?? null
  const accepted = docs?.accepted ?? []

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Contrato</h1>

      {contract?.status === 'ACTIVE' && current && (
        <Card className="p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Seu contrato</h2>
            <Badge variant="success">
              {CONTRACT_STATUS_LABELS[contract.status]}
              {contract.startDate && ` desde ${formatBillingDate(new Date(contract.startDate))}`}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-[var(--text-primary)]">{termsLine(current)}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {formatBrl(current.monthlyTotal)} por mês · vencimento no dia {contract.dueDay}
          </p>
          {scheduled && (
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              A partir de {formatBillingDate(civilDaySaoPaulo(new Date(scheduled.effectiveFrom)))}:{' '}
              {scheduled.packageName} · {LICENSE_TYPE_LABELS[scheduled.licenseType]} ·{' '}
              {formatBrl(scheduled.monthlyTotal)} por mês (aditivo aceito)
            </p>
          )}
        </Card>
      )}

      {pending && (
        <AcceptDocumentPanel
          doc={pending}
          designatedAdmin={me?.designatedAdmin ?? null}
          onChanged={() => {
            void billing.refetch()
            void documents.refetch()
          }}
        />
      )}

      {accepted.length > 0 && (
        <Card className="p-4 sm:p-6">
          <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">
            Documentos aceitos
          </h2>
          <ul className="divide-y divide-[var(--border)]">
            {accepted.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
              >
                <p className="text-sm text-[var(--text-primary)]">
                  <span className="font-medium">{DOCUMENT_KIND_SHORT[d.kind]}</span>
                  <span className="text-[var(--text-secondary)]">
                    {' '}
                    · aceito em {d.acceptedAt ? formatDateTimeBrasilia(d.acceptedAt) : '—'} por{' '}
                    {d.acceptedByName}
                  </span>
                </p>
                <div className="flex gap-2">
                  <Link
                    href={`/contrato/${d.id}`}
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    Ver
                  </Link>
                  <Link
                    href={`/contrato/${d.id}/imprimir`}
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    Imprimir / salvar PDF
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!pending && accepted.length === 0 && (
        <Card className="p-6">
          <p className="text-sm text-[var(--text-secondary)]">
            Sua empresa ainda não tem contrato no Addere.
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Quando a Addere enviar o {CONTRACT_DOCUMENT_KIND_LABELS.CONTRACT}, ele aparece aqui.
          </p>
        </Card>
      )}
    </div>
  )
}
