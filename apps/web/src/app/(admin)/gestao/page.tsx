'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  CalendarClock,
  ChevronRight,
  FileSignature,
  Gauge,
  HandCoins,
  Inbox,
  Receipt,
  TriangleAlert,
  Wallet,
} from 'lucide-react'
import {
  CLIENT_STATUS_LABELS,
  CLIENT_STATUS_ORDER,
  formatBrl,
  moneyToCents,
  type BillingDashboardDto,
  type DashboardInvoiceItem,
} from '@addere/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { KpiCard } from '@/components/ui/KpiCard'
import { StatCard } from '@/components/ui/StatCard'
import { getApiErrorMessage } from '@/lib/api'
import { formatInvoiceNumber } from '@/lib/billing-format'
import {
  agoLabel,
  billingDay,
  countLabel,
  daysLabel,
  daysSince,
  documentKindsLabel,
  dueInLabel,
  hasRevenue,
  isEmptyDashboard,
  monthName,
  seatsPct,
  timeInSaoPaulo,
} from '@/lib/billing-dashboard'
import { cn } from '@/lib/utils'
import { useBillingDashboard } from '@/hooks/useBilling'
import { RevenueChart } from './RevenueChart'

// Painel da Gestão Addere (plano 018) — home do SUPERADMIN. Só leitura: os
// números vêm prontos de GET /admin/billing/dashboard (somados em Decimal na
// API) e nada é somado de novo aqui. O gate é o gestao/layout.tsx.

export default function GestaoPainelPage() {
  const { data, isLoading, isError, error } = useBillingDashboard()

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Painel de gestão
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Contratos, licenças e cobrança de todos os clientes · valores em R$
          </p>
        </div>
        {data && (
          <p className="text-xs text-[var(--text-muted)]">
            Atualizado às {timeInSaoPaulo(data.generatedAt)}
          </p>
        )}
      </header>

      {isLoading && <DashboardSkeleton />}

      {isError && (
        <Card className="border-danger/30 bg-danger/5">
          <p className="text-sm text-[var(--text-secondary)]">
            {getApiErrorMessage(error, 'Não foi possível carregar o painel de gestão.')}
          </p>
        </Card>
      )}

      {data && <DashboardBody dto={data} />}
    </div>
  )
}

// ─── Corpo ────────────────────────────────────────────────────────────────────

function DashboardBody({ dto }: { dto: BillingDashboardDto }) {
  const empty = isEmptyDashboard(dto)

  return (
    <>
      {empty ? <NoActiveContract /> : <KpiGrid dto={dto} />}

      <section aria-labelledby="clientes-por-situacao" className="space-y-3">
        <h2
          id="clientes-por-situacao"
          className="text-sm font-semibold text-[var(--text-secondary)]"
        >
          Clientes por situação
        </h2>
        {/* Sete colunas só a partir de xl: em lg o rótulo "Aguardando aceite" não cabe */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
          {CLIENT_STATUS_ORDER.map((status) => (
            <StatCard
              key={status}
              label={CLIENT_STATUS_LABELS[status]}
              value={dto.clientsByStatus[status]}
            />
          ))}
        </div>
      </section>

      {!empty &&
        (hasRevenue(dto.revenue12m) ? (
          <RevenueChart data={dto.revenue12m} />
        ) : (
          // Com contrato ativo e sem fatura ainda (o primeiro mês depois do
          // aceite): uma linha reta em zero pareceria queda
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)]">
              Receita — últimos 12 meses fechados
            </h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Nenhuma fatura emitida nos últimos 12 meses.
            </p>
          </Card>
        ))}

      {!empty && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ListCard
            title="Vencidas"
            total={dto.overdueInvoices.total}
            shown={dto.overdueInvoices.items.length}
            emptyText="Nenhuma fatura vencida."
            moreHref="/gestao/faturas"
            moreLabel="Ver todas as faturas"
          >
            {dto.overdueInvoices.items.map((inv) => (
              <InvoiceRow
                key={inv.invoiceId}
                invoice={inv}
                detail={`venceu ${billingDay(inv.dueDate)} · ${daysLabel(inv.daysOverdue)}`}
              />
            ))}
          </ListCard>
          <ListCard
            title="Próximos vencimentos"
            total={dto.upcomingInvoices.total}
            shown={dto.upcomingInvoices.items.length}
            emptyText="Nenhum vencimento nos próximos 15 dias."
            moreHref="/gestao/faturas"
            moreLabel="Ver todas as faturas"
          >
            {dto.upcomingInvoices.items.map((inv) => (
              <InvoiceRow
                key={inv.invoiceId}
                invoice={inv}
                detail={`vence ${billingDay(inv.dueDate)} · ${dueInLabel(inv.dueDate, dto.today)}`}
              />
            ))}
          </ListCard>
        </div>
      )}

      <div className={cn('grid gap-4', empty ? 'lg:grid-cols-2' : 'lg:grid-cols-3')}>
        <ListCard
          title="Aguardando aceite"
          total={dto.pendingAcceptance.total}
          shown={dto.pendingAcceptance.items.length}
          emptyText="Nenhum documento enviado."
          moreHref="/gestao/clientes"
          moreLabel="Ver os clientes"
        >
          {dto.pendingAcceptance.items.map((doc) => (
            <CompanyRow
              key={doc.documentId}
              companyId={doc.companyId}
              name={doc.companyName}
              detail={`${doc.kind === 'CONTRACT' ? 'Contrato' : 'Aditivo'} · ${agoLabel(doc.daysWaiting)}`}
            />
          ))}
        </ListCard>
        <ListCard
          title="Solicitações pendentes"
          total={dto.pendingLicenseRequests.total}
          shown={dto.pendingLicenseRequests.items.length}
          emptyText="Nenhum pedido de licença."
          moreHref="/gestao/solicitacoes"
          moreLabel="Ver todas as solicitações"
        >
          {dto.pendingLicenseRequests.items.map((req) => (
            <CompanyRow
              key={req.requestId}
              companyId={req.companyId}
              name={req.companyName}
              detail={`+${countLabel(req.quantity, 'licença', 'licenças')} · ${agoLabel(daysSince(req.createdAt, dto.today))}`}
            />
          ))}
        </ListCard>
        {!empty && (
          <ListCard
            title="Perto do limite"
            total={dto.nearSeatLimit.total}
            shown={dto.nearSeatLimit.items.length}
            emptyText="Ninguém perto do limite."
            moreHref="/gestao/clientes"
            moreLabel="Ver os clientes"
          >
            {dto.nearSeatLimit.items.map((s) => (
              <CompanyRow
                key={s.companyId}
                companyId={s.companyId}
                name={s.companyName}
                detail={`${s.used} / ${s.limit} · ${seatLimitLabel(s)}`}
              />
            ))}
          </ListCard>
        )}
      </div>
    </>
  )
}

// Decisão 5: acima do limite ninguém é desativado; a lista diz que passou
function seatLimitLabel(s: { used: number; limit: number }): string {
  if (s.used > s.limit) return 'acima do limite'
  if (s.used === s.limit) return 'no limite'
  return `${seatsPct(s)} %`
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

function KpiGrid({ dto }: { dto: BillingDashboardDto }) {
  const { mrr, receivable, seats } = dto
  const pct = seatsPct(seats)
  const hasOverdue = moneyToCents(receivable.overdue.amount) > 0

  return (
    // Uma coluna no celular e quatro só a partir de xl: valor em reais no
    // text-3xl do KpiCard não cabe em quatro colunas ao lado da sidebar em 1024 px
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="MRR contratado"
        icon={Wallet}
        value={formatBrl(mrr.contracted)}
        hint={countLabel(mrr.activeContracts, 'contrato ativo', 'contratos ativos')}
      />
      <KpiCard
        label="MRR faturável"
        icon={Receipt}
        value={formatBrl(mrr.billable)}
        hint={
          mrr.graceContracts === 0
            ? 'todos os contratos ativos já são cobrados'
            : `${countLabel(mrr.graceContracts, 'contrato', 'contratos')} fora da soma: mês do aceite ou carência`
        }
      />
      <KpiCard
        label="Recebido no mês"
        icon={HandCoins}
        value={formatBrl(receivable.receivedThisMonth.amount)}
        hint={`${countLabel(receivable.receivedThisMonth.count, 'baixa', 'baixas')} em ${monthName(dto.today.slice(0, 7))}`}
      />
      <KpiCard
        label="A receber"
        icon={Inbox}
        value={formatBrl(receivable.open.amount)}
        hint={countLabel(receivable.open.count, 'fatura em aberto', 'faturas em aberto')}
      />
      <KpiCard
        label="Vencido"
        icon={TriangleAlert}
        value={formatBrl(receivable.overdue.amount)}
        hint={countLabel(receivable.overdue.count, 'fatura', 'faturas')}
        tone={hasOverdue ? 'danger' : 'neutral'}
      />
      <KpiCard
        label="Vence em 15 dias"
        icon={CalendarClock}
        value={formatBrl(receivable.dueNext15Days.amount)}
        hint={countLabel(receivable.dueNext15Days.count, 'fatura', 'faturas')}
      />
      <KpiCard
        label="Licenças"
        icon={Gauge}
        value={mrr.activeContracts > 0 ? `${seats.used} / ${seats.limit}` : '—'}
        hint={mrr.activeContracts > 0 && pct !== null ? `${pct} % ocupadas` : 'sem contrato ativo'}
      />
      <KpiCard
        label="Aguardando aceite"
        icon={FileSignature}
        value={String(dto.pendingAcceptance.total)}
        hint={documentKindsLabel(dto.pendingAcceptance)}
      />
    </div>
  )
}

// ─── Estado B: nenhum contrato ativo ──────────────────────────────────────────

function NoActiveContract() {
  const router = useRouter()
  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-[var(--text-primary)]">
        Nenhum contrato ativo ainda
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
        O MRR, as faturas e as licenças aparecem aqui quando o primeiro cliente aceitar o contrato.
        Enquanto isso, as empresas ficam sem limite e sem cobrança.
      </p>
      <div className="mt-4 flex justify-end">
        <Button rightIcon={ArrowRight} onClick={() => router.push('/gestao/clientes')}>
          Ir para Clientes
        </Button>
      </div>
    </Card>
  )
}

// ─── Listas curtas (padrão da lista de feedbacks do piloto) ───────────────────

function ListCard({
  title,
  total,
  shown,
  emptyText,
  moreHref,
  moreLabel,
  children,
}: {
  title: string
  total: number
  shown: number
  emptyText: string
  moreHref: string
  moreLabel: string
  children: React.ReactNode
}) {
  return (
    <Card className="flex flex-col overflow-hidden p-0">
      <div className="border-b border-[var(--border)] px-6 py-4">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)]">
          {title} ({total})
        </h2>
      </div>
      {total === 0 ? (
        <p className="px-6 py-4 text-sm text-[var(--text-muted)]">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">{children}</ul>
      )}
      {total > shown && (
        <div className="mt-auto border-t border-[var(--border)] px-6 py-3 text-right">
          <Link href={moreHref} className="text-sm font-medium text-brand hover:underline">
            {moreLabel}
          </Link>
        </div>
      )}
    </Card>
  )
}

function CompanyRow({
  companyId,
  name,
  detail,
  amount,
}: {
  companyId: string
  name: string
  detail: string
  amount?: string
}) {
  return (
    <li>
      <Link
        href={`/gestao/clientes/${companyId}`}
        className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-[var(--bg-subtle)] focus-visible:bg-[var(--bg-subtle)] focus-visible:outline-none"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-medium text-[var(--text-primary)]">{name}</span>
            {amount && (
              <span className="shrink-0 text-sm font-medium tabular-nums text-[var(--text-primary)]">
                {amount}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{detail}</p>
        </div>
        <ChevronRight
          size={16}
          strokeWidth={1.5}
          className="shrink-0 text-[var(--text-muted)]"
          aria-hidden
        />
      </Link>
    </li>
  )
}

function InvoiceRow({ invoice, detail }: { invoice: DashboardInvoiceItem; detail: string }) {
  return (
    <CompanyRow
      companyId={invoice.companyId}
      name={invoice.companyName}
      amount={formatBrl(invoice.total)}
      detail={`nº ${formatInvoiceNumber(invoice.number)} · ${detail}`}
    />
  )
}

// ─── Carregando ───────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 sm:px-5 sm:py-4">
      <div className="h-3 w-24 rounded bg-[var(--bg-subtle)] animate-skeleton-pulse" />
      <div className="h-8 w-20 rounded bg-[var(--bg-subtle)] animate-skeleton-pulse" />
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Carregando o painel de gestão</span>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="h-80 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] animate-skeleton-pulse" />
    </div>
  )
}
