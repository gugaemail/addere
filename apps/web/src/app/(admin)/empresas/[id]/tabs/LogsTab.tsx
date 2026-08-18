'use client'

import { useState } from 'react'
import { FileClock, RefreshCw } from 'lucide-react'
import type { ProtheusLog } from '@addere/types'
import { Table, type Column } from '@/components/ui/Table'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useCompanyProtheusLogs } from '@/hooks/useCompany'
import { TabSection, Pagination, TableEmptyState } from './shared'

const OPERATIONS = [
  'syncProducts',
  'syncCustomers',
  'syncTransportadoras',
  'syncCondPags',
  'syncOrder',
  'consultOrder',
  'fetchMeta',
  'testToken',
  'testProducts',
  'testCustomers',
  'testOrder',
  'autoSyncProducts',
  'autoSyncCustomers',
]

const selectClass =
  'text-sm border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand'

export function LogsTab({ companyId }: { companyId: string }) {
  const [page, setPage] = useState(1)
  const [operation, setOperation] = useState('')
  const [success, setSuccess] = useState<'' | 'true' | 'false'>('')

  // O React Query refaz a busca quando página/filtros mudam — sem useEffect duplicado
  const { data, isFetching, refetch } = useCompanyProtheusLogs(companyId, {
    page,
    operation,
    success,
  })

  const logs = data?.data ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1

  const columns: Column<ProtheusLog>[] = [
    {
      key: 'createdAt',
      header: 'Data/hora',
      render: (l) => (
        <span className="text-[var(--text-muted)] whitespace-nowrap text-xs">
          {new Date(l.createdAt).toLocaleString('pt-BR')}
        </span>
      ),
    },
    {
      key: 'operation',
      header: 'Operação',
      render: (l) => (
        <code className="text-xs font-mono text-[var(--text-primary)]">{l.operation}</code>
      ),
    },
    {
      key: 'endpointKey',
      header: 'Endpoint',
      render: (l) => (
        <code className="text-xs font-mono text-[var(--text-muted)]">{l.endpointKey}</code>
      ),
    },
    {
      key: 'success',
      header: 'Status',
      render: (l) => (
        <Badge variant={l.success ? 'success' : 'danger'}>{l.success ? 'Sucesso' : 'Falha'}</Badge>
      ),
    },
    {
      key: 'httpStatus',
      header: 'HTTP',
      render: (l) => (
        <span className="text-[var(--text-muted)] text-xs">{l.httpStatus ?? '—'}</span>
      ),
    },
    {
      key: 'durationMs',
      header: 'Duração',
      render: (l) => (
        <span className="text-[var(--text-muted)] text-xs whitespace-nowrap">
          {l.durationMs != null ? `${l.durationMs} ms` : '—'}
        </span>
      ),
    },
    {
      key: 'records',
      header: 'Registros',
      render: (l) => (
        <span className="text-[var(--text-muted)] text-xs whitespace-nowrap">
          {l.recordsSynced != null ? `${l.recordsSynced} / ${l.totalRecords ?? '?'}` : '—'}
        </span>
      ),
    },
    {
      key: 'error',
      header: 'Erro',
      className: 'max-w-[200px]',
      render: (l) =>
        l.errorMessage ? (
          <span title={l.errorMessage} className="cursor-help text-xs text-danger">
            {l.errorMessage.length > 60 ? l.errorMessage.slice(0, 60) + '…' : l.errorMessage}
          </span>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">—</span>
        ),
    },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Log de chamadas às APIs Protheus
        </h2>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Histórico de todas as comunicações com o ERP Protheus — sincronizações, testes e
          consultas.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={operation}
          onChange={(e) => {
            setOperation(e.target.value)
            setPage(1)
          }}
          className={selectClass}
        >
          <option value="">Todas as operações</option>
          {OPERATIONS.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
        <select
          value={success}
          onChange={(e) => {
            setSuccess(e.target.value as '' | 'true' | 'false')
            setPage(1)
          }}
          className={selectClass}
        >
          <option value="">Todos os resultados</option>
          <option value="true">Sucesso</option>
          <option value="false">Falha</option>
        </select>
        <Button variant="outline" size="sm" leftIcon={RefreshCw} onClick={() => refetch()}>
          Atualizar
        </Button>
        {total > 0 && <span className="text-xs text-[var(--text-muted)]">{total} registro(s)</span>}
      </div>

      {/* Tabela */}
      <TabSection footer={<Pagination page={page} total={total} pages={pages} onPage={setPage} />}>
        <div className="overflow-auto max-h-[600px]">
          {isFetching && logs.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">Carregando…</p>
          ) : logs.length === 0 ? (
            <TableEmptyState
              icon={<FileClock className="w-9 h-9" strokeWidth={1.25} />}
              title="Nenhum log encontrado"
              description="As chamadas às APIs Protheus serão registradas aqui."
            />
          ) : (
            <Table columns={columns} data={logs} rowKey={(l) => l.id} className="rounded-none" />
          )}
        </div>
      </TabSection>
    </div>
  )
}
