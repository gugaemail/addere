'use client'

// "Como o Addere chegou a esse valor" (W3): quem cadastra a consulta precisa
// refazer a conta fora do Addere. Mostra o SQL exatamente como foi executado,
// linhas e páginas recebidas, filiais, a soma por dia (e por filial) e baixa as
// mesmas linhas em CSV para comparar no Excel com o relatório do Protheus.
import { useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Download } from 'lucide-react'
import type { ReconciliationAudit } from '@addere/types'
import { api, getApiErrorMessage } from '@/lib/api'
import { brl } from '@/lib/intel-helpers'
import { auditFlags, auditSummaryLine, sumAmounts, ymdLabel } from '@/lib/reconciliation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Table, type Column } from '@/components/ui/Table'

interface Props {
  audit: ReconciliationAudit
  contractName: string
  period: string // YYYYMM
  companyParam: { companyId?: string }
}

type DayRow = ReconciliationAudit['byDay'][number]
type BranchRow = ReconciliationAudit['byBranch'][number]

export function ReconciliationAuditPanel({ audit, contractName, period, companyParam }: Props) {
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const flags = auditFlags(audit)
  const dayTotal = sumAmounts(audit.byDay)

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
        { period, ...companyParam },
        { responseType: 'blob' }
      )
      const disposition = String(response.headers['content-disposition'] ?? '')
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `consulta-${period}.csv`
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
    { key: 'date', header: 'Dia', render: (d) => ymdLabel(d.date) },
    { key: 'rows', header: 'Linhas', render: (d) => d.rows, className: 'text-right' },
    { key: 'amount', header: 'Valor', render: (d) => brl(d.amount), className: 'text-right tabular-nums' },
  ]
  const branchColumns: Column<BranchRow>[] = [
    { key: 'branch', header: 'Filial', render: (b) => b.branch },
    { key: 'rows', header: 'Linhas', render: (b) => b.rows, className: 'text-right' },
    { key: 'amount', header: 'Valor', render: (b) => brl(b.amount), className: 'text-right tabular-nums' },
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
          Para conferir: rode o SQL abaixo no Protheus e compare dia a dia, ou baixe as linhas que foram somadas.
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

      {audit.byDay.length > 0 && (
        <details open={audit.byDay.length <= 31}>
          <summary className="mb-1.5 cursor-pointer text-xs font-medium text-[var(--text-primary)]">
            Por dia ({audit.byDay.length} dia{audit.byDay.length === 1 ? '' : 's'} · total {brl(dayTotal)})
          </summary>
          <Table columns={dayColumns} data={audit.byDay} rowKey={(d) => d.date} className="max-h-96" />
        </details>
      )}
    </div>
  )
}
