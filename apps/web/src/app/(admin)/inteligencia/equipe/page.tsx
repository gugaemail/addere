'use client'

// W1 · Equipe em campo (E11): cabeçalho com data/em rota/frescor, toggle
// Hoje/Semana/Mês, 4 KPIs, card por vendedor e alertas determinísticos.
// O mapa da equipe é fase 2 (D9) — aqui fica só o lugar dele.
import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarCheck, CheckCircle2, Map, ShoppingCart, Users } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCompanyContext } from '@/contexts/CompanyContext'
import {
  useTeamReport,
  type TeamAlert,
  type TeamRange,
  type TeamSellerCard,
} from '@/hooks/useIntel'
import { needsActiveCompany, pctLabel, rangeLabel, todayInSaoPaulo } from '@/lib/intel-helpers'
import { SelectCompanyNotice } from '@/components/intel/SelectCompanyNotice'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { FreshnessBadge } from '@/components/ui/FreshnessBadge'
import { KpiCard } from '@/components/ui/KpiCard'
import { Spinner } from '@/components/ui/Spinner'
import { Tabs } from '@/components/ui/Tabs'

const RANGE_TABS = [
  { key: 'day', label: 'Hoje' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mês' },
]

export default function EquipePage() {
  const { isSuperAdmin } = useAuth()
  const { companyId } = useCompanyContext()
  const [range, setRange] = useState<TeamRange>('day')
  const [date, setDate] = useState(() => todayInSaoPaulo())
  // Alertas dispensados nesta sessão ("Concordo") — fixar de vez é fase 3 (F3)
  const [dismissed, setDismissed] = useState<string[]>([])

  const { data, isLoading } = useTeamReport(date, range)

  const onRoute = useMemo(
    () => (data?.sellers ?? []).filter((seller) => seller.done > 0).length,
    [data]
  )

  if (needsActiveCompany(isSuperAdmin, companyId)) return <SelectCompanyNotice />

  const dismiss = (id: string) => setDismissed((prev) => [...prev, id])

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Equipe em campo
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            {data ? rangeLabel(data.range) : '—'} · {onRoute} em rota
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data && <FreshnessBadge updatedAt={data.lastSyncAt} />}
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            aria-label="Dia de referência"
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
          />
        </div>
      </header>

      <Tabs tabs={RANGE_TABS} active={range} onChange={(key) => setRange(key as TeamRange)} />

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}

      {!isLoading && data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Visitas previstas"
              value={String(data.totals.planned)}
              icon={CalendarCheck}
              hint={`${data.totals.sellers} vendedor(es) no período`}
            />
            <KpiCard
              label="Aderência"
              value={pctLabel(data.totals.adherencePct)}
              icon={CheckCircle2}
              tone="brand"
              hint={`${data.totals.done} de ${data.totals.planned} realizadas`}
            />
            <KpiCard
              label="Positivação da visita"
              value={pctLabel(data.totals.visitPositivationPct)}
              icon={ShoppingCart}
              hint="Visitas com pedido, entre as com desfecho"
            />
            <KpiCard
              label="Positivação da carteira"
              value={pctLabel(data.totals.portfolioPositivationPct)}
              icon={Users}
              hint="Clientes que compraram no mês"
            />
          </div>

          {data.alerts
            .filter((alert) => !dismissed.includes(alert.kind))
            .map((alert) => (
              <AlertRow key={alert.kind} alert={alert} onDismiss={() => dismiss(alert.kind)} />
            ))}

          {data.unassignedSellers > 0 && (
            <Card className="border-warning/30 bg-warning/5">
              <p className="text-sm text-[var(--text-secondary)]">
                {data.unassignedSellers} vendedor(es) sem gerente cadastrado — defina o gerente na
                ficha de cada um para eles aparecerem na equipe certa.
              </p>
            </Card>
          )}

          {data.sellers.length === 0 ? (
            <Card>
              <p className="text-sm text-[var(--text-secondary)]">
                Nenhum vendedor com código Protheus nesta equipe. Cadastre o código do vendedor para
                ele entrar no plano e aparecer aqui.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data.sellers.map((seller) => (
                <SellerCard
                  key={seller.userId}
                  seller={seller}
                  dismissed={dismissed}
                  onDismiss={dismiss}
                />
              ))}
            </div>
          )}

          <Card className="flex items-center gap-3 border-dashed">
            <Map size={18} strokeWidth={1.5} className="text-[var(--text-muted)]" aria-hidden />
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Mapa da equipe</p>
              <p className="text-xs text-[var(--text-muted)]">
                Chega na fase 2, junto com &quot;Onde estou perdendo&quot;.
              </p>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function AlertRow({ alert, onDismiss }: { alert: TeamAlert; onDismiss: () => void }) {
  return (
    <Card className="flex items-center justify-between gap-3 border-warning/30 bg-warning/5">
      <span className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <AlertTriangle size={16} strokeWidth={1.5} className="text-warning" aria-hidden />
        {alert.message}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-xs font-medium text-brand hover:underline"
      >
        Concordo
      </button>
    </Card>
  )
}

function SellerCard({
  seller,
  dismissed,
  onDismiss,
}: {
  seller: TeamSellerCard
  dismissed: string[]
  onDismiss: (id: string) => void
}) {
  const alerts = seller.alerts.filter((a) => !dismissed.includes(`${seller.userId}:${a.kind}`))

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{seller.name}</h2>
          <p className="text-xs text-[var(--text-muted)]">Código {seller.vendorCode}</p>
        </div>
        {seller.outOfPlan > 0 && <Badge variant="info">{seller.outOfPlan} fora do plano</Badge>}
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Previstas" value={String(seller.planned)} />
        <Stat label="Realizadas" value={String(seller.done)} />
        <Stat label="Aderência" value={pctLabel(seller.adherencePct)} />
      </dl>
      <dl className="grid grid-cols-2 gap-2 text-center">
        <Stat label="Positivação da visita" value={pctLabel(seller.visitPositivationPct)} />
        <Stat label="Positivação da carteira" value={pctLabel(seller.portfolioPositivationPct)} />
      </dl>

      {alerts.map((alert) => (
        <div
          key={alert.kind}
          className="flex items-center justify-between gap-2 rounded-lg bg-warning/5 px-3 py-2"
        >
          <span className="text-xs text-[var(--text-secondary)]">{alert.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(`${seller.userId}:${alert.kind}`)}
            className="shrink-0 text-xs font-medium text-brand hover:underline"
          >
            Concordo
          </button>
        </div>
      ))}
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--bg-page)] px-2 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold text-[var(--text-primary)]">{value}</dd>
    </div>
  )
}
