'use client'

// W7 · Resultado da Inteligência: a pergunta mais cara do produto — a
// sugestão do motor converte mais do que a visita que o vendedor escolhe por
// conta própria? — já calculada e exposta por
// GET /intel/manager/pilot-metrics. Esta tela só formata o que a API
// decompôs; nada aqui recalcula conversão. O recorte por perfil (vendedor,
// gerente ou admin) é resolvido pelo backend — a tela não filtra de novo.
import { useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Info, ShieldCheck, ShoppingCart, Sparkles, Users } from 'lucide-react'
import type { ConversionSliceDto } from '@addere/types'
import { useAuth } from '@/contexts/AuthContext'
import { useCompanyContext } from '@/contexts/CompanyContext'
import { useConversionReport, usePilotMetrics } from '@/hooks/useIntel'
import { getApiErrorMessage } from '@/lib/api'
import { brl, needsActiveCompany, pctLabel, ppLabel, todayInSaoPaulo } from '@/lib/intel-helpers'
import {
  liftLabel,
  monthRange,
  ratioSubtitle,
  rangeLabel,
  type LiftLabel,
  type MonthRangeKind,
} from '@/lib/pilot-metrics'
import { SelectCompanyNotice } from '@/components/intel/SelectCompanyNotice'
import { Card } from '@/components/ui/Card'
import { KpiCard } from '@/components/ui/KpiCard'
import { Spinner } from '@/components/ui/Spinner'
import { Tabs } from '@/components/ui/Tabs'

const PERIOD_TABS = [
  { key: 'current', label: 'Este mês' },
  { key: 'previous', label: 'Mês passado' },
  { key: 'last3', label: '3 meses' },
]

export default function ResultadoPage() {
  const { isSuperAdmin } = useAuth()
  const { companyId } = useCompanyContext()
  const [periodKind, setPeriodKind] = useState<MonthRangeKind>('current')

  // SUPERADMIN sem empresa não tem tenant — a busca saira sem companyId e
  // voltaria 400 antes do aviso de "selecione a empresa" aparecer.
  const hasTenant = !needsActiveCompany(isSuperAdmin, companyId)
  const today = todayInSaoPaulo()
  const { from, to } = monthRange(periodKind, today)

  const { data, isLoading, isError, error } = usePilotMetrics(from, to, hasTenant)

  if (!hasTenant) return <SelectCompanyNotice />

  const lift = data ? liftLabel(data.liftPp) : null
  const isEmpty = data ? data.suggestionConversion.total === 0 : false

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
          Resultado da Inteligência
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          {data
            ? `${rangeLabel(data.range.fromYmd, data.range.toYmd)} · conversão medida em ${data.conversionDays} dias`
            : 'A sugestão do motor converte mais do que a visita fora do plano?'}
        </p>
      </header>

      <Tabs
        tabs={PERIOD_TABS}
        active={periodKind}
        onChange={(key) => setPeriodKind(key as MonthRangeKind)}
      />

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}

      {isError && (
        <Card className="border-danger/30 bg-danger/5">
          <p className="text-sm text-[var(--text-secondary)]">
            {getApiErrorMessage(error, 'Não foi possível carregar o resultado da Inteligência.')}
          </p>
        </Card>
      )}

      {!isLoading && data && isEmpty && (
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">
            Ainda não há sugestões com janela de conversão fechada neste período.
          </p>
        </Card>
      )}

      {!isLoading && data && !isEmpty && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <KpiCard
              label="Conversão da sugestão"
              value={pctLabel(data.suggestionConversion.pct)}
              icon={Sparkles}
              tone="brand"
              hint={ratioSubtitle(data.suggestionConversion)}
            />
            <KpiCard
              label="Conversão fora do plano"
              value={pctLabel(data.outOfPlanConversion.pct)}
              icon={ShoppingCart}
              hint={ratioSubtitle(data.outOfPlanConversion)}
            />
          </div>

          {lift && <LiftBanner liftPp={data.liftPp} lift={lift} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <KpiCard
              label="Positivação da carteira"
              value={pctLabel(data.portfolioPositivation.pct)}
              icon={Users}
              hint={ratioSubtitle(data.portfolioPositivation)}
            />
            <KpiCard
              label="Recuperação de risco"
              value={pctLabel(data.atRiskRecovery.pct)}
              icon={ShieldCheck}
              hint={ratioSubtitle(data.atRiskRecovery, 'em risco')}
            />
          </div>

          <Card className="flex items-start gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10">
              <Info size={18} strokeWidth={1.5} className="text-brand" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                Como lemos isto
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                O denominador é cliente, não sugestão: um cliente sugerido três vezes conta uma
                vez, a partir da primeira sugestão do período.
              </p>
            </div>
          </Card>
        </>
      )}

      <ConversionSection
        from={from}
        to={to}
        enabled={hasTenant}
        periodLabel={PERIOD_TABS.find((tab) => tab.key === periodKind)?.label ?? ''}
      />
    </div>
  )
}

/**
 * A faixa central da tela. O lift negativo é informação legítima — a
 * escolha do vendedor converteu mais do que a sugestão do motor nesta
 * janela — e tem tratamento visual próprio (seta para baixo, fundo de
 * atenção): esconder esse resultado destruiria a credibilidade da tela.
 */
function LiftBanner({ liftPp, lift }: { liftPp: number | null; lift: LiftLabel }) {
  if (lift.tone === 'indefinido') {
    return (
      <Card className="flex items-center gap-3">
        <Info size={18} strokeWidth={1.5} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
        <p className="text-sm text-[var(--text-secondary)]">{lift.text}</p>
      </Card>
    )
  }

  if (lift.tone === 'negativo') {
    return (
      <Card className="flex items-start gap-3 border-warning/30 bg-warning/5">
        <ArrowDownRight size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-warning" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {ppLabel(liftPp)} contra a sugestão do motor
          </p>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{lift.text}</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="flex items-start gap-3 border-success/30 bg-success/5">
      <ArrowUpRight size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-success" aria-hidden />
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          {ppLabel(liftPp)} a favor da sugestão do motor
        </p>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{lift.text}</p>
      </div>
    </Card>
  )
}

/**
 * Conversão em reais por origem da visita (plano 004) — os dois blocos
 * abaixo dos cartões de conversão (que são em %). Busca separada da de
 * usePilotMetrics: mesmo período da página (um seletor só, nunca um por
 * bloco), mas o estado de carregamento/erro/vazio é próprio, porque é uma
 * pergunta diferente ("quanto rendeu" em vez de "quanto converteu").
 */
function ConversionSection({
  from,
  to,
  enabled,
  periodLabel,
}: {
  from: string
  to: string
  enabled: boolean
  periodLabel: string
}) {
  const { data, isLoading, isError, error } = useConversionReport(from, to, enabled)

  if (!enabled) return null

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  if (isError) {
    return (
      <Card className="border-danger/30 bg-danger/5">
        <p className="text-sm text-[var(--text-secondary)]">
          {getApiErrorMessage(error, 'Não foi possível carregar a conversão em reais.')}
        </p>
      </Card>
    )
  }

  if (!data || data.total.visits === 0) {
    return (
      <Card>
        <p className="text-sm text-[var(--text-secondary)]">
          Ainda não há visitas conciliadas com pedido neste período.
        </p>
      </Card>
    )
  }

  const reconciledTotal = data.reconciliation.strong + data.reconciliation.byDate

  return (
    <>
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Quanto cada visita rendeu</h2>
          <span className="text-xs text-[var(--text-muted)]">
            {rangeLabel(data.range.fromYmd, data.range.toYmd)} · {periodLabel}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[var(--text-muted)]">
                <th className="py-1 pr-2 font-medium" />
                <th className="py-1 pr-2 font-medium">Visitas</th>
                <th className="py-1 pr-2 font-medium">Viraram pedido</th>
                <th className="py-1 pr-2 font-medium">Vendido</th>
                <th className="py-1 pr-2 font-medium">Ticket médio</th>
              </tr>
            </thead>
            <tbody>
              <ConversionRow label="Do plano" slice={data.planned} />
              <ConversionRow label="Fora do plano" slice={data.outOfPlan} />
              <tr className="border-t-2 border-[var(--border)] font-semibold">
                <ConversionRowCells label="Total" slice={data.total} />
              </tr>
            </tbody>
          </table>
        </div>

        {data.valuePerVisitDiff !== null && (
          <p className="text-sm text-[var(--text-secondary)]">
            {data.valuePerVisitDiff >= 0 ? (
              <>A visita sugerida rendeu {brl(data.valuePerVisitDiff)} a mais por visita realizada.</>
            ) : (
              <>
                Nesta janela, a visita fora do plano rendeu {brl(Math.abs(data.valuePerVisitDiff))} a mais
                por visita realizada.
              </>
            )}
          </p>
        )}

        {data.reconciliation.byDate > 0 && (
          <p className="text-xs text-[var(--text-muted)]">
            {data.reconciliation.byDate} de {reconciledTotal} pedidos conciliados por data, não por vínculo
            direto.
          </p>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">O motor acertou o tamanho do dia?</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-[var(--text-muted)]">Valor esperado das paradas visitadas</p>
            <p className="mt-0.5 text-lg font-semibold text-[var(--text-primary)]">
              {brl(data.expected.expectedAmount)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)]">Vendido nessas mesmas paradas</p>
            <p className="mt-0.5 text-lg font-semibold text-[var(--text-primary)]">
              {brl(data.expected.soldAmount)}
            </p>
          </div>
        </div>

        {data.expected.ratioPct !== null && (
          <div className="space-y-1">
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-[var(--border)]"
              role="progressbar"
              aria-valuenow={data.expected.ratioPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Percentual vendido sobre o esperado"
            >
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${Math.max(0, Math.min(data.expected.ratioPct, 100))}%` }}
              />
            </div>
            <p className="text-xs text-[var(--text-muted)]">{pctLabel(data.expected.ratioPct)} do esperado</p>
          </div>
        )}

        <div className="flex items-start gap-3 rounded-lg bg-brand/5 p-3">
          <Info size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-brand" aria-hidden />
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
            O valor esperado é ticket médio × probabilidade de compra, somado sobre as paradas. Ele não
            prevê o tamanho de um pedido específico — só faz sentido no agregado. Por isso não há esta
            conta por cliente.
          </p>
        </div>
      </Card>
    </>
  )
}

function ConversionRow({ label, slice }: { label: string; slice: ConversionSliceDto }) {
  return (
    <tr className="border-t border-[var(--border)]">
      <ConversionRowCells label={label} slice={slice} />
    </tr>
  )
}

function ConversionRowCells({ label, slice }: { label: string; slice: ConversionSliceDto }) {
  return (
    <>
      <td className="py-1.5 pr-2 text-[var(--text-secondary)]">{label}</td>
      <td className="py-1.5 pr-2 text-[var(--text-primary)]">{slice.visits}</td>
      <td className="py-1.5 pr-2 text-[var(--text-primary)]">{slice.withOrder}</td>
      <td className="py-1.5 pr-2 text-[var(--text-primary)]">{brl(slice.soldAmount)}</td>
      <td className="py-1.5 pr-2 text-[var(--text-primary)]">
        {slice.avgTicket === null ? '—' : brl(slice.avgTicket)}
      </td>
    </>
  )
}
