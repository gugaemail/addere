'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { Play, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { FormField, FormSelect } from '@/components/ui/FormField'
import { InvoicesTable } from '@/components/billing/InvoicesTable'
import { ManualInvoiceModal } from '@/components/billing/InvoiceModals'
import { ConfirmModal } from '@/app/(admin)/empresas/[id]/ConfirmModal'
import { useCompanies } from '@/hooks/useCompanies'
import {
  useRunBillingJobs,
  type BillingTickSummary,
  type InvoiceFilters,
  type InvoiceStatusFilter,
} from '@/hooks/useInvoices'

// Faturas da Gestão Addere (plano 016) — só o SUPERADMIN (gestao/layout.tsx).
// A cobrança é manual: o sistema gera e registra, a Addere cobra por fora e
// o superadmin dá a baixa aqui.

const STATUS_OPTIONS: { value: InvoiceStatusFilter; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'OPEN', label: 'Em aberto' },
  { value: 'OVERDUE', label: 'Vencidas' },
  { value: 'PAID', label: 'Pagas' },
  { value: 'CANCELLED', label: 'Canceladas' },
]

const PAGE_SIZE = 50

function summaryText(s: BillingTickSummary): string {
  const parts: string[] = []
  if (s.invoices) {
    parts.push(`${s.invoices.created} fatura(s) criada(s), ${s.invoices.existing} já existente(s)`)
  }
  if (s.contractsEnded !== null) parts.push(`${s.contractsEnded} contrato(s) encerrado(s)`)
  const reminders = (s.dueReminders?.sent ?? 0) + (s.documentReminders?.sent ?? 0)
  parts.push(`${reminders} lembrete(s) enviado(s)`)
  return parts.join(' · ')
}

export default function FaturasPage() {
  const { data: companies = [] } = useCompanies()
  const [filters, setFilters] = useState<InvoiceFilters>({
    status: '',
    competence: '',
    companyId: '',
    page: 1,
    pageSize: PAGE_SIZE,
  })
  const [showManual, setShowManual] = useState(false)
  const [confirmRun, setConfirmRun] = useState(false)
  const run = useRunBillingJobs()

  const setFilter = (patch: Partial<InvoiceFilters>) =>
    setFilters((current) => ({ ...current, ...patch, page: 1 }))

  function runBilling() {
    run.mutate(undefined, {
      onSuccess: (summary) => {
        if (summary.errors.length > 0) {
          toast.warning(
            `Faturamento rodou com falha em: ${summary.errors.join(', ')}. ${summaryText(summary)}`
          )
        } else {
          toast.success(`Faturamento: ${summaryText(summary)}.`)
        }
      },
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Faturas</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            leftIcon={Play}
            loading={run.isPending}
            onClick={() => setConfirmRun(true)}
          >
            Rodar faturamento
          </Button>
          <Button leftIcon={Plus} onClick={() => setShowManual(true)}>
            Fatura avulsa
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <FormSelect
          label="Status"
          value={filters.status}
          onChange={(e) => setFilter({ status: e.target.value as InvoiceStatusFilter })}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </FormSelect>
        <FormField
          label="Competência"
          type="month"
          value={filters.competence}
          onChange={(e) => setFilter({ competence: e.target.value })}
        />
        <FormSelect
          label="Cliente"
          value={filters.companyId}
          onChange={(e) => setFilter({ companyId: e.target.value })}
        >
          <option value="">Todos</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FormSelect>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-card">
        <InvoicesTable
          filters={filters}
          showCompany
          onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
        />
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        A fatura de cada mês sai no início do mês seguinte e vence no dia do contrato. Fatura
        cancelada continua ocupando a competência; mês antigo entra por fatura avulsa.
      </p>

      {showManual && <ManualInvoiceModal onClose={() => setShowManual(false)} />}
      {confirmRun && (
        <ConfirmModal
          title="Rodar faturamento"
          description="Gera as faturas do mês anterior que faltarem, encerra contratos que chegaram ao fim e manda os lembretes. Pode rodar mais de uma vez: nada é duplicado."
          confirmLabel="Rodar agora"
          destructive={false}
          onClose={() => setConfirmRun(false)}
          onConfirm={runBilling}
        />
      )}
    </div>
  )
}
