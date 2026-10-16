'use client'

import {
  civilDaySaoPaulo,
  formatBillingDate,
  formatBrl,
  type LicenseRequestDto,
} from '@addere/types'
import { Badge } from '@/components/ui/Badge'
import { Table, type Column } from '@/components/ui/Table'
import { LICENSE_REQUEST_STATUS_BADGE, LICENSE_REQUEST_STATUS_LABELS } from '@/lib/billing-ui'
import { formatDateTimeBrasilia } from '@/lib/contract-ui'

// Pedidos de licenças (plano 015). No /plano do ADMIN, a forma curta; na
// Gestão Addere (Solicitações e aba Licenças), com a empresa, quem pediu, o
// aumento mensal e as ações das linhas pendentes.

/** Dia civil de São Paulo de um instante ISO, 'DD/MM/AAAA' */
function dayOf(iso: string): string {
  return formatBillingDate(civilDaySaoPaulo(new Date(iso)))
}

function observation(r: LicenseRequestDto): string {
  if (r.status === 'APPROVED' && r.decidedAt) return `liberado em ${dayOf(r.decidedAt)}`
  if (r.status === 'REJECTED') return r.decisionReason ? `motivo: ${r.decisionReason}` : 'recusado'
  return '—'
}

export function LicenseRequestsTable({
  requests,
  variant = 'company',
  showCompany = true,
  actions,
  emptyMessage = 'Nenhum pedido de licenças.',
}: {
  requests: LicenseRequestDto[]
  /** company = /plano do ADMIN; admin = Gestão Addere */
  variant?: 'company' | 'admin'
  /** Só no admin: a coluna Empresa (a aba da ficha já é de uma empresa) */
  showCompany?: boolean
  /** Ações da linha (Aprovar e Recusar nas pendentes) */
  actions?: (r: LicenseRequestDto) => React.ReactNode
  emptyMessage?: string
}) {
  const status: Column<LicenseRequestDto> = {
    key: 'status',
    header: 'Situação',
    render: (r) => (
      <Badge variant={LICENSE_REQUEST_STATUS_BADGE[r.status]}>
        {LICENSE_REQUEST_STATUS_LABELS[r.status]}
      </Badge>
    ),
  }

  const columns: Column<LicenseRequestDto>[] =
    variant === 'company'
      ? [
          { key: 'date', header: 'Data', render: (r) => dayOf(r.requestedAt) },
          { key: 'quantity', header: 'Quantidade', render: (r) => r.quantity },
          {
            key: 'price',
            header: 'Valor por licença',
            render: (r) => `${formatBrl(r.unitPriceShown)} / mês`,
          },
          status,
          {
            key: 'note',
            header: 'Observação',
            render: (r) => <span className="text-[var(--text-muted)]">{observation(r)}</span>,
          },
        ]
      : [
          ...(showCompany
            ? [
                {
                  key: 'company',
                  header: 'Empresa',
                  render: (r: LicenseRequestDto) => (
                    <span className="font-medium text-[var(--text-primary)]">{r.companyName}</span>
                  ),
                },
              ]
            : []),
          {
            key: 'date',
            header: 'Pedido em',
            render: (r) => formatDateTimeBrasilia(r.requestedAt),
          },
          { key: 'by', header: 'Por', render: (r) => r.requestedByName },
          { key: 'quantity', header: 'Qtd', render: (r) => r.quantity },
          {
            key: 'price',
            header: 'Valor/licença',
            render: (r) => formatBrl(r.unitPriceShown),
          },
          {
            key: 'increase',
            header: 'Aumento/mês',
            render: (r) => formatBrl(r.monthlyIncrease),
          },
          status,
          {
            key: 'note',
            header: 'Observação',
            render: (r) => (
              <span className="text-[var(--text-muted)]">
                {observation(r)}
                {r.status !== 'PENDING' && r.decidedByName && ` · por ${r.decidedByName}`}
              </span>
            ),
          },
          ...(actions
            ? [
                {
                  key: 'actions',
                  header: '',
                  className: 'text-right',
                  render: (r: LicenseRequestDto) => (
                    <div className="flex justify-end gap-2">{actions(r)}</div>
                  ),
                },
              ]
            : []),
        ]

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
      <Table
        columns={columns}
        data={requests}
        rowKey={(r) => r.id}
        emptyMessage={emptyMessage}
        className="rounded-none"
      />
    </div>
  )
}
