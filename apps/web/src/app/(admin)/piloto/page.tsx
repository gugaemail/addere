'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useRouter } from 'next/navigation'
import { useMemo, useState, Suspense } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import axios from 'axios'
import {
  ArrowLeft, BarChart2, CheckCircle, Clock, Download, Package, Plus, Smartphone, Timer,
  Wifi, XCircle, Zap, type LucideIcon,
} from 'lucide-react'
import { api, getAccessToken } from '@/lib/api'
import { BRAND } from '@/lib/brand-tokens'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Table, type Column } from '@/components/ui/Table'
import { CreatePilotModal } from './CreatePilotModal'
import type { PilotDashboardMetrics } from '@addere/types'

// ─── Tipos locais ────────────────────────────────────────────────────────────

interface PilotListItem {
  id: string
  clientName: string
  startDate: string
  endDate: string
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  company: { id: string; name: string; cnpj: string }
  _count: { events: number; feedbacks: number }
}

type PilotStatus = PilotListItem['status']

// Badge de status do piloto (ui/Badge com variantes de marca)
function PilotStatusBadge({ status }: { status: PilotStatus | string }) {
  const variant = status === 'ACTIVE' ? 'success' : status === 'COMPLETED' ? 'info' : 'neutral'
  return <Badge variant={variant}>{statusLabel(status)}</Badge>
}

// ─── Lista de pilotos ────────────────────────────────────────────────────────

function PilotList() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const { data: pilots, isLoading } = useQuery<PilotListItem[]>({
    queryKey: ['admin-pilots'],
    queryFn: () => api.get('/admin/pilots').then((r) => r.data),
  })

  async function handleStatusChange(id: string, status: 'COMPLETED' | 'CANCELLED') {
    setUpdatingId(id)
    try {
      await api.patch(`/admin/pilots/${id}/status`, { status })
      queryClient.invalidateQueries({ queryKey: ['admin-pilots'] })
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Pilotos comerciais</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">Gerencie os pilotos de 30 dias com clientes</p>
        </div>
        <Button onClick={() => setShowCreate(true)} leftIcon={Plus}>
          Novo piloto
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-[var(--text-muted)]">Carregando pilotos...</div>
      ) : pilots?.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-[var(--border)] rounded-xl">
          <BarChart2 size={40} strokeWidth={1.25} className="mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="text-[var(--text-secondary)]">Nenhum piloto cadastrado</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">Crie o primeiro piloto para começar o rastreamento</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {pilots?.map((pilot) => (
            <Card key={pilot.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-[var(--text-primary)]">{pilot.clientName}</h3>
                    <PilotStatusBadge status={pilot.status} />
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">{pilot.company.name} · {pilot.company.cnpj}</p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-[var(--text-muted)]">
                    <span className="flex items-center gap-1">
                      <Clock size={12} strokeWidth={1.5} />
                      {new Date(pilot.startDate).toLocaleDateString('pt-BR')} →{' '}
                      {new Date(pilot.endDate).toLocaleDateString('pt-BR')}
                      {pilot.status === 'ACTIVE' && ` (${daysRemaining(pilot.endDate)} dias restantes)`}
                    </span>
                    <span>{pilot._count.events.toLocaleString()} eventos</span>
                    <span>{pilot._count.feedbacks} feedbacks</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {pilot.status === 'ACTIVE' && (
                    <>
                      <Button
                        variant="ghost"
                        size="xs"
                        leftIcon={BarChart2}
                        onClick={() => router.push(`/piloto?pilotId=${pilot.id}`)}
                      >
                        Dashboard
                      </Button>
                      <Button
                        variant="success-outline"
                        size="xs"
                        leftIcon={CheckCircle}
                        onClick={() => handleStatusChange(pilot.id, 'COMPLETED')}
                        disabled={updatingId === pilot.id}
                      >
                        Concluir
                      </Button>
                      <Button
                        variant="danger-outline"
                        size="xs"
                        leftIcon={XCircle}
                        onClick={() => handleStatusChange(pilot.id, 'CANCELLED')}
                        disabled={updatingId === pilot.id}
                      >
                        Cancelar
                      </Button>
                    </>
                  )}
                  {pilot.status !== 'ACTIVE' && (
                    <Button
                      variant="outline"
                      size="xs"
                      leftIcon={BarChart2}
                      onClick={() => router.push(`/piloto?pilotId=${pilot.id}`)}
                    >
                      Ver dados
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCreate && (
        <CreatePilotModal
          onClose={() => setShowCreate(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ['admin-pilots'] })}
        />
      )}
    </div>
  )
}

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  const secs = Math.round(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const rem = secs % 60
  return rem > 0 ? `${mins}min ${rem}s` : `${mins}min`
}

function formatPercent(v: number | null): string {
  return v === null ? '—' : `${v}%`
}

function daysRemaining(endDate: string): number {
  const diff = new Date(endDate).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

function statusLabel(status: string): string {
  if (status === 'ACTIVE') return 'Ativo'
  if (status === 'COMPLETED') return 'Concluído'
  return 'Cancelado'
}

// ─── MetricCard ──────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string
  icon: LucideIcon
  value: string
  goal: string
  goalMet: boolean | null   // null = sem dados
  near: boolean             // dentro de 10% da meta
  delta: number | null
  deltaInvert?: boolean     // para "tempo" onde menor é melhor
}

function MetricCard({ label, icon: Icon, value, goal, goalMet, near, delta, deltaInvert }: MetricCardProps) {
  // Semáforo da meta em tokens de marca (success/warning/danger)
  const borderColor =
    goalMet === null ? 'border-[var(--border)]' :
    goalMet ? 'border-success' :
    near ? 'border-warning' : 'border-danger'

  const badge =
    goalMet === null ? null :
    goalMet ? <Badge variant="success">Meta atingida</Badge> :
    near ? <Badge variant="warning">Próximo da meta</Badge> :
    <Badge variant="danger">Abaixo da meta</Badge>

  const deltaSign = delta !== null ? (deltaInvert ? delta < 0 : delta > 0) : null
  const deltaStr = delta !== null ? `${delta > 0 ? '+' : ''}${delta}% vs sem. ant.` : null

  return (
    <Card className={cn('border-2 p-5 flex flex-col gap-3', borderColor)}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)]">
          <Icon size={16} strokeWidth={1.5} className="text-[var(--text-muted)]" aria-hidden />
          {label}
        </span>
        {badge}
      </div>
      <div className="text-3xl font-bold text-[var(--text-primary)]">{value}</div>
      <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span>Meta: {goal}</span>
        {deltaStr && (
          <span className={deltaSign ? 'text-success' : 'text-danger'}>{deltaStr}</span>
        )}
      </div>
    </Card>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

function PilotoDashboard() {
  const searchParams = useSearchParams()
  const pilotId = searchParams.get('pilotId') ?? ''

  // Lista e detalhe são componentes separados — um early-return antes dos
  // hooks do detalhe violaria as Rules of Hooks ao alternar entre as duas visões
  if (!pilotId) return <PilotList />
  return <PilotDetail pilotId={pilotId} />
}

type RepActivity = PilotDashboardMetrics['repActivity'][number]

function PilotDetail({ pilotId }: { pilotId: string }) {
  const router = useRouter()

  const { data, isLoading, isError } = useQuery<PilotDashboardMetrics>({
    queryKey: ['pilot-metrics', pilotId],
    queryFn: () =>
      axios
        .get(`/api/pilot/${pilotId}/metrics`, {
          headers: { Authorization: `Bearer ${getAccessToken()}` },
        })
        .then((r) => r.data),
    refetchInterval: 5 * 60 * 1000,
  })

  const threeDaysAgo = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 3)
    return d
  }, [])


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--text-muted)]">
        <p>Carregando métricas...</p>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-danger">
        <p>Não foi possível carregar as métricas. Verifique o pilotId.</p>
      </div>
    )
  }

  const { pilot, avgOrderDuration, syncSuccessRate, offlineOrderRate, avgQueueDuration, totalOrders,
          dailyOrders, repActivity, recentNegativeFeedbacks } = data

  // metas
  const goalAvg = avgOrderDuration.current !== null ? avgOrderDuration.current <= 5 * 60_000 : null
  const nearAvg = avgOrderDuration.current !== null && avgOrderDuration.current <= 5.5 * 60_000
  const goalSync = syncSuccessRate.current !== null ? syncSuccessRate.current >= 98 : null
  const nearSync = syncSuccessRate.current !== null && syncSuccessRate.current >= 88
  const goalOffline = offlineOrderRate.current !== null ? offlineOrderRate.current >= 50 : null
  const nearOffline = offlineOrderRate.current !== null && offlineOrderRate.current >= 45
  const goalQueue = avgQueueDuration.current !== null ? avgQueueDuration.current <= 30_000 : null
  const nearQueue = avgQueueDuration.current !== null && avgQueueDuration.current <= 33_000

  const isInactive = (rep: RepActivity) =>
    rep.lastActiveAt ? new Date(rep.lastActiveAt) < threeDaysAgo : true

  const repColumns: Column<RepActivity>[] = [
    {
      key: 'name',
      header: 'Nome',
      render: (rep) => (
        <span className="font-medium text-[var(--text-primary)]">
          {rep.repName}
          {isInactive(rep) && <span className="ml-2 text-xs text-danger">inativo</span>}
        </span>
      ),
    },
    { key: 'today', header: 'Hoje', render: (rep) => rep.ordersToday },
    { key: 'total', header: 'Total', render: (rep) => rep.ordersTotal },
    {
      key: 'lastActive',
      header: 'Último acesso',
      render: (rep) => rep.lastActiveAt
        ? new Date(rep.lastActiveAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
        : '—',
    },
    {
      key: 'syncRate',
      header: 'Taxa sync',
      render: (rep) => rep.syncRate !== null ? (
        <span className={rep.syncRate >= 98 ? 'text-success' : rep.syncRate >= 90 ? 'text-warning' : 'text-danger'}>
          {rep.syncRate}%
        </span>
      ) : '—',
    },
  ]

  async function handleExport() {
    const since = new Date(pilot.startDate).toISOString().slice(0, 10)
    const res = await axios.get(`/api/pilot/${pilotId}/export?since=${since}`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      responseType: 'blob',
    })
    const url = URL.createObjectURL(res.data as Blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `piloto-${pilotId}-${since}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={ArrowLeft}
            onClick={() => router.push('/piloto')}
            className="mb-3 -ml-3 text-[var(--text-muted)] hover:text-brand font-medium"
          >
            Todos os pilotos
          </Button>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Piloto — {pilot.clientName}
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Início: {new Date(pilot.startDate).toLocaleDateString('pt-BR')}
            {' · '}
            {daysRemaining(pilot.endDate)} dias restantes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PilotStatusBadge status={pilot.status} />
          <Button variant="outline" size="sm" leftIcon={Download} onClick={handleExport}>
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <MetricCard
          label="Tempo médio/pedido"
          icon={Timer}
          value={formatDuration(avgOrderDuration.current)}
          goal="< 5 min"
          goalMet={goalAvg}
          near={nearAvg}
          delta={avgOrderDuration.deltaPercent}
          deltaInvert
        />
        <MetricCard
          label="Taxa de sync"
          icon={Wifi}
          value={formatPercent(syncSuccessRate.current)}
          goal="> 98%"
          goalMet={goalSync}
          near={nearSync}
          delta={syncSuccessRate.deltaPercent}
        />
        <MetricCard
          label="Pedidos offline"
          icon={Smartphone}
          value={formatPercent(offlineOrderRate.current)}
          goal="> 50%"
          goalMet={goalOffline}
          near={nearOffline}
          delta={offlineOrderRate.deltaPercent}
        />
        <MetricCard
          label="Tempo médio de sync"
          icon={Zap}
          value={formatDuration(avgQueueDuration.current)}
          goal="< 30s"
          goalMet={goalQueue}
          near={nearQueue}
          delta={avgQueueDuration.deltaPercent}
          deltaInvert
        />
        <MetricCard
          label="Total de pedidos"
          icon={Package}
          value={String(totalOrders.current ?? 0)}
          goal="—"
          goalMet={null}
          near={false}
          delta={totalOrders.deltaPercent}
        />
      </div>

      {/* Gráfico 14 dias */}
      <Card className="p-6">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">
          Pedidos por dia — últimos 14 dias
        </h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={dailyOrders} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: BRAND.muted }}
              tickFormatter={(v) => v.slice(5)}
            />
            <YAxis tick={{ fontSize: 11, fill: BRAND.muted }} allowDecimals={false} />
            <Tooltip
              formatter={(value: number, name: string) =>
                [value, name === 'total' ? 'Total' : 'Offline']
              }
              labelFormatter={(label) => new Date(label).toLocaleDateString('pt-BR')}
            />
            <Legend formatter={(v) => (v === 'total' ? 'Total' : 'Offline')} />
            <Line type="monotone" dataKey="total" stroke={BRAND.primary} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="offline" stroke={BRAND.accent} strokeWidth={2} dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Tabela de reps */}
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)]">
            Atividade por representante
          </h2>
        </div>
        <Table
          columns={repColumns}
          data={repActivity}
          rowKey={(rep) => rep.repId}
          className="rounded-none"
          rowClassName={(rep) => (isInactive(rep) ? 'bg-danger/5' : undefined)}
          emptyMessage="Nenhum representante com atividade."
        />
      </Card>

      {/* Feedbacks negativos */}
      {recentNegativeFeedbacks.length > 0 && (
        <Card className="p-0 overflow-hidden border-danger/30">
          <div className="px-6 py-4 border-b border-danger/20 bg-danger/10">
            <h2 className="text-sm font-semibold text-danger">
              Feedbacks negativos recentes
            </h2>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {recentNegativeFeedbacks.map((f) => (
              <li key={f.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--text-primary)]">{f.repName}</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {new Date(f.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
                {f.comment && (
                  <p className="mt-1 text-sm text-[var(--text-secondary)] italic">&ldquo;{f.comment}&rdquo;</p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

export default function PilotoPage() {
  return (
    <Suspense fallback={null}>
      <PilotoDashboard />
    </Suspense>
  )
}
