'use client'

// W6 · Onde estou perdendo (E21): a receita do mês decomposta contra a base
// dos meses fechados anteriores — por vendedor ou equipe inteira —, com os
// clientes e produtos responsáveis e o atalho para pôr o cliente no plano de
// hoje. A tela só formata o que a API decompôs; nada aqui recalcula receita.
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Percent, Scale, Sparkles, TrendingDown, Wallet } from 'lucide-react'
import type { LossCustomerDto, LossKind, LossProductDto } from '@addere/types'
import { useAuth } from '@/contexts/AuthContext'
import { useCompanyContext } from '@/contexts/CompanyContext'
import { useAddToPlan, useLosses, useTeamReport } from '@/hooks/useIntel'
import { getApiErrorMessage } from '@/lib/api'
import {
  brl,
  formatDiffPct,
  needsActiveCompany,
  rangeLabel,
  todayInSaoPaulo,
} from '@/lib/intel-helpers'
import {
  BASELINE_OPTIONS,
  LOSS_KIND_META,
  componentsByKind,
  customerKey,
  diffTone,
  lossesSummaryText,
  planItemFromLoss,
  signedBrl,
  type BaselineMonths,
  type LossTone,
} from '@/lib/losses'
import { cn } from '@/lib/utils'
import { SelectCompanyNotice } from '@/components/intel/SelectCompanyNotice'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FreshnessBadge } from '@/components/ui/FreshnessBadge'
import { KpiCard } from '@/components/ui/KpiCard'
import { Spinner } from '@/components/ui/Spinner'
import { StatusPill } from '@/components/ui/StatusPill'
import { Table, type Column } from '@/components/ui/Table'

const CONTROL_CLASS =
  'rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-primary)]'

const TONE_TEXT: Record<LossTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-[var(--text-primary)]',
}

const TONE_CARD: Record<LossTone, string> = {
  success: 'border-success/30 bg-success/5',
  warning: 'border-warning/30 bg-warning/5',
  danger: 'border-danger/30 bg-danger/5',
  neutral: '',
}

function countLabel(kind: LossKind, count: number) {
  const unit = kind === 'PRODUCT_DROP' ? 'produto' : 'cliente'
  return `${count} ${unit}${count === 1 ? '' : 's'}`
}

export default function PerdasPage() {
  const { isSuperAdmin } = useAuth()
  const { companyId } = useCompanyContext()
  const [date, setDate] = useState(() => todayInSaoPaulo())
  const [vendorCode, setVendorCode] = useState('')
  const [baselineMonths, setBaselineMonths] = useState<BaselineMonths>(3)
  // Quem acabou de entrar no plano vira "No plano" na hora, antes do refetch
  const [justAdded, setJustAdded] = useState<string[]>([])

  // SUPERADMIN sem empresa não tem tenant — as buscas sairiam sem companyId e
  // voltariam 400 antes do aviso aparecer
  const hasTenant = !needsActiveCompany(isSuperAdmin, companyId)
  const team = useTeamReport(date, 'day', hasTenant)
  const { data, isLoading, isError, error } = useLosses(
    { date, vendorCode, baselineMonths },
    hasTenant
  )
  const addToPlan = useAddToPlan()

  const sellers = useMemo(() => team.data?.sellers ?? [], [team.data])
  const sellerName = (code: string | null) =>
    sellers.find((s) => s.vendorCode === code)?.name ?? code ?? '—'
  const scopeLabel = vendorCode ? sellerName(vendorCode) : 'Equipe inteira'

  const components = useMemo(() => componentsByKind(data?.components ?? []), [data])
  const summary = data ? (data.text ?? lossesSummaryText(data, scopeLabel)) : ''

  if (!hasTenant) return <SelectCompanyNotice />

  function handleAdd(customer: LossCustomerDto) {
    const input = planItemFromLoss(customer)
    if (!input) return toast.error('Cliente sem vendedor — não há plano onde pôr')
    addToPlan.mutate(input, {
      onSuccess: () => {
        setJustAdded((prev) => [...prev, customerKey(customer)])
        toast.success(
          `${customer.customerName} entrou no plano de hoje de ${sellerName(customer.vendorCode)}`
        )
      },
      onError: (err) => toast.error(getApiErrorMessage(err, 'Erro ao pôr no plano')),
    })
  }

  const customerColumns: Column<LossCustomerDto>[] = [
    {
      key: 'customer',
      header: 'Cliente',
      render: (c) => (
        <div>
          <p className="font-medium text-[var(--text-primary)]">{c.customerName}</p>
          <p className="text-xs text-[var(--text-muted)]">
            {c.customerCode}-{c.loja}
          </p>
        </div>
      ),
    },
    { key: 'vendor', header: 'Vendedor', render: (c) => sellerName(c.vendorCode) },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (c.status ? <StatusPill status={c.status} /> : '—'),
    },
    {
      key: 'baseline',
      header: 'Base',
      className: 'text-right tabular-nums',
      render: (c) => brl(c.baselineAmount),
    },
    {
      key: 'current',
      header: 'Atual',
      className: 'text-right tabular-nums',
      render: (c) => brl(c.currentAmount),
    },
    {
      key: 'diff',
      header: 'Diferença',
      className: 'text-right tabular-nums',
      render: (c) => (
        <span className={cn('font-semibold', TONE_TEXT[diffTone(c.diffAmount)])}>
          {signedBrl(c.diffAmount)}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Motivo',
      render: (c) => <span className="text-xs">{c.reason}</span>,
    },
    {
      key: 'action',
      header: '',
      className: 'text-right',
      render: (c) => {
        const inPlan = c.inPlanToday || justAdded.includes(customerKey(c))
        const pending =
          addToPlan.isPending &&
          addToPlan.variables?.customerCode === c.customerCode &&
          addToPlan.variables?.loja === c.loja
        if (inPlan) {
          return (
            <Button size="xs" variant="outline" disabled>
              No plano
            </Button>
          )
        }
        if (!c.vendorCode) {
          return (
            <Button size="xs" variant="outline" disabled title="Cliente sem vendedor no ERP">
              Sem vendedor
            </Button>
          )
        }
        return (
          <Button
            size="xs"
            variant="secondary"
            loading={pending}
            disabled={addToPlan.isPending && !pending}
            onClick={() => handleAdd(c)}
          >
            Pôr no plano
          </Button>
        )
      },
    },
  ]

  const productColumns: Column<LossProductDto>[] = [
    {
      key: 'product',
      header: 'Produto',
      render: (p) => (
        <div>
          <p className="font-medium text-[var(--text-primary)]">{p.productDesc ?? p.productCode}</p>
          {p.productDesc && <p className="text-xs text-[var(--text-muted)]">{p.productCode}</p>}
        </div>
      ),
    },
    {
      key: 'baseline',
      header: 'Base',
      className: 'text-right tabular-nums',
      render: (p) => brl(p.baselineAmount),
    },
    {
      key: 'current',
      header: 'Atual',
      className: 'text-right tabular-nums',
      render: (p) => brl(p.currentAmount),
    },
    {
      key: 'diffPct',
      header: 'Variação',
      className: 'text-right tabular-nums',
      render: (p) => (
        <span className={cn('font-semibold', TONE_TEXT[diffTone(p.diffPct)])}>
          {formatDiffPct(p.diffPct)}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Onde estou perdendo
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            {data
              ? `${rangeLabel(data.period)} · ${scopeLabel} · base de ${data.period.baselineMonths} meses`
              : 'Receita do mês contra a base dos meses fechados anteriores'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {data && <FreshnessBadge updatedAt={data.lastSyncAt} />}
          <select
            aria-label="Vendedor"
            value={vendorCode}
            onChange={(e) => setVendorCode(e.target.value)}
            className={CONTROL_CLASS}
          >
            <option value="">Equipe inteira</option>
            {sellers.map((s) => (
              <option key={s.userId} value={s.vendorCode}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Base de comparação"
            value={baselineMonths}
            onChange={(e) => setBaselineMonths(Number(e.target.value) as BaselineMonths)}
            className={CONTROL_CLASS}
          >
            {BASELINE_OPTIONS.map((months) => (
              <option key={months} value={months}>
                Base de {months} meses
              </option>
            ))}
          </select>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            aria-label="Dia de referência"
            className={CONTROL_CLASS}
          />
        </div>
      </header>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}

      {isError && (
        <Card className="border-danger/30 bg-danger/5">
          <p className="text-sm text-[var(--text-secondary)]">
            {getApiErrorMessage(error, 'Não foi possível carregar o relatório de perdas.')}
          </p>
        </Card>
      )}

      {!isLoading && data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Receita base"
              value={brl(data.totals.baselineAmount)}
              icon={Scale}
              hint={`${data.period.baselineMonths} meses fechados, normalizados para o período`}
            />
            <KpiCard
              label="Receita atual"
              value={brl(data.totals.currentAmount)}
              icon={Wallet}
              tone="brand"
              hint={rangeLabel(data.period)}
            />
            <KpiCard
              label="Diferença"
              value={signedBrl(data.totals.diffAmount)}
              icon={TrendingDown}
              tone={diffTone(data.totals.diffAmount)}
              hint="Atual menos base"
            />
            <KpiCard
              label="Diferença %"
              value={formatDiffPct(data.totals.diffPct)}
              icon={Percent}
              tone={diffTone(data.totals.diffPct)}
              hint="Sobre a receita base"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {components.map((component) => {
              const meta = LOSS_KIND_META[component.kind]
              return (
                <Card key={component.kind} className={cn('space-y-1', TONE_CARD[meta.tone])}>
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                    {meta.label}
                  </p>
                  <p className={cn('text-xl font-bold tracking-tight', TONE_TEXT[meta.tone])}>
                    {signedBrl(component.amount)}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {countLabel(component.kind, component.count)}
                  </p>
                </Card>
              )
            })}
          </div>

          <Card className="flex items-start gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10">
              <Sparkles size={18} strokeWidth={1.5} className="text-brand" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                {data.text ? 'Leitura do agente' : 'Leitura do motor'}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">{summary}</p>
            </div>
          </Card>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Clientes — maiores perdas primeiro
            </h2>
            <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
              <Table
                columns={customerColumns}
                data={data.customers}
                rowKey={customerKey}
                className="rounded-none"
                emptyMessage="Nenhum cliente com queda no período."
              />
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Produtos em queda</h2>
            <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
              <Table
                columns={productColumns}
                data={data.products}
                rowKey={(p) => p.productCode}
                className="rounded-none"
                emptyMessage="Nenhum produto em queda no período."
              />
            </div>
          </section>
        </>
      )}
    </div>
  )
}
