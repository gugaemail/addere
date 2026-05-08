'use client'

import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import axios from 'axios'
import type { PilotDashboardMetrics, PilotMetricDelta } from '@addere/types'

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

function statusColor(status: string): string {
  if (status === 'ACTIVE') return 'bg-green-100 text-green-700'
  if (status === 'COMPLETED') return 'bg-blue-100 text-blue-700'
  return 'bg-gray-100 text-gray-600'
}

function statusLabel(status: string): string {
  if (status === 'ACTIVE') return 'Ativo'
  if (status === 'COMPLETED') return 'Concluído'
  return 'Cancelado'
}

// ─── MetricCard ──────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string
  icon: string
  value: string
  goal: string
  goalMet: boolean | null   // null = sem dados
  near: boolean             // dentro de 10% da meta
  delta: number | null
  deltaInvert?: boolean     // para "tempo" onde menor é melhor
}

function MetricCard({ label, icon, value, goal, goalMet, near, delta, deltaInvert }: MetricCardProps) {
  const borderColor =
    goalMet === null ? 'border-gray-200' :
    goalMet ? 'border-green-400' :
    near ? 'border-yellow-400' : 'border-red-400'

  const badge =
    goalMet === null ? null :
    goalMet ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Meta atingida</span> :
    near ? <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Próximo da meta</span> :
    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Abaixo da meta</span>

  const deltaSign = delta !== null ? (deltaInvert ? delta < 0 : delta > 0) : null
  const deltaStr = delta !== null ? `${delta > 0 ? '+' : ''}${delta}% vs sem. ant.` : null

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-xl border-2 ${borderColor} p-5 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">{icon} {label}</span>
        {badge}
      </div>
      <div className="text-3xl font-bold text-gray-900 dark:text-white">{value}</div>
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>Meta: {goal}</span>
        {deltaStr && (
          <span className={deltaSign ? 'text-green-600' : 'text-red-500'}>{deltaStr}</span>
        )}
      </div>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function PilotoDashboard() {
  const searchParams = useSearchParams()
  const pilotId = searchParams.get('pilotId') ?? ''

  const { data, isLoading, isError } = useQuery<PilotDashboardMetrics>({
    queryKey: ['pilot-metrics', pilotId],
    queryFn: () =>
      axios.get(`/api/pilot/${pilotId}/metrics`).then((r) => r.data),
    enabled: !!pilotId,
    refetchInterval: 5 * 60 * 1000,
  })

  const threesDaysAgo = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 3)
    return d
  }, [])

  if (!pilotId) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <p>Passe <code>?pilotId=...</code> na URL para visualizar um piloto.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <p>Carregando métricas...</p>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400">
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Piloto — {pilot.clientName}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Início: {new Date(pilot.startDate).toLocaleDateString('pt-BR')}
            {' · '}
            {daysRemaining(pilot.endDate)} dias restantes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${statusColor(pilot.status)}`}>
            {statusLabel(pilot.status)}
          </span>
          <a
            href={`/api/pilot/${pilotId}/export?since=${new Date(pilot.startDate).toISOString().slice(0, 10)}`}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
          >
            Exportar CSV
          </a>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <MetricCard
          label="Tempo médio/pedido"
          icon="⏱"
          value={formatDuration(avgOrderDuration.current)}
          goal="< 5 min"
          goalMet={goalAvg}
          near={nearAvg}
          delta={avgOrderDuration.deltaPercent}
          deltaInvert
        />
        <MetricCard
          label="Taxa de sync"
          icon="📶"
          value={formatPercent(syncSuccessRate.current)}
          goal="> 98%"
          goalMet={goalSync}
          near={nearSync}
          delta={syncSuccessRate.deltaPercent}
        />
        <MetricCard
          label="Pedidos offline"
          icon="📱"
          value={formatPercent(offlineOrderRate.current)}
          goal="> 50%"
          goalMet={goalOffline}
          near={nearOffline}
          delta={offlineOrderRate.deltaPercent}
        />
        <MetricCard
          label="Tempo médio de sync"
          icon="⚡"
          value={formatDuration(avgQueueDuration.current)}
          goal="< 30s"
          goalMet={goalQueue}
          near={nearQueue}
          delta={avgQueueDuration.deltaPercent}
          deltaInvert
        />
        <MetricCard
          label="Total de pedidos"
          icon="📦"
          value={String(totalOrders.current ?? 0)}
          goal="—"
          goalMet={null}
          near={false}
          delta={totalOrders.deltaPercent}
        />
      </div>

      {/* Gráfico 14 dias */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
          Pedidos por dia — últimos 14 dias
        </h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={dailyOrders} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => v.slice(5)}
            />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              formatter={(value: number, name: string) =>
                [value, name === 'total' ? 'Total' : 'Offline']
              }
              labelFormatter={(label) => new Date(label).toLocaleDateString('pt-BR')}
            />
            <Legend formatter={(v) => (v === 'total' ? 'Total' : 'Offline')} />
            <Line type="monotone" dataKey="total" stroke="#1B4FA8" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="offline" stroke="#29BEFF" strokeWidth={2} dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela de reps */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Atividade por representante
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {['Nome', 'Hoje', 'Total', 'Último acesso', 'Taxa sync'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {repActivity.map((rep) => {
              const inactive = rep.lastActiveAt
                ? new Date(rep.lastActiveAt) < threesDaysAgo
                : true
              return (
                <tr
                  key={rep.repId}
                  className={inactive ? 'bg-red-50 dark:bg-red-900/10' : ''}
                >
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                    {rep.repName}
                    {inactive && (
                      <span className="ml-2 text-xs text-red-500">inativo</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{rep.ordersToday}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{rep.ordersTotal}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {rep.lastActiveAt
                      ? new Date(rep.lastActiveAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {rep.syncRate !== null ? (
                      <span className={rep.syncRate >= 98 ? 'text-green-600' : rep.syncRate >= 90 ? 'text-yellow-600' : 'text-red-500'}>
                        {rep.syncRate}%
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Feedbacks negativos */}
      {recentNegativeFeedbacks.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-red-200 dark:border-red-900 overflow-hidden">
          <div className="px-6 py-4 border-b border-red-100 dark:border-red-900 bg-red-50 dark:bg-red-900/20">
            <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">
              Feedbacks negativos recentes
            </h2>
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {recentNegativeFeedbacks.map((f) => (
              <li key={f.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{f.repName}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(f.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
                {f.comment && (
                  <p className="mt-1 text-sm text-gray-500 italic">&ldquo;{f.comment}&rdquo;</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
