'use client'

import { useState } from 'react'
import { Receipt } from 'lucide-react'
import type { MyInvoiceDto } from '@addere/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { TableEmptyState } from '@/components/ui/DataTable'
import { InvoiceStatusPill } from '@/components/ui/StatusPill'
import { Spinner } from '@/components/ui/Spinner'
import { Table, type Column } from '@/components/ui/Table'
import { getApiErrorMessage } from '@/lib/api'
import { formatInvoiceNumber } from '@/lib/billing-format'
import { formatCurrency } from '@/lib/utils'
import { useMyInvoices } from '@/hooks/useInvoices'
import { InvoiceItemsDetail, invoiceCompetence, invoiceDay } from './InvoicesTable'

// Faturas da empresa no /plano do ADMIN (plano 016): só leitura, sem
// observação interna, motivo de cancelamento nem quem deu a baixa (a API já
// não devolve esses campos). A linha abre os itens.

const columns: Column<MyInvoiceDto>[] = [
  {
    key: 'number',
    header: 'Nº',
    className: 'whitespace-nowrap font-mono text-xs',
    render: (i) => formatInvoiceNumber(i.number),
  },
  {
    key: 'competence',
    header: 'Competência',
    className: 'whitespace-nowrap',
    render: (i) => invoiceCompetence(i.competence),
  },
  {
    key: 'due',
    header: 'Vencimento',
    className: 'whitespace-nowrap',
    render: (i) => invoiceDay(i.dueDate),
  },
  {
    key: 'total',
    header: 'Valor',
    className: 'whitespace-nowrap text-right tabular-nums',
    render: (i) => <span className="text-[var(--text-primary)]">{formatCurrency(i.total)}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (i) => <InvoiceStatusPill status={i.displayStatus} />,
  },
  {
    key: 'paidAt',
    header: 'Paga em',
    className: 'whitespace-nowrap',
    render: (i) =>
      i.paidAt ? invoiceDay(i.paidAt) : <span className="text-[var(--text-muted)]">—</span>,
  },
]

export function MyInvoicesSection() {
  const { data: invoices, isLoading, error, refetch } = useMyInvoices()
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <Card className="space-y-3 p-4 sm:p-6">
      <h2 className="text-base font-semibold text-[var(--text-primary)]">Faturas</h2>

      {error ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-danger">
            {getApiErrorMessage(error, 'Erro ao carregar as faturas')}
          </p>
          <Button size="sm" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : isLoading || !invoices ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : invoices.length === 0 ? (
        <TableEmptyState
          icon={<Receipt className="h-9 w-9" strokeWidth={1.25} />}
          title="Nenhuma fatura ainda."
          description="A primeira sai no início do mês seguinte ao primeiro mês cobrado."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <Table
            columns={columns}
            data={invoices}
            rowKey={(i) => i.id}
            className="rounded-none"
            onRowClick={(i) => setExpanded((cur) => (cur === i.id ? null : i.id))}
            renderExpanded={(i) =>
              expanded === i.id ? <InvoiceItemsDetail invoice={i} showInternal={false} /> : null
            }
          />
        </div>
      )}

      <div className="space-y-0.5 text-xs text-[var(--text-muted)]">
        {invoices && invoices.length > 0 && <p>Clique na linha para ver os itens.</p>}
        <p>A fatura sai no início de cada mês, referente ao mês anterior.</p>
        <p>Dúvidas sobre a cobrança: fale com a Addere.</p>
      </div>
    </Card>
  )
}
