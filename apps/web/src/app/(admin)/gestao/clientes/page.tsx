'use client'

export const dynamic = 'force-dynamic'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Building2, Plus } from 'lucide-react'
import {
  CLIENT_STATUS_LABELS,
  type ClientListItemDto,
  type LlmUsageListItemDto,
} from '@addere/types'
import { StatCard } from '@/components/ui/StatCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Table, type Column } from '@/components/ui/Table'
import { getApiErrorMessage } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { CLIENT_STATUS_BADGE, LICENSE_TYPE_LABELS } from '@/lib/billing-ui'
import { useClients, useLlmUsage } from '@/hooks/useBilling'
import { budgetStatus, formatCost, formatPct, rateLabel } from '@/lib/llm-usage-ui'
import { ClientFormModal } from './ClientFormModal'
import { LlmUsageModal } from './LlmUsageModal'

// Clientes da Gestão Addere (plano 013). Substitui a
// antiga lista de empresas. A linha inteira abre a ficha; o
// "Desativar empresa" mora no cabeçalho da ficha. "Próximo vencimento" entra
// com o plano 016.

function packageCell(c: ClientListItemDto) {
  if (c.current) {
    return (
      <span className="text-[var(--text-primary)]">
        {c.current.packageName} · {LICENSE_TYPE_LABELS[c.current.licenseType]}
      </span>
    )
  }
  if (c.proposed) {
    return (
      <span>
        {c.proposed.packageName} · {LICENSE_TYPE_LABELS[c.proposed.licenseType]}{' '}
        <span className="text-xs text-[var(--text-muted)]">(proposto)</span>
      </span>
    )
  }
  return <span className="text-[var(--text-muted)]">—</span>
}

// Custo de IA do mês: o valor abre o resumo do cliente (sem abrir a ficha)
function llmCell(
  usage: LlmUsageListItemDto | undefined,
  state: 'loading' | 'error' | 'ready',
  onOpen: () => void
): React.ReactNode {
  if (state === 'loading') return <span className="text-[var(--text-muted)]">…</span>
  // Sem a consulta, zero enganaria: parece que o cliente não gastou nada
  if (state === 'error') return <span className="text-[var(--text-muted)]">—</span>
  const status = budgetStatus(usage?.budgetPct ?? null)
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      className="text-left rounded-md -mx-1 px-1 hover:bg-brand/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      <span className="block font-medium text-brand tabular-nums">
        {usage ? formatCost(usage) : formatCost({ costBrl: 0, costUsd: 0 })}
      </span>
      {usage?.budgetPct != null && (
        <span
          className={
            status === 'over'
              ? 'flex items-center gap-1 text-xs text-danger'
              : status === 'warning'
                ? 'flex items-center gap-1 text-xs text-warning'
                : 'block text-xs text-[var(--text-muted)]'
          }
        >
          {status !== 'ok' && <AlertTriangle size={12} strokeWidth={1.5} aria-hidden />}
          {formatPct(usage.budgetPct)} do orçamento
        </span>
      )}
    </button>
  )
}

const baseColumns: Column<ClientListItemDto>[] = [
  {
    key: 'client',
    header: 'Cliente',
    render: (c) => (
      <div className="min-w-0">
        <p className="font-medium text-[var(--text-primary)]">{c.name}</p>
        <p className="text-xs text-[var(--text-muted)]">{c.cnpj}</p>
      </div>
    ),
  },
  {
    key: 'status',
    header: 'Situação',
    render: (c) => (
      <div className="flex flex-col items-start gap-1">
        <Badge variant={CLIENT_STATUS_BADGE[c.status]}>{CLIENT_STATUS_LABELS[c.status]}</Badge>
        {c.contractStatus === 'DRAFT' && (
          <span className="text-xs text-[var(--text-muted)]">rascunho</span>
        )}
      </div>
    ),
  },
  { key: 'package', header: 'Pacote', render: packageCell },
  {
    key: 'seats',
    header: 'Licenças',
    className: 'text-center whitespace-nowrap',
    render: (c) => `${c.usedSeats} / ${c.current ? c.current.seatLimit : '—'}`,
  },
  {
    key: 'monthly',
    header: 'Valor mensal',
    className: 'whitespace-nowrap',
    render: (c) =>
      c.current ? (
        formatCurrency(c.current.monthlyTotal)
      ) : (
        <span className="text-[var(--text-muted)]">—</span>
      ),
  },
  {
    key: 'active',
    header: 'Empresa',
    className: 'text-center',
    render: (c) => <StatusBadge active={c.active} activeLabel="Ativa" inactiveLabel="Inativa" />,
  },
]

export default function ClientesPage() {
  const router = useRouter()
  const { data: clients = [], isLoading, error, refetch } = useClients()
  const { data: llm, isLoading: llmLoading, isError: llmError } = useLlmUsage()
  const [showCreate, setShowCreate] = useState(false)
  const [llmClient, setLlmClient] = useState<ClientListItemDto | null>(null)

  const columns = useMemo<Column<ClientListItemDto>[]>(() => {
    const byCompany = new Map(llm?.companies.map((c) => [c.companyId, c]))
    const llmColumn: Column<ClientListItemDto> = {
      key: 'llm',
      header: 'IA no mês',
      className: 'whitespace-nowrap',
      render: (c) =>
        llmCell(byCompany.get(c.id), llmLoading ? 'loading' : llmError ? 'error' : 'ready', () =>
          setLlmClient(c)
        ),
    }
    // Logo depois do valor mensal: o custo de IA lido ao lado da receita
    const at = baseColumns.findIndex((col) => col.key === 'monthly') + 1
    return [...baseColumns.slice(0, at), llmColumn, ...baseColumns.slice(at)]
  }, [llm, llmLoading, llmError])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Clientes</h1>
        <Button onClick={() => setShowCreate(true)} leftIcon={Plus}>
          Novo cliente
        </Button>
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <p className="font-semibold text-danger">Erro ao carregar os clientes</p>
          <p className="text-sm text-[var(--text-muted)]">
            {getApiErrorMessage(error, 'Erro ao carregar os clientes')}
          </p>
          <Button onClick={() => refetch()} className="mt-2">
            Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          {/* Cards resumo */}
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <StatCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total" value={clients.length} accent="brand" />
              <StatCard
                label="Ativas"
                value={clients.filter((c) => c.active).length}
                accent="success"
              />
              <StatCard
                label="Inativas"
                value={clients.filter((c) => !c.active).length}
                accent="neutral"
              />
              <StatCard
                label="IA no mês (todas)"
                value={llm ? formatCost(llm.total) : llmError ? '—' : '…'}
                accent="brand"
                text
              />
            </div>
          )}

          {/* Tabela */}
          <div className="bg-[var(--bg-surface)] rounded-xl shadow-card border border-[var(--border)] overflow-hidden">
            {isLoading ? (
              <TableSkeleton cols={7} rows={4} />
            ) : clients.length === 0 ? (
              <EmptyState onCreate={() => setShowCreate(true)} />
            ) : (
              <Table
                columns={columns}
                data={clients}
                rowKey={(c) => c.id}
                className="rounded-none"
                onRowClick={(c) => router.push(`/gestao/clientes/${c.id}`)}
              />
            )}
          </div>
          {!isLoading && clients.length > 0 && (
            <p className="text-xs text-[var(--text-muted)]">
              Licenças: vendedores e gerentes ativos / limite do contrato (“—” = sem limite). IA no
              mês: custo do agente desde o dia 1
              {llm ? ` (${rateLabel(llm.rate)}${llm.rate.stale ? ', desatualizada' : ''})` : ''} —
              clique no valor para ver o resumo.
            </p>
          )}
        </>
      )}

      {showCreate && <ClientFormModal mode="create" onClose={() => setShowCreate(false)} />}
      {llmClient && <LlmUsageModal client={llmClient} onClose={() => setLlmClient(null)} />}
    </div>
  )
}

// ─── Componentes ──────────────────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] px-5 py-4 space-y-2">
      <div className="h-3 w-24 bg-[var(--bg-subtle)] rounded animate-skeleton-pulse" />
      <div className="h-8 w-12 bg-[var(--bg-subtle)] rounded animate-skeleton-pulse" />
    </div>
  )
}

function TableSkeleton({ cols, rows }: { cols: number; rows: number }) {
  return (
    <div className="w-full">
      <div className="bg-[var(--bg-subtle)] border-b border-[var(--border)] px-4 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div
            key={i}
            className="h-3 bg-[var(--border)] rounded animate-skeleton-pulse"
            style={{ width: `${60 + ((i * 17) % 60)}px` }}
          />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="px-4 py-3.5 flex gap-4 border-b border-[var(--border)] last:border-0"
        >
          {Array.from({ length: cols }).map((_, i) => (
            <div
              key={i}
              className="h-3 bg-[var(--bg-subtle)] rounded animate-skeleton-pulse"
              style={{ width: `${50 + (((r + i) * 23) % 80)}px` }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
      <div className="text-[var(--text-muted)]">
        <Building2 className="w-10 h-10" strokeWidth={1.25} />
      </div>
      <div>
        <p className="font-semibold text-[var(--text-primary)]">Nenhum cliente cadastrado</p>
        <p className="text-sm text-[var(--text-muted)] mt-1 max-w-xs mx-auto">
          Cadastre o primeiro cliente para montar o contrato.
        </p>
      </div>
      <Button variant="ghost" size="sm" leftIcon={Plus} onClick={onCreate} className="mt-2">
        Novo cliente
      </Button>
    </div>
  )
}
