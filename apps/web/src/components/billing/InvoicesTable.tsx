'use client'

import { useEffect, useRef, useState } from 'react'
import { MoreVertical, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import {
  formatBillingDate,
  formatCompetence,
  type InvoiceDto,
  type InvoiceItemDto,
} from '@addere/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Pagination, TableEmptyState } from '@/components/ui/DataTable'
import { InvoiceStatusPill } from '@/components/ui/StatusPill'
import { Spinner } from '@/components/ui/Spinner'
import { Table, type Column } from '@/components/ui/Table'
import { ConfirmModal } from '@/app/(admin)/empresas/[id]/ConfirmModal'
import { getApiErrorMessage } from '@/lib/api'
import { PAYMENT_METHOD_LABELS, formatInvoiceNumber } from '@/lib/billing-format'
import { formatCurrency } from '@/lib/utils'
import {
  useInvoices,
  useRecalculateInvoice,
  useRemoveInvoiceItem,
  type InvoiceFilters,
} from '@/hooks/useInvoices'
import {
  CancelInvoiceModal,
  InvoiceItemModal,
  InvoiceNotesModal,
  PayInvoiceModal,
} from './InvoiceModals'

// Faturas (plano 016) — a tabela de /gestao/faturas e da aba Faturas da ficha
// do cliente. A linha abre os itens; o menu ⋯ só mostra o que o status
// permite: em aberto, tudo; paga, só NF e observações (D4); cancelada, nada.
//
// Dia civil chega da API como 'YYYY-MM-DD' e competência como 'YYYY-MM'. As
// duas viram a meia-noite UTC e vão para os formatadores do 013, que leem em
// UTC: nunca o formatDate de lib/utils.ts.

/** 'YYYY-MM-DD' → 'DD/MM/AAAA' */
export function invoiceDay(iso: string): string {
  return formatBillingDate(new Date(`${iso}T00:00:00.000Z`))
}

/** 'YYYY-MM' → 'MM/AAAA' */
export function invoiceCompetence(iso: string): string {
  return formatCompetence(new Date(`${iso}-01T00:00:00.000Z`))
}

/** Itens da fatura, com o total e o rodapé; `onRemove` só em fatura OPEN */
export function InvoiceItemsDetail({
  invoice,
  onRemove,
  showInternal,
}: {
  invoice: Pick<InvoiceDto, 'items' | 'total' | 'dueDate'> &
    Partial<
      Pick<
        InvoiceDto,
        | 'origin'
        | 'status'
        | 'paidAt'
        | 'paidAmount'
        | 'paymentMethod'
        | 'paidByName'
        | 'notes'
        | 'cancelReason'
        | 'cancelledByName'
      >
    >
  onRemove?: (item: InvoiceItemDto) => void
  showInternal: boolean
}) {
  return (
    <div className="space-y-2 pt-2 text-sm">
      <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]">
        {invoice.items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-[var(--text-primary)]">{item.description}</span>
              {item.manual && showInternal && <Badge variant="neutral">manual</Badge>}
              {item.manual && onRemove && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(item)
                  }}
                >
                  remover
                </Button>
              )}
            </div>
            <div className="flex items-center gap-4 whitespace-nowrap">
              {item.quantity > 1 && (
                <span className="text-xs text-[var(--text-muted)]">
                  {item.quantity} × {formatCurrency(item.unitPrice)}
                </span>
              )}
              <span className="tabular-nums text-[var(--text-primary)]">
                {formatCurrency(item.amount)}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[var(--text-muted)]">
        <span>
          {showInternal && invoice.origin
            ? `${invoice.origin === 'JOB' ? 'Gerada pelo faturamento' : 'Fatura avulsa'} · `
            : ''}
          vence {invoiceDay(invoice.dueDate)}
        </span>
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          Total {formatCurrency(invoice.total)}
        </span>
      </div>
      {showInternal && invoice.status === 'PAID' && invoice.paidAt && (
        <p className="px-1 text-xs text-[var(--text-muted)]">
          Paga em {invoiceDay(invoice.paidAt)}
          {invoice.paidAmount ? ` · ${formatCurrency(invoice.paidAmount)}` : ''}
          {invoice.paymentMethod ? ` · ${PAYMENT_METHOD_LABELS[invoice.paymentMethod]}` : ''}
          {invoice.paidByName ? ` · baixa por ${invoice.paidByName}` : ''}
        </p>
      )}
      {showInternal && invoice.status === 'CANCELLED' && (
        <p className="px-1 text-xs text-[var(--text-muted)]">
          Cancelada{invoice.cancelledByName ? ` por ${invoice.cancelledByName}` : ''}
          {invoice.cancelReason ? ` · "${invoice.cancelReason}"` : ''}
        </p>
      )}
      {showInternal && invoice.notes && (
        <p className="px-1 text-xs text-[var(--text-muted)]">Observação: {invoice.notes}</p>
      )}
    </div>
  )
}

type Action = 'pay' | 'item' | 'notes' | 'recalculate' | 'cancel'

const ACTION_LABELS: Record<Action, string> = {
  pay: 'Dar baixa',
  item: 'Desconto ou ajuste',
  notes: 'NF e observações',
  recalculate: 'Recalcular',
  cancel: 'Cancelar',
}

function actionsFor(invoice: InvoiceDto): Action[] {
  if (invoice.status === 'OPEN') return ['pay', 'item', 'notes', 'recalculate', 'cancel']
  if (invoice.status === 'PAID') return ['notes']
  return []
}

function RowMenu({ actions, onPick }: { actions: Action[]; onPick: (a: Action) => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
  }, [open])

  if (actions.length === 0) return null
  return (
    <div className="inline-block text-left" onClick={(e) => e.stopPropagation()}>
      <Button
        ref={btnRef}
        variant="ghost"
        size="icon"
        leftIcon={MoreVertical}
        onClick={() => setOpen((v) => !v)}
        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
        title="Ações"
        aria-label="Ações da fatura"
      />
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="fixed z-40 w-48 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-modal"
            style={{ top: pos.top, right: pos.right }}
          >
            {actions.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => {
                  setOpen(false)
                  onPick(action)
                }}
                className={
                  action === 'cancel'
                    ? 'w-full border-t border-[var(--border)] px-4 py-2.5 text-left text-sm text-danger transition-colors hover:bg-danger/10'
                    : 'w-full px-4 py-2.5 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)]'
                }
              >
                {ACTION_LABELS[action]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

interface InvoicesTableProps {
  filters: InvoiceFilters
  onPageChange: (page: number) => void
  /** false na ficha do cliente: a coluna Cliente sairia repetida */
  showCompany: boolean
}

export function InvoicesTable({ filters, onPageChange, showCompany }: InvoicesTableProps) {
  const { data, isLoading, error, refetch } = useInvoices(filters)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [action, setAction] = useState<{ type: Action; invoice: InvoiceDto } | null>(null)
  const [removing, setRemoving] = useState<{ invoice: InvoiceDto; item: InvoiceItemDto } | null>(
    null
  )
  const recalculate = useRecalculateInvoice()
  const removeItem = useRemoveInvoiceItem()

  const columns: Column<InvoiceDto>[] = [
    {
      key: 'number',
      header: 'Nº',
      className: 'whitespace-nowrap font-mono text-xs',
      render: (i) => formatInvoiceNumber(i.number),
    },
    ...(showCompany
      ? [
          {
            key: 'company',
            header: 'Cliente',
            render: (i: InvoiceDto) => (
              <span className="text-[var(--text-primary)]">{i.companyName}</span>
            ),
          },
        ]
      : []),
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
      header: 'Total',
      className: 'whitespace-nowrap text-right tabular-nums',
      render: (i) => <span className="text-[var(--text-primary)]">{formatCurrency(i.total)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (i) => <InvoiceStatusPill status={i.displayStatus} />,
    },
    {
      key: 'nf',
      header: 'NF',
      className: 'whitespace-nowrap',
      render: (i) => i.nfNumber ?? <span className="text-[var(--text-muted)]">—</span>,
    },
    {
      key: 'menu',
      header: '',
      className: 'w-10 text-right',
      render: (i) => (
        <RowMenu
          actions={actionsFor(i)}
          onPick={(type) => {
            setAction({ type, invoice: i })
          }}
        />
      ),
    },
  ]

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
        <p className="font-semibold text-danger">Erro ao carregar as faturas</p>
        <p className="text-sm text-[var(--text-muted)]">
          {getApiErrorMessage(error, 'Erro ao carregar as faturas')}
        </p>
        <Button onClick={() => refetch()}>Tentar novamente</Button>
      </div>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-14">
        <Spinner size="lg" />
      </div>
    )
  }

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize))
  const close = () => setAction(null)

  return (
    <>
      {data.items.length === 0 ? (
        <TableEmptyState
          icon={<Receipt className="h-9 w-9" strokeWidth={1.25} />}
          title="Nenhuma fatura"
          description="As faturas do mês anterior saem no início de cada mês, pelo faturamento. Mês antigo entra por fatura avulsa."
        />
      ) : (
        <Table
          columns={columns}
          data={data.items}
          rowKey={(i) => i.id}
          className="rounded-none"
          onRowClick={(i) => setExpanded((cur) => (cur === i.id ? null : i.id))}
          renderExpanded={(i) =>
            expanded === i.id ? (
              <InvoiceItemsDetail
                invoice={i}
                showInternal
                onRemove={
                  i.status === 'OPEN' ? (item) => setRemoving({ invoice: i, item }) : undefined
                }
              />
            ) : null
          }
        />
      )}
      <Pagination page={data.page} total={data.total} pages={pages} onPage={onPageChange} />

      {action?.type === 'pay' && <PayInvoiceModal invoice={action.invoice} onClose={close} />}
      {action?.type === 'item' && <InvoiceItemModal invoice={action.invoice} onClose={close} />}
      {action?.type === 'notes' && <InvoiceNotesModal invoice={action.invoice} onClose={close} />}
      {action?.type === 'cancel' && <CancelInvoiceModal invoice={action.invoice} onClose={close} />}
      {action?.type === 'recalculate' && (
        <ConfirmModal
          title={`Recalcular a fatura ${formatInvoiceNumber(action.invoice.number)}`}
          description="Refaz os itens do contrato pelos termos desta competência e mantém os descontos e ajustes lançados à mão. O vencimento não muda."
          confirmLabel="Recalcular"
          destructive={false}
          onClose={close}
          onConfirm={() =>
            recalculate.mutate(action.invoice.id, {
              onSuccess: (inv) =>
                toast.success(
                  `Fatura ${formatInvoiceNumber(inv.number)} recalculada: ${formatCurrency(inv.total)}.`
                ),
            })
          }
        />
      )}
      {removing && (
        <ConfirmModal
          title="Remover item"
          description={`Remove "${removing.item.description}" da fatura ${formatInvoiceNumber(removing.invoice.number)} e refaz o total.`}
          confirmLabel="Remover"
          onClose={() => setRemoving(null)}
          onConfirm={() =>
            removeItem.mutate(
              { id: removing.invoice.id, itemId: removing.item.id },
              { onSuccess: () => toast.success('Item removido.') }
            )
          }
        />
      )}
    </>
  )
}
