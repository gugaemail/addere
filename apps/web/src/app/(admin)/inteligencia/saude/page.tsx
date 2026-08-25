'use client'

// W4 · Saúde dos dados (E10): % saudável, frescor por job, completude,
// histórico de execuções, lista "corrigir no Protheus" (CSV) e sync manual.
import { useState } from 'react'
import { toast } from 'sonner'
import { Download, RefreshCw } from 'lucide-react'
import { api, getApiErrorMessage } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useIntelCompanyParam, useIntelHealth, useRunJob } from '@/hooks/useIntel'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { StatCard } from '@/components/ui/StatCard'
import { FreshnessBadge } from '@/components/ui/FreshnessBadge'
import { Table, type Column } from '@/components/ui/Table'
import { useCompanyContext } from '@/contexts/CompanyContext'
import { needsActiveCompany } from '@/lib/intel-helpers'
import { SelectCompanyNotice } from '@/components/intel/SelectCompanyNotice'

const JOB_LABELS: Record<string, string> = {
  NIGHTLY: 'Noturno completo',
  REFRESH: 'Refresh (4/4h)',
  SYNC: 'Sync de contratos',
  GOALS: 'Metas',
  GEO: 'Geocodificação',
  ENGINE: 'Motor de sinais',
  PLAN: 'Resumo do plano',
  PURGE: 'Expurgo LGPD',
  EVAL: 'Eval do agente',
}

const FIX_LABELS: Record<string, string> = {
  cliente_sem_cidade: 'Cliente sem cidade',
  venda_sem_vendedor: 'Venda sem vendedor',
  venda_cliente_desconhecido: 'Venda de cliente fora do cadastro',
}

const PRECISION_LABELS: Record<string, string> = {
  ROOFTOP: 'endereço exato',
  STREET: 'rua',
  CEP: 'CEP',
  CITY: 'só cidade (sem pino)',
}

interface RunRow {
  id: string
  job: string
  status: string
  startedAt: string
  finishedAt: string | null
  error: string | null
}

export default function SaudePage() {
  const { hasPermission, isSuperAdmin } = useAuth()
  const { companyId } = useCompanyContext()
  const isIntelAdmin = hasPermission('intel.admin')
  const { data, isLoading, refetch } = useIntelHealth()
  const runJob = useRunJob()
  const companyParam = useIntelCompanyParam()
  const [downloading, setDownloading] = useState(false)

  // Sem empresa ativa o tenant não resolve e a tela cairia num vazio genérico
  if (needsActiveCompany(isSuperAdmin, companyId)) return <SelectCompanyNotice />

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }
  if (!data) return <p className="text-sm text-[var(--text-secondary)]">Sem dados de saúde.</p>

  async function handleRunSync() {
    try {
      await runJob.mutateAsync('nightly')
      toast.success('Sync iniciado — acompanhe no histórico abaixo')
      setTimeout(() => refetch(), 2000)
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Não foi possível iniciar (já em andamento?)'))
    }
  }

  async function handleDownloadCsv() {
    setDownloading(true)
    try {
      const response = await api.get('/intel/admin/health/export.csv', {
        params: companyParam,
        responseType: 'blob',
      })
      const url = URL.createObjectURL(response.data as Blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'corrigir-no-protheus.csv'
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao exportar CSV'))
    } finally {
      setDownloading(false)
    }
  }

  const runColumns: Column<RunRow>[] = [
    { key: 'job', header: 'Job', render: (r) => JOB_LABELS[r.job] ?? r.job },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <span
          className={
            r.status === 'OK' ? 'text-success' : r.status === 'ERROR' ? 'text-danger' : 'text-warning'
          }
        >
          {r.status === 'OK' ? 'ok' : r.status === 'ERROR' ? 'erro' : 'rodando'}
        </span>
      ),
    },
    {
      key: 'startedAt',
      header: 'Início',
      render: (r) => new Date(r.startedAt).toLocaleString('pt-BR'),
    },
    {
      key: 'error',
      header: 'Detalhe',
      render: (r) => <span className="text-xs text-[var(--text-secondary)]">{r.error ?? '—'}</span>,
    },
  ]

  const fixColumns: Column<{ type: string; code: string; detail: string }>[] = [
    { key: 'type', header: 'Tipo', render: (f) => FIX_LABELS[f.type] ?? f.type },
    { key: 'code', header: 'Código', render: (f) => <code className="text-xs">{f.code}</code> },
    { key: 'detail', header: 'Detalhe', render: (f) => f.detail },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold text-[var(--text-primary)]">Saúde dos dados</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            O plano do dia só é bom se os dados estiverem frescos e completos.
          </p>
        </div>
        {isIntelAdmin && (
          <Button variant="secondary" onClick={handleRunSync} disabled={runJob.isPending}>
            <RefreshCw size={14} strokeWidth={1.5} aria-hidden />
            {runJob.isPending ? 'Iniciando…' : 'Rodar sync agora'}
          </Button>
        )}
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Dados saudáveis" value={`${data.healthyPct}%`} accent={data.healthyPct >= 90 ? 'success' : 'brand'} />
        <StatCard
          label="Próximo sync"
          value={data.nextSyncAt ? new Date(data.nextSyncAt).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—'}
          text
        />
        <StatCard label="Clientes sem cidade" value={`${data.customersWithoutCity.count} (${data.customersWithoutCity.pct}%)`} text />
        <StatCard label="Vendas sem vendedor" value={`${data.salesWithoutVendor.count} (${data.salesWithoutVendor.pct}%)`} text />
      </div>

      {/* Frescor por job */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Frescor por job</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.freshness.map((f) => (
            <div
              key={f.job}
              className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2.5"
            >
              <span className="text-sm text-[var(--text-primary)]">{JOB_LABELS[f.job] ?? f.job}</span>
              <FreshnessBadge updatedAt={f.lastRunAt} />
            </div>
          ))}
        </div>
      </section>

      {/* Geocodificação (chega com a E15-F1) + uso de LLM */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {data.geocoding && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Geocodificação</h3>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {Object.entries(data.geocoding.byPrecision)
                .map(([precision, count]) => `${count} ${PRECISION_LABELS[precision] ?? precision}`)
                .join(' · ') || 'nenhum cliente geocodificado ainda'}
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {data.geocoding.withoutPin} cliente(s) sem posição não aparecem no mapa · {data.geocoding.failed} falha(s)
            </p>
          </div>
        )}
        {data.llmUsageMonth && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Uso de LLM no mês</h3>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {data.llmUsageMonth.calls} chamada(s) · {data.llmUsageMonth.inputTokens.toLocaleString('pt-BR')} tokens de
              entrada · {data.llmUsageMonth.outputTokens.toLocaleString('pt-BR')} de saída
            </p>
          </div>
        )}
      </div>

      {/* Corrigir no Protheus */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Corrigir no Protheus ({data.fixes.length})
          </h2>
          {isIntelAdmin && data.fixes.length > 0 && (
            <Button variant="secondary" onClick={handleDownloadCsv} disabled={downloading}>
              <Download size={14} strokeWidth={1.5} aria-hidden />
              {downloading ? 'Exportando…' : 'Baixar CSV'}
            </Button>
          )}
        </div>
        {data.fixes.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Nada a corrigir — cadastro em dia.</p>
        ) : (
          <Table columns={fixColumns} data={data.fixes.map((f, i) => ({ ...f, id: `${f.type}-${f.code}-${i}` }))} />
        )}
      </section>

      {/* Histórico 7 dias */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Execuções (últimos 7 dias)</h2>
        {data.recentRuns.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Nenhuma execução ainda.</p>
        ) : (
          <Table columns={runColumns} data={data.recentRuns as RunRow[]} />
        )}
      </section>
    </div>
  )
}
