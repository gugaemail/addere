'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Pencil, XCircle } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import type { ClientListItemDto, LlmUsageDetailDto, LlmUsageRow } from '@addere/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { Table, type Column } from '@/components/ui/Table'
import { BRAND } from '@/lib/brand-tokens'
import { getApiErrorMessage } from '@/lib/api'
import { brlCompact, monthLongLabel } from '@/lib/billing-dashboard'
import { cn, formatCurrency } from '@/lib/utils'
import { agentStatsLine } from '@/lib/intel-helpers'
import { useClientLlmUsage, useUpdateLlmBudget } from '@/hooks/useBilling'
import {
  BUDGET_STATUS_LABELS,
  budgetStatus,
  dayLabel,
  formatCost,
  formatPct,
  formatTokens,
  formatUsd,
  kindLabel,
  pctOfMonthlyFee,
  rateLabel,
  vendorLabel,
  type BudgetStatus,
} from '@/lib/llm-usage-ui'

// Custo de IA de um cliente (Gestão Addere): quanto o agente custou no mês,
// contra o orçamento, e onde está gastando — por tipo de texto, por vendedor e
// dia a dia. O gráfico é uma série só (sem legenda) e tem a tabela embaixo.

const STATUS_STYLE: Record<BudgetStatus, { bar: string; text: string; Icon: typeof CheckCircle2 }> =
  {
    ok: { bar: 'bg-success', text: 'text-success', Icon: CheckCircle2 },
    warning: { bar: 'bg-warning', text: 'text-warning', Icon: AlertTriangle },
    over: { bar: 'bg-danger', text: 'text-danger', Icon: XCircle },
  }

const VENDOR_ROWS = 10

export function LlmUsageModal({
  client,
  onClose,
}: {
  client: ClientListItemDto
  onClose: () => void
}) {
  const { data, isLoading, error, refetch } = useClientLlmUsage(client.id)

  return (
    <Modal isOpen onClose={onClose} title={`Custo de IA — ${client.name}`} className="max-w-4xl">
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : error || !data ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="font-semibold text-danger">Erro ao carregar o consumo</p>
          <p className="text-sm text-[var(--text-muted)]">
            {getApiErrorMessage(error, 'Erro ao carregar o consumo')}
          </p>
          <Button onClick={() => refetch()}>Tentar novamente</Button>
        </div>
      ) : (
        <UsageBody client={client} usage={data} />
      )}
    </Modal>
  )
}

function UsageBody({ client, usage }: { client: ClientListItemDto; usage: LlmUsageDetailDto }) {
  const { totals, projection, rate } = usage
  const fee = client.current?.monthlyTotal ?? null
  const feePct = pctOfMonthlyFee(totals.costBrl, fee)

  return (
    <div className="space-y-6 pb-2">
      <p className="text-sm text-[var(--text-muted)]">
        {monthLongLabel(usage.month)} · {rateLabel(rate)}
        {rate.stale && (
          <span className="ml-1 inline-flex items-center gap-1 text-warning">
            <AlertTriangle size={14} strokeWidth={1.5} aria-hidden />
            cotação desatualizada (o BCB não respondeu)
          </span>
        )}
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Custo no mês"
          value={formatCost(totals)}
          sub={`${formatUsd(totals.costUsd)} · ${formatTokens(totals.tokens)} tokens`}
        />
        <Tile
          label="Ritmo até o fim do mês"
          value={formatCost(projection)}
          sub={`${formatTokens(projection.tokens)} tokens no ritmo atual`}
        />
        <Tile
          label="Da mensalidade"
          value={feePct === null ? '—' : formatPct(feePct)}
          sub={fee ? `de ${formatCurrency(fee)}` : 'sem contrato vigente'}
        />
        <Tile
          label="Economia do cache"
          value={formatCost({ costBrl: totals.cacheSavingsBrl, costUsd: totals.cacheSavingsUsd })}
          sub={`${formatTokens(totals.cacheReadTokens)} tokens lidos do cache`}
        />
      </div>

      <BudgetSection client={client} usage={usage} />

      <DailyChart usage={usage} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Ranking
          title="Onde está gastando — por tipo de texto"
          rows={usage.byKind}
          name={kindLabel}
        />
        <Ranking
          title="Por vendedor"
          rows={usage.byVendor.slice(0, VENDOR_ROWS)}
          name={vendorLabel}
          footer={
            usage.byVendor.length > VENDOR_ROWS
              ? `Mais ${usage.byVendor.length - VENDOR_ROWS} vendedor(es) com custo menor.`
              : undefined
          }
        />
      </div>

      <ActivitySection usage={usage} />

      <p className="text-xs text-[var(--text-muted)]">
        Custo = tokens registrados × preço da Anthropic de cada modelo, convertido pela PTAX venda.
        Inclui as tentativas reprovadas no self-check e os testes (eval). Tokens do orçamento:
        entrada + saída + gravação de cache (a leitura de cache sai mais barata e entra só no
        custo). O registro guarda 90 dias.
      </p>
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums text-[var(--text-primary)]">{value}</p>
      <p className="mt-0.5 text-xs text-[var(--text-muted)]">{sub}</p>
    </div>
  )
}

// ─── Orçamento ───────────────────────────────────────────────────────────────

function BudgetSection({ client, usage }: { client: ClientListItemDto; usage: LlmUsageDetailDto }) {
  const [editing, setEditing] = useState(false)
  const { budget, totals, projection } = usage
  const hasBudget = budget.tokens !== null || budget.brl !== null

  return (
    <section className="rounded-xl border border-[var(--border)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)]">
          Orçamento mensal × consumo
        </h3>
        {!editing && (
          <Button variant="ghost" size="sm" leftIcon={Pencil} onClick={() => setEditing(true)}>
            {hasBudget ? 'Alterar' : 'Definir orçamento'}
          </Button>
        )}
      </div>

      {editing ? (
        <BudgetForm client={client} usage={usage} onDone={() => setEditing(false)} />
      ) : !hasBudget ? (
        <p className="text-sm text-[var(--text-muted)]">
          Sem orçamento definido. O teto técnico de {formatTokens(usage.dailyTokenCap)} tokens por
          dia continua valendo.
        </p>
      ) : (
        <div className="space-y-4">
          {budget.tokens !== null && (
            <BudgetBar
              label="Tokens"
              used={formatTokens(totals.tokens)}
              limit={formatTokens(budget.tokens)}
              pct={usage.budget.tokensPct}
              projectedPct={(projection.tokens / budget.tokens) * 100}
            />
          )}
          {budget.brl !== null && (
            <BudgetBar
              label="Reais"
              used={formatCost(totals)}
              limit={formatCurrency(budget.brl)}
              pct={usage.budget.brlPct}
              projectedPct={
                projection.costBrl === null ? null : (projection.costBrl / budget.brl) * 100
              }
            />
          )}
          <p className="text-xs text-[var(--text-muted)]">
            O orçamento é informativo: estourar não desliga o agente. O teto técnico de{' '}
            {formatTokens(usage.dailyTokenCap)} tokens por dia continua valendo.
          </p>
        </div>
      )}
    </section>
  )
}

function BudgetBar({
  label,
  used,
  limit,
  pct,
  projectedPct,
}: {
  label: string
  used: string
  limit: string
  pct: number | null
  projectedPct: number | null
}) {
  const status = budgetStatus(pct)
  if (pct === null || status === null) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        {label}: {used} de {limit} — sem cotação para comparar
      </p>
    )
  }
  const { bar, text, Icon } = STATUS_STYLE[status]
  const projected = projectedPct === null ? null : budgetStatus(projectedPct)

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="text-[var(--text-primary)]">
          <span className="font-medium">{label}:</span> {used} de {limit}
        </span>
        <span className={cn('inline-flex items-center gap-1 font-medium', text)}>
          <Icon size={14} strokeWidth={1.5} aria-hidden />
          {formatPct(pct)} · {BUDGET_STATUS_LABELS[status]}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-[var(--bg-subtle)]"
        role="progressbar"
        aria-label={`${label} do orçamento`}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn('h-full rounded-full', bar)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      {projectedPct !== null && projected !== null && projected !== 'ok' && (
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          No ritmo atual, fecha o mês em {formatPct(Math.round(projectedPct * 10) / 10)} do
          orçamento.
        </p>
      )}
    </div>
  )
}

/** Milhões com vírgula ("4,5") ou R$ ("150,00"); vazio = sem orçamento */
function parseAmount(text: string): number | null | 'invalid' {
  const clean = text.trim().replace(/\./g, '').replace(',', '.')
  if (!clean) return null
  const value = Number(clean)
  return Number.isFinite(value) && value > 0 ? value : 'invalid'
}

function BudgetForm({
  client,
  usage,
  onDone,
}: {
  client: ClientListItemDto
  usage: LlmUsageDetailDto
  onDone: () => void
}) {
  const update = useUpdateLlmBudget(client.id)
  const [tokens, setTokens] = useState(
    usage.budget.tokens === null
      ? ''
      : (usage.budget.tokens / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
  )
  const [brl, setBrl] = useState(
    usage.budget.brl === null
      ? ''
      : usage.budget.brl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
  )
  const tokensValue = parseAmount(tokens)
  const brlValue = parseAmount(brl)
  const invalid = tokensValue === 'invalid' || brlValue === 'invalid'

  async function save() {
    if (tokensValue === 'invalid' || brlValue === 'invalid') return
    try {
      await update.mutateAsync({
        tokens: tokensValue === null ? null : Math.round(tokensValue * 1_000_000),
        brl: brlValue,
      })
      toast.success('Orçamento de IA salvo.')
      onDone()
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao salvar o orçamento.'))
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Tokens por mês (milhões)"
          inputMode="decimal"
          placeholder="ex.: 4,5"
          value={tokens}
          onChange={(e) => setTokens(e.target.value)}
          error={tokensValue === 'invalid' ? 'Informe um número maior que zero' : undefined}
          hint={`Neste mês até agora: ${formatTokens(usage.totals.tokens)}`}
        />
        <Input
          label="Reais por mês"
          inputMode="decimal"
          placeholder="ex.: 150,00"
          value={brl}
          onChange={(e) => setBrl(e.target.value)}
          error={brlValue === 'invalid' ? 'Informe um valor maior que zero' : undefined}
          hint={`Neste mês até agora: ${formatCost(usage.totals)}`}
        />
      </div>
      <p className="text-xs text-[var(--text-muted)]">Deixe em branco para ficar sem orçamento.</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={update.isPending}>
          Cancelar
        </Button>
        <Button onClick={save} loading={update.isPending} disabled={invalid}>
          Salvar
        </Button>
      </div>
    </div>
  )
}

// ─── Dia a dia ───────────────────────────────────────────────────────────────

function DailyChart({ usage }: { usage: LlmUsageDetailDto }) {
  const inBrl = usage.rate.rate !== null
  const points = usage.daily.map((d) => ({
    date: d.date,
    label: dayLabel(d.date),
    value: inBrl ? (d.costBrl ?? 0) : d.costUsd,
    tokens: d.tokens,
  }))
  const money = (v: number) => (inBrl ? formatCurrency(v) : formatUsd(v))

  const columns: Column<(typeof usage.daily)[number]>[] = [
    { key: 'date', header: 'Dia', render: (d) => dayLabel(d.date) },
    {
      key: 'tokens',
      header: 'Tokens',
      className: 'text-right tabular-nums',
      render: (d) => formatTokens(d.tokens),
    },
    {
      key: 'cost',
      header: 'Custo',
      className: 'text-right tabular-nums',
      render: (d) => formatCost(d),
    },
  ]

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">
        Custo por dia ({inBrl ? 'R$' : 'US$'})
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={points}
          margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          barCategoryGap={2}
        >
          <CartesianGrid vertical={false} stroke={BRAND.border} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: BRAND.muted }}
            tickLine={false}
            axisLine={{ stroke: BRAND.border }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: BRAND.muted }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => (inBrl ? brlCompact(v) : formatUsd(v))}
            width={64}
          />
          <Tooltip
            cursor={{ fill: BRAND.tint }}
            formatter={(value: number, _name, item) => [
              `${money(value)} · ${formatTokens(item.payload.tokens)} tokens`,
              'Custo',
            ]}
            labelFormatter={(label: string) => `Dia ${label}`}
          />
          <Bar dataKey="value" fill={BRAND.primary} radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 flex items-center gap-1 text-xs text-[var(--text-muted)]">
        {usage.daysAtCap > 0 && (
          <AlertTriangle size={14} strokeWidth={1.5} className="text-warning" aria-hidden />
        )}
        Teto técnico de {formatTokens(usage.dailyTokenCap)} tokens por dia:{' '}
        {usage.daysAtCap > 0
          ? `atingido em ${usage.daysAtCap} dia(s) neste mês — o agente caiu para o só-motor`
          : 'não atingido neste mês'}
        .
      </p>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-brand">
          Ver os valores em tabela
        </summary>
        <div className="mt-3 rounded-xl border border-[var(--border)]">
          <Table columns={columns} data={usage.daily} rowKey={(d) => d.date} />
        </div>
      </details>
    </section>
  )
}

// ─── Onde está gastando ──────────────────────────────────────────────────────

function Ranking({
  title,
  rows,
  name,
  footer,
}: {
  title: string
  rows: LlmUsageRow[]
  name: (row: LlmUsageRow) => string
  footer?: string
}) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">Nenhuma geração neste mês.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-[var(--text-primary)]">{name(row)}</span>
                <span className="shrink-0 tabular-nums text-[var(--text-primary)]">
                  {formatCost(row)}{' '}
                  <span className="text-[var(--text-muted)]">· {formatPct(row.pct)}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                <div className="h-full rounded-full bg-brand" style={{ width: `${row.pct}%` }} />
              </div>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {row.generations} geração(ões) · {formatTokens(row.tokens)} tokens
              </p>
            </li>
          ))}
        </ul>
      )}
      {footer && <p className="mt-2 text-xs text-[var(--text-muted)]">{footer}</p>}
    </section>
  )
}

// ─── Atividade, modelos e meses ──────────────────────────────────────────────

function ActivitySection({ usage }: { usage: LlmUsageDetailDto }) {
  const unpriced = usage.byModel.filter((m) => !m.priced)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-1 text-sm">
        <h3 className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">Atividade</h3>
        <p className="text-[var(--text-primary)]">
          {usage.totals.generations} geração(ões): {agentStatsLine(usage.sources)}
        </p>
        <p className="text-[var(--text-muted)]">
          {usage.totals.modelCalls} ida(s) ao modelo — a tentativa reprovada no self-check também é
          cobrada
        </p>
        {usage.byModel.map((m) => (
          <p key={m.model} className="text-[var(--text-muted)]">
            {m.model}: {formatCost(m)} · {formatTokens(m.tokens)} tokens
          </p>
        ))}
        {unpriced.length > 0 && (
          <p className="flex items-start gap-1 text-warning">
            <AlertTriangle size={14} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden />
            Modelo sem preço na tabela ({unpriced.map((m) => m.model).join(', ')}): estimado pelo
            Sonnet atual.
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">Últimos meses</h3>
        <ul className="space-y-1 text-sm">
          {usage.history.map((m) => (
            <li key={m.month} className="flex justify-between gap-3">
              <span className="text-[var(--text-primary)]">{monthLongLabel(m.month)}</span>
              <span className="tabular-nums text-[var(--text-primary)]">
                {formatCost(m)}{' '}
                <span className="text-[var(--text-muted)]">· {formatTokens(m.tokens)} tokens</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
