'use client'

import { useState } from 'react'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  INVOICE_PAYMENT_METHODS,
  civilDaySaoPaulo,
  formatCompetence,
  type InvoiceDto,
  type InvoicePaymentMethod,
} from '@addere/types'
import { Button } from '@/components/ui/Button'
import { FormField, FormSelect, formControlClass } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { useCompanies } from '@/hooks/useCompanies'
import {
  useAddInvoiceItem,
  useCancelInvoice,
  useCreateManualInvoice,
  useUpdateInvoice,
  usePayInvoice,
  type ManualItemInput,
} from '@/hooks/useInvoices'
import {
  PAYMENT_METHOD_LABELS,
  formatInvoiceNumber,
  moneyToInput,
  parseMoneyInput,
} from '@/lib/billing-format'
import { formatCurrency } from '@/lib/utils'

// Modais das faturas (plano 016). Dinheiro digitado em reais vira string de
// duas casas por parseMoneyInput, nunca número. "Hoje" é o dia civil de São
// Paulo, o mesmo que a API usa para recusar vencimento no passado e baixa no
// futuro.

/** Hoje em São Paulo como 'YYYY-MM-DD', em qualquer fuso do navegador */
function todayIso(): string {
  return civilDaySaoPaulo(new Date()).toISOString().slice(0, 10)
}

/** O mês anterior ao corrente em São Paulo, 'YYYY-MM' (a avulsa só vai até ele, D3) */
function previousMonthIso(): string {
  const today = civilDaySaoPaulo(new Date())
  const prev = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
  return prev.toISOString().slice(0, 7)
}

function ModalActions({
  onClose,
  submitLabel,
  loading,
  destructive = false,
}: {
  onClose: () => void
  submitLabel: string
  loading: boolean
  destructive?: boolean
}) {
  return (
    <div className="flex justify-end gap-2 pt-4">
      <Button type="button" variant="secondary" onClick={onClose}>
        Voltar
      </Button>
      <Button type="submit" variant={destructive ? 'danger' : 'primary'} loading={loading}>
        {submitLabel}
      </Button>
    </div>
  )
}

function InvoiceHeader({ invoice }: { invoice: InvoiceDto }) {
  return (
    <div className="mb-4 space-y-1 text-sm">
      <p className="text-[var(--text-muted)]">
        {invoice.companyName} · competência{' '}
        {formatCompetence(new Date(`${invoice.competence}-01T00:00:00.000Z`))}
      </p>
      <p className="flex justify-between text-[var(--text-secondary)]">
        <span>Total da fatura</span>
        <span className="font-semibold text-[var(--text-primary)]">
          {formatCurrency(invoice.total)}
        </span>
      </p>
    </div>
  )
}

// ─── Baixa (D5) ──────────────────────────────────────────────────────────────

export function PayInvoiceModal({
  invoice,
  onClose,
}: {
  invoice: InvoiceDto
  onClose: () => void
}) {
  const today = todayIso()
  const [paidAt, setPaidAt] = useState(today)
  const [amountText, setAmountText] = useState(moneyToInput(invoice.total))
  const [method, setMethod] = useState<InvoicePaymentMethod>('PIX')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const pay = usePayInvoice()

  const amount = parseMoneyInput(amountText)
  const differs = amount !== null && amount !== invoice.total

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!paidAt || paidAt > today) return setError('A data do pagamento não pode ser futura.')
    if (amount === null) return setError('Informe o valor recebido, em reais.')
    setError(null)
    pay.mutate(
      { id: invoice.id, paidAt, amount, method, note: note.trim() || null },
      {
        onSuccess: () => {
          toast.success(`Baixa da fatura ${formatInvoiceNumber(invoice.number)} registrada.`)
          onClose()
        },
      }
    )
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Dar baixa — Fatura ${formatInvoiceNumber(invoice.number)}`}
    >
      <InvoiceHeader invoice={invoice} />
      <form onSubmit={submit} className="space-y-3">
        <FormField
          label="Data do pagamento"
          type="date"
          max={today}
          value={paidAt}
          onChange={(e) => setPaidAt(e.target.value)}
          required
        />
        <FormField
          label="Valor recebido"
          inputMode="decimal"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          required
        />
        <FormSelect
          label="Forma"
          value={method}
          onChange={(e) => setMethod(e.target.value as InvoicePaymentMethod)}
        >
          {INVOICE_PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </FormSelect>
        <FormField
          label="Observação"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
        />
        {differs && (
          <div className="flex gap-2 rounded-lg bg-warning/10 p-3 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
            <p>
              Valor diferente do total. A fatura fica quitada; a diferença não vira saldo. Se
              precisar cobrar ou devolver, lance um ajuste na próxima fatura.
            </p>
          </div>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
        <ModalActions onClose={onClose} submitLabel="Confirmar baixa" loading={pay.isPending} />
      </form>
    </Modal>
  )
}

// ─── Desconto ou ajuste ──────────────────────────────────────────────────────

type ItemKind = ManualItemInput['kind']

const KIND_LABELS: Record<ItemKind, string> = { DISCOUNT: 'Desconto', ADJUSTMENT: 'Ajuste' }

/** Texto digitado → valor da API; null se inválido. Desconto é sempre positivo */
function parseItemAmount(kind: ItemKind, text: string): string | null {
  const value = parseMoneyInput(text, { allowNegative: kind === 'ADJUSTMENT' })
  if (value === null || /^-?0\.00$/.test(value)) return null
  return value
}

export function InvoiceItemModal({
  invoice,
  onClose,
}: {
  invoice: InvoiceDto
  onClose: () => void
}) {
  const [kind, setKind] = useState<ItemKind>('DISCOUNT')
  const [description, setDescription] = useState('')
  const [amountText, setAmountText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = useAddInvoiceItem()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseItemAmount(kind, amountText)
    if (description.trim().length < 3) return setError('Descrição com pelo menos 3 caracteres.')
    if (amount === null) {
      return setError(
        kind === 'DISCOUNT'
          ? 'Informe o desconto em reais, sem sinal.'
          : 'Informe o ajuste em reais: positivo cobra, negativo devolve.'
      )
    }
    setError(null)
    add.mutate(
      { id: invoice.id, kind, description: description.trim(), amount },
      {
        onSuccess: () => {
          toast.success(
            `${KIND_LABELS[kind]} lançado na fatura ${formatInvoiceNumber(invoice.number)}.`
          )
          onClose()
        },
      }
    )
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Desconto ou ajuste — Fatura ${formatInvoiceNumber(invoice.number)}`}
    >
      <InvoiceHeader invoice={invoice} />
      <form onSubmit={submit} className="space-y-3">
        <FormSelect label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as ItemKind)}>
          <option value="DISCOUNT">Desconto</option>
          <option value="ADJUSTMENT">Ajuste</option>
        </FormSelect>
        <FormField
          label="Descrição"
          value={description}
          maxLength={200}
          placeholder={
            kind === 'DISCOUNT'
              ? 'Crédito por indisponibilidade — MM/AAAA (N min)'
              : 'Ajuste: diferença de setembro'
          }
          onChange={(e) => setDescription(e.target.value)}
          required
        />
        <FormField
          label="Valor"
          inputMode="decimal"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          hint={
            kind === 'DISCOUNT'
              ? 'Em reais, sem sinal: o desconto é abatido do total.'
              : 'Em reais: positivo cobra, negativo devolve.'
          }
          required
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <ModalActions onClose={onClose} submitLabel="Lançar" loading={add.isPending} />
      </form>
    </Modal>
  )
}

// ─── NF e observações (D4) ───────────────────────────────────────────────────

export function InvoiceNotesModal({
  invoice,
  onClose,
}: {
  invoice: InvoiceDto
  onClose: () => void
}) {
  const [nfNumber, setNfNumber] = useState(invoice.nfNumber ?? '')
  const [notes, setNotes] = useState(invoice.notes ?? '')
  const update = useUpdateInvoice()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    update.mutate(
      { id: invoice.id, nfNumber: nfNumber.trim() || null, notes: notes.trim() || null },
      {
        onSuccess: () => {
          toast.success('NF e observações salvas.')
          onClose()
        },
      }
    )
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`NF e observações — Fatura ${formatInvoiceNumber(invoice.number)}`}
    >
      <form onSubmit={submit} className="space-y-3">
        <FormField
          label="Número da NF"
          value={nfNumber}
          maxLength={60}
          onChange={(e) => setNfNumber(e.target.value)}
        />
        <Textarea
          label="Observação interna"
          value={notes}
          maxLength={2000}
          rows={4}
          hint="O cliente não vê esta observação."
          onChange={(e) => setNotes(e.target.value)}
        />
        <ModalActions onClose={onClose} submitLabel="Salvar" loading={update.isPending} />
      </form>
    </Modal>
  )
}

// ─── Cancelar (D1) ───────────────────────────────────────────────────────────

export function CancelInvoiceModal({
  invoice,
  onClose,
}: {
  invoice: InvoiceDto
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const cancel = useCancelInvoice()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (reason.trim().length < 3) return setError('Informe o motivo (mínimo de 3 caracteres).')
    setError(null)
    cancel.mutate(
      { id: invoice.id, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(`Fatura ${formatInvoiceNumber(invoice.number)} cancelada.`)
          onClose()
        },
      }
    )
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Cancelar — Fatura ${formatInvoiceNumber(invoice.number)}`}
    >
      <InvoiceHeader invoice={invoice} />
      <p className="mb-3 text-sm text-[var(--text-muted)]">
        A fatura cancelada não volta e continua ocupando a competência: este mês não será cobrado.
        Para cobrar depois, lance um ajuste na próxima fatura.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Textarea
          label="Motivo"
          value={reason}
          maxLength={500}
          rows={3}
          onChange={(e) => setReason(e.target.value)}
          required
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <ModalActions
          onClose={onClose}
          submitLabel="Cancelar fatura"
          loading={cancel.isPending}
          destructive
        />
      </form>
    </Modal>
  )
}

// ─── Fatura avulsa (D2, D3) ──────────────────────────────────────────────────

interface DraftRow {
  kind: ItemKind
  description: string
  amount: string
}

export function ManualInvoiceModal({
  companyId: fixedCompanyId,
  onClose,
}: {
  /** Vindo da ficha do cliente: o cliente já vem escolhido e o seletor some */
  companyId?: string
  onClose: () => void
}) {
  const maxMonth = previousMonthIso()
  const today = todayIso()
  const { data: companies = [] } = useCompanies()
  const [companyId, setCompanyId] = useState(fixedCompanyId ?? '')
  const [competence, setCompetence] = useState(maxMonth)
  const [dueDate, setDueDate] = useState(today)
  const [useContractTerms, setUseContractTerms] = useState(true)
  const [rows, setRows] = useState<DraftRow[]>([])
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const create = useCreateManualInvoice()

  function setRow(index: number, patch: Partial<DraftRow>) {
    setRows((current) => current.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!companyId) return setError('Escolha o cliente.')
    if (!competence || competence > maxMonth) {
      return setError('Fatura avulsa só para um mês anterior ao atual.')
    }
    if (!dueDate || dueDate < today) return setError('O vencimento precisa ser hoje ou depois.')
    const items: ManualItemInput[] = []
    for (const row of rows) {
      const amount = parseItemAmount(row.kind, row.amount)
      if (row.description.trim().length < 3 || amount === null) {
        return setError('Cada item precisa de descrição (3 caracteres ou mais) e valor em reais.')
      }
      items.push({ kind: row.kind, description: row.description.trim(), amount })
    }
    if (!useContractTerms && items.length === 0) {
      return setError('Inclua pelo menos um item, ou use o pacote do contrato.')
    }
    setError(null)
    create.mutate(
      { companyId, competence, dueDate, useContractTerms, items, notes: notes.trim() || null },
      {
        onSuccess: (inv) => {
          toast.success(`Fatura avulsa ${formatInvoiceNumber(inv.number)} criada.`)
          onClose()
        },
      }
    )
  }

  return (
    <Modal isOpen onClose={onClose} title="Fatura avulsa" className="max-w-xl">
      <form onSubmit={submit} className="space-y-3">
        {!fixedCompanyId && (
          <FormSelect
            label="Cliente"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            required
          >
            <option value="">Escolha o cliente</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </FormSelect>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label="Competência"
            type="month"
            max={maxMonth}
            value={competence}
            onChange={(e) => setCompetence(e.target.value)}
            hint="Só meses anteriores ao atual."
            required
          />
          <FormField
            label="Vencimento"
            type="date"
            min={today}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            hint="Hoje ou depois."
            required
          />
        </div>
        <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={useContractTerms}
            onChange={(e) => setUseContractTerms(e.target.checked)}
          />
          Usar o pacote e os adicionais do contrato nesta competência
        </label>

        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Itens manuais</p>
          {rows.map((row, index) => (
            <div key={index} className="grid grid-cols-[7rem_1fr_7rem_auto] items-center gap-2">
              <select
                aria-label="Tipo do item"
                className={formControlClass}
                value={row.kind}
                onChange={(e) => setRow(index, { kind: e.target.value as ItemKind })}
              >
                <option value="DISCOUNT">Desconto</option>
                <option value="ADJUSTMENT">Ajuste</option>
              </select>
              <input
                aria-label="Descrição do item"
                className={formControlClass}
                value={row.description}
                maxLength={200}
                placeholder="Licença de uso — agosto"
                onChange={(e) => setRow(index, { description: e.target.value })}
              />
              <input
                aria-label="Valor do item"
                className={formControlClass}
                inputMode="decimal"
                value={row.amount}
                placeholder="0,00"
                onChange={(e) => setRow(index, { amount: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                leftIcon={Trash2}
                aria-label="Remover item"
                onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            leftIcon={Plus}
            onClick={() =>
              setRows((current) => [
                ...current,
                { kind: 'ADJUSTMENT', description: '', amount: '' },
              ])
            }
          >
            Item
          </Button>
          <p className="text-xs text-[var(--text-muted)]">
            Ajuste: positivo cobra, negativo devolve. Desconto: valor sem sinal.
          </p>
        </div>

        <Textarea
          label="Observação interna"
          value={notes}
          maxLength={2000}
          rows={2}
          onChange={(e) => setNotes(e.target.value)}
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <ModalActions onClose={onClose} submitLabel="Criar fatura" loading={create.isPending} />
      </form>
    </Modal>
  )
}
