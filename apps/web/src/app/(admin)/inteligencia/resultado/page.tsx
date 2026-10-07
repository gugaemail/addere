'use client'

// W7 · Resultado da Inteligência: a pergunta mais cara do produto — a
// sugestão do motor converte mais do que a visita que o vendedor escolhe por
// conta própria? — já calculada e exposta por
// GET /intel/manager/pilot-metrics. Esta tela só formata o que a API
// decompôs; nada aqui recalcula conversão. O recorte por perfil (vendedor,
// gerente ou admin) é resolvido pelo backend — a tela não filtra de novo.
import { useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Info, ShieldCheck, ShoppingCart, Sparkles, Users } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCompanyContext } from '@/contexts/CompanyContext'
import { usePilotMetrics } from '@/hooks/useIntel'
import { getApiErrorMessage } from '@/lib/api'
import { needsActiveCompany, pctLabel, ppLabel, todayInSaoPaulo } from '@/lib/intel-helpers'
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
      <Card className="flex items-center gap-3 border-warning/30 bg-warning/5">
        <ArrowDownRight size={20} strokeWidth={1.75} className="shrink-0 text-warning" aria-hidden />
        <p className="text-sm font-medium text-[var(--text-primary)]">{lift.text}</p>
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
