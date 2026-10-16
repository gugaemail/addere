'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'
import {
  formatBillingDate,
  formatBrl,
  type MyBillingDto,
  type MyTermsDto,
  type SeatUsage,
} from '@addere/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { LicenseRequestModal } from '@/components/billing/LicenseRequestModal'
import { MyInvoicesSection } from '@/components/billing/MyInvoicesSection'
import { LicenseRequestsTable } from '@/components/billing/LicenseRequestsTable'
import { SeatHoldersList } from '@/components/billing/SeatHoldersList'
import { SeatMeter } from '@/components/billing/SeatMeter'
import { useAuth } from '@/contexts/AuthContext'
import { useMyBilling } from '@/hooks/useContracts'
import { getApiErrorMessage } from '@/lib/api'
import { LICENSE_TYPE_LABELS } from '@/lib/billing-ui'
import { licenseRequestBlockedReason, monthlyIncrease } from '@/lib/seats'

// Plano e cobrança do ADMIN da empresa: o plano em vigor, as licenças em uso e
// os pedidos de licenças adicionais (plano 015) e, abaixo, as faturas (plano
// 016). Só o administrador indicado pede (decisão padrão 10); os outros ADMINs
// veem o botão desativado, com o nome dele.

function PlanCard({ terms, startDate }: { terms: MyTermsDto; startDate: string | null }) {
  return (
    <Card className="p-4 sm:p-6">
      <h2 className="text-base font-semibold text-[var(--text-primary)]">Seu plano</h2>
      <p className="mt-1 text-sm text-[var(--text-primary)]">
        {terms.packageName} · {LICENSE_TYPE_LABELS[terms.licenseType]}
      </p>
      {startDate && (
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Contrato ativo desde {formatBillingDate(new Date(startDate))}
        </p>
      )}
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-[var(--text-secondary)]">
            Pacote ({terms.includedSeats} {terms.includedSeats === 1 ? 'licença' : 'licenças'})
          </dt>
          <dd className="tabular-nums text-[var(--text-primary)]">
            {formatBrl(terms.packagePrice)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-[var(--text-secondary)]">
            Adicionais {terms.extraSeats} × {formatBrl(terms.extraSeatPrice)}
          </dt>
          <dd className="tabular-nums text-[var(--text-primary)]">
            {formatBrl(monthlyIncrease(terms.extraSeats, terms.extraSeatPrice))}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-[var(--border)] pt-2 font-semibold">
          <dt className="text-[var(--text-primary)]">Total mensal</dt>
          <dd className="tabular-nums text-[var(--text-primary)]">
            {formatBrl(terms.monthlyTotal)}
          </dd>
        </div>
      </dl>
    </Card>
  )
}

function SeatsCard({
  seats,
  blockedReason,
  onRequest,
}: {
  seats: SeatUsage
  blockedReason: string | null
  onRequest: () => void
}) {
  return (
    <Card className="flex flex-col p-4 sm:p-6">
      <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">Licenças</h2>
      <SeatMeter seats={seats} />
      <p className="mt-3 text-xs text-[var(--text-muted)]">
        Vendedores e gerentes ativos ocupam licença; administradores não.
      </p>
      <div className="mt-4 flex flex-1 flex-col items-end justify-end gap-2">
        <Button onClick={onRequest} disabled={blockedReason !== null}>
          Solicitar mais licenças
        </Button>
        {blockedReason && (
          <p className="text-right text-xs text-[var(--text-secondary)]">{blockedReason}</p>
        )}
      </div>
    </Card>
  )
}

/** Sem contrato ativo: o que vale para as licenças */
function NoActiveContract({ me }: { me: MyBillingDto | undefined }) {
  const status = me?.contract?.status
  if (status === 'CANCELLED') {
    return (
      <Card className="p-6">
        <p className="text-sm text-[var(--text-secondary)]">
          O contrato da sua empresa foi encerrado: não é possível criar nem ativar vendedores ou
          gerentes.
        </p>
      </Card>
    )
  }
  return (
    <Card className="p-6">
      <p className="text-sm text-[var(--text-secondary)]">
        Sua empresa ainda não tem contrato ativo. Enquanto isso, não há limite de licenças.
      </p>
      {status === 'PENDING_ACCEPTANCE' && (
        <Link
          href="/contrato"
          className="mt-2 inline-block text-sm font-medium text-brand hover:underline"
        >
          Ver contrato →
        </Link>
      )}
    </Card>
  )
}

export default function PlanoPage() {
  const { user, isSuperAdmin } = useAuth()
  const billing = useMyBilling(!isSuperAdmin)
  const [requesting, setRequesting] = useState(false)

  if (isSuperAdmin) {
    return (
      <Card className="max-w-2xl p-6">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Plano e cobrança</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          O plano, as licenças, os pedidos e as faturas de cada cliente ficam na ficha do
          cliente, em Gestão Addere.
        </p>
        <div className="mt-3 flex flex-wrap gap-4">
          <Link href="/gestao/clientes" className="text-sm font-medium text-brand hover:underline">
            Ir para Clientes →
          </Link>
          <Link
            href="/gestao/solicitacoes"
            className="text-sm font-medium text-brand hover:underline"
          >
            Ver solicitações →
          </Link>
          <Link href="/gestao/faturas" className="text-sm font-medium text-brand hover:underline">
            Ver faturas →
          </Link>
        </div>
      </Card>
    )
  }

  if (billing.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    )
  }

  if (billing.error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <p className="font-semibold text-danger">Erro ao carregar o plano</p>
        <p className="text-sm text-[var(--text-muted)]">
          {getApiErrorMessage(billing.error, 'Erro ao carregar o plano')}
        </p>
        <Button onClick={() => void billing.refetch()}>Tentar novamente</Button>
      </div>
    )
  }

  const me = billing.data
  const current = me?.currentTerms ?? null
  const seats = me?.seats
  const requests = me?.licenseRequests ?? []
  const blockedReason = licenseRequestBlockedReason({
    userId: user?.id,
    designatedAdmin: me?.designatedAdmin,
    hasPendingRequest: requests.some((r) => r.status === 'PENDING'),
  })

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Plano e cobrança
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Seu contrato, suas licenças, os pedidos de licenças adicionais e as faturas
        </p>
      </div>

      {me?.contract?.status === 'ACTIVE' && current && seats ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <PlanCard terms={current} startDate={me?.contract?.startDate ?? null} />
            <SeatsCard
              seats={seats}
              blockedReason={blockedReason}
              onRequest={() => setRequesting(true)}
            />
          </div>
          <SeatHoldersList holders={seats.holders} />
        </>
      ) : (
        <NoActiveContract me={me} />
      )}

      {requests.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Seus pedidos de licenças
          </h2>
          <LicenseRequestsTable requests={requests} />
        </section>
      )}

      {/* Plano 016: as faturas aparecem mesmo sem contrato ativo (a do mês do
          encerramento sai depois do fim) */}
      <MyInvoicesSection />

      {requesting && current && (
        <LicenseRequestModal
          extraSeatPrice={current.extraSeatPrice}
          onClose={() => setRequesting(false)}
          onChanged={() => void billing.refetch()}
        />
      )}
    </div>
  )
}
