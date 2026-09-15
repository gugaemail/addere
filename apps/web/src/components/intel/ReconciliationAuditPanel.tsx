'use client'

// "Como o Addere chegou a esse valor" (W3): quem cadastra a consulta precisa
// refazer a conta fora do Addere. Mostra o SQL exatamente como foi executado,
// linhas e páginas recebidas, filiais, o total agrupado por data (dia em vendas,
// mês de vencimento em títulos) e por filial, e baixa as mesmas linhas em CSV
// para comparar no Excel com o relatório do Protheus.
import { useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Download } from 'lucide-react'
import type { ReconciliationAudit } from '@addere/types'
import { api, getApiErrorMessage } from '@/lib/api'
import {
  auditFlags,
  auditSummaryLine,
  dateGroupTitle,
  formatMetric,
  sumAmounts,
  ymdLabel,
} from '@/lib/reconciliation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Table, type Column } from '@/components/ui/Table'

interface Props {
  audit: ReconciliationAudit
  contractName: string
  /** YYYYMM só quando o contrato reconcilia mês fechado; senão a posição de hoje */
  period?: string
  companyParam: { companyId?: string }
}

type DayRow = ReconciliationAudit['byDay'][number]
type BranchRow = ReconciliationAudit['byBranch'][number]

export function ReconciliationAuditPanel({ audit, contractName, period, companyParam }: Props) {
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const flags = auditFlags(audit)
  const isCount = audit.unit === 'count'
  const groupTitle = dateGroupTitle(audit)
  const groupTotal = isCount
    ? audit.byDay.reduce((sum, d) => sum + d.rows, 0)
    : sumAmounts(audit.byDay)

  async function copySql() {
    try {
      await navigator.clipboard.writeText(audit.executedSql)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Não foi possível copiar — selecione o texto manualmente')
    }
  }

  async function downloadCsv() {
    setDownloading(true)
    try {
      const response = await api.post(
        `/intel/admin/queries/${contractName}/reconcile/export`,
        { ...(period ? { period } : {}), ...companyParam },
        { responseType: 'blob' }
      )
      const disposition = String(response.headers['content-disposition'] ?? '')
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'consulta.csv'
      const url = URL.createObjectURL(response.data as Blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao baixar as linhas'))
    } finally {
      setDownloading(false)
    }
  }

  const dayColumns: Column<DayRow>[] = [
    {
      key: 'date',
      header: audit.dateGranularity === 'month' ? 'Mês' : 'Dia',
      render: (d) => ymdLabel(d.date),
    },
    { key: 'rows', header: 'Linhas', render: (d) => d.rows, className: 'text-right' },
    ...(isCount
      ? []
      : [
          {
            key: 'amount',
            header: 'Valor',
            render: (d: DayRow) => formatMetric(d.amount, 'currency'),
            className: 'text-right tabular-nums',
          },
        ]),
  ]
  const branchColumns: Column<BranchRow>[] = [
    { key: 'branch', header: 'Filial', render: (b) => b.branch },
    { key: 'rows', header: 'Linhas', render: (b) => b.rows, className: 'text-right' },
    ...(isCount
      ? []
      : [
          {
            key: 'amount',
            header: 'Valor',
            render: (b: BranchRow) => formatMetric(b.amount, 'currency'),
            className: 'text-right tabular-nums',
          },
        ]),
  ]

  return (
    <div className="mt-4 space-y-4 border-t border-[var(--border)] pt-4" data-testid="reconciliation-audit">
      <div>
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">Como o Addere chegou a esse valor</h4>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
          {auditSummaryLine(audit)}
          {audit.endpointHost ? ` · lido de ${audit.endpointHost}` : ''}
        </p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {isCount
            ? 'O total é a quantidade de linhas que a consulta devolveu. Para conferir: rode o SQL abaixo no Protheus ou baixe as linhas.'
            : `O total é a soma da coluna ${audit.column ?? 'valor'}. Para conferir: rode o SQL abaixo no Protheus e compare pelos grupos, ou baixe as linhas.`}
        </p>
      </div>

      {flags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {flags.map((flag) => (
            <Badge key={flag.text} variant={flag.tone}>
              {flag.text}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={downloadCsv} disabled={downloading}>
          <Download size={14} strokeWidth={1.5} aria-hidden />
          {downloading ? 'Gerando…' : 'Baixar linhas (CSV)'}
        </Button>
        <Button variant="secondary" onClick={copySql}>
          {copied ? <Check size={14} strokeWidth={1.5} aria-hidden /> : <Copy size={14} strokeWidth={1.5} aria-hidden />}
          {copied ? 'SQL copiado' : 'Copiar SQL executado'}
        </Button>
      </div>

      <details className="rounded-lg border border-[var(--border)] bg-[var(--bg-page)]">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-[var(--text-primary)]">
          SQL executado (placeholders já substituídos)
        </summary>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words px-3 pb-3 font-mono text-xs text-[var(--text-secondary)]">
          {audit.executedSql}
        </pre>
      </details>

      {audit.byBranch.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-[var(--text-primary)]">
            Por filial (coluna {audit.branchColumn})
          </p>
          <Table columns={branchColumns} data={audit.byBranch} rowKey={(b) => b.branch} />
        </div>
      )}

      {groupTitle && audit.byDay.length > 0 && (
        <details open={audit.byDay.length <= 31}>
          <summary className="mb-1.5 cursor-pointer text-xs font-medium text-[var(--text-primary)]">
            {groupTitle} ({audit.byDay.length} grupo{audit.byDay.length === 1 ? '' : 's'} · total{' '}
            {formatMetric(groupTotal, audit.unit)})
          </summary>
          <Table columns={dayColumns} data={audit.byDay} rowKey={(d) => d.date} className="max-h-96" />
        </details>
      )}
    </div>
  )
}
