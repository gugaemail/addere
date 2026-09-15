// Auditoria da reconciliação no painel (W3) — textos e contas puros, testados.
import type { ReconciliationAudit } from '@addere/types'

/** '20260105' → '05/01/2026'; qualquer outra coisa volta como veio */
export function ymdLabel(ymd: string): string {
  return /^\d{8}$/.test(ymd) ? `${ymd.slice(6, 8)}/${ymd.slice(4, 6)}/${ymd.slice(0, 4)}` : ymd
}

/** Linha de resumo: "236 linhas em 3 páginas de até 100 · filiais 0101 · 01/01/2026 a 31/01/2026" */
export function auditSummaryLine(audit: ReconciliationAudit): string {
  const parts = [
    `${audit.rows} linha${audit.rows === 1 ? '' : 's'} em ${audit.pages} página${audit.pages === 1 ? '' : 's'}${
      audit.pageSize ? ` de até ${audit.pageSize}` : ''
    }`,
  ]
  if (audit.distinctOrders !== null) {
    parts.push(`${audit.distinctOrders} pedido${audit.distinctOrders === 1 ? '' : 's'}`)
  }
  if (audit.branches.length > 0) {
    parts.push(`${audit.branches.length === 1 ? 'filial' : 'filiais'} ${audit.branches.join(', ')}`)
  }
  parts.push(`${ymdLabel(audit.window.dataIni)} a ${ymdLabel(audit.window.dataFim)}`)
  return parts.join(' · ')
}

export type AuditFlagTone = 'danger' | 'warning'

export interface AuditFlag {
  tone: AuditFlagTone
  text: string
}

/** Sinais que invalidam ou pedem atenção no total — na ordem de gravidade */
export function auditFlags(audit: ReconciliationAudit): AuditFlag[] {
  const flags: AuditFlag[] = []
  if (audit.source === 'mock') {
    flags.push({ tone: 'danger', text: 'Dados sintéticos: a API não consultou o Protheus' })
  }
  if (audit.truncated) {
    flags.push({ tone: 'danger', text: `Resultado cortado em ${audit.rows} linhas` })
  }
  if (audit.duplicateRows > 0) {
    flags.push({ tone: 'danger', text: `${audit.duplicateRows} linha(s) idêntica(s) repetida(s)` })
  }
  if (audit.duplicateKeys > audit.duplicateRows) {
    flags.push({
      tone: 'warning',
      text: `${audit.duplicateKeys - audit.duplicateRows} pedido+item+produto repetido(s)`,
    })
  }
  if (audit.invalidValues > 0) {
    flags.push({ tone: 'warning', text: `${audit.invalidValues} valor(es) ignorado(s) por não serem número` })
  }
  if (audit.branches.length > 1) {
    flags.push({ tone: 'warning', text: `Soma de ${audit.branches.length} filiais` })
  }
  return flags
}

/** Soma de uma lista de valores decimais em texto, arredondada a centavos */
export function sumAmounts(items: { amount: string }[]): number {
  return Math.round(items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) * 100) / 100
}
