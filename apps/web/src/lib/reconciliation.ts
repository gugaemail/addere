// Reconciliação no painel (W3) — textos, números e contas puros, testados.
// Cada contrato reconcilia de um jeito (ver ReconciliationSpec): vendas por mês
// fechado, títulos pelo saldo de hoje, clientes e produtos por quantidade, e
// estoque não reconcilia.
import type { ReconciliationAudit, ReconciliationSpec } from '@addere/types'

/** '20260105' → '05/01/2026'; '202601' → '01/2026'; o resto volta como veio */
export function ymdLabel(value: string): string {
  if (/^\d{8}$/.test(value)) return `${value.slice(6, 8)}/${value.slice(4, 6)}/${value.slice(0, 4)}`
  if (/^\d{6}$/.test(value)) return `${value.slice(4, 6)}/${value.slice(0, 4)}`
  return value
}

/** Valor da métrica: R$ para soma, número inteiro para contagem */
export function formatMetric(value: string | number | null | undefined, unit: 'currency' | 'count'): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'
  return unit === 'count'
    ? Math.round(n).toLocaleString('pt-BR')
    : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Número oficial digitado → número. Moeda aceita "1.234.567,89" e "1234.56";
 * quantidade aceita "1.234" (ponto de milhar) e recusa fração.
 */
export function parseOfficialNumber(text: string, unit: 'currency' | 'count'): number | null {
  const s = text.trim().replace(/[R$\s]/g, '')
  if (!s) return null
  if (unit === 'count') {
    if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(s)) return null
    return Number(s.replace(/\./g, ''))
  }
  const normalized =
    s.includes(',') && (!s.includes('.') || s.lastIndexOf('.') < s.lastIndexOf(','))
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

/** Textos do passo "Reconciliação" conforme o contrato */
export function reconciliationCopy(spec: ReconciliationSpec): {
  needsMonth: boolean
  applies: boolean
  placeholder: string
  pendingText: string
  publishRequirement: string
} {
  switch (spec.kind) {
    case 'SUM_MONTH':
      return {
        needsMonth: true,
        applies: true,
        placeholder: '1.234.567,89',
        pendingText: 'pendente',
        publishRequirement: 'Exige prévia ok + reconciliação de um mês fechado dentro da tolerância.',
      }
    case 'SUM_SNAPSHOT':
      return {
        needsMonth: false,
        applies: true,
        placeholder: '63.707,07',
        pendingText: 'pendente',
        publishRequirement: 'Exige prévia ok + reconciliação da posição de hoje dentro da tolerância.',
      }
    case 'COUNT_SNAPSHOT':
      return {
        needsMonth: false,
        applies: true,
        placeholder: '1.240',
        pendingText: 'pendente',
        publishRequirement: 'Exige prévia ok + reconciliação da quantidade de hoje dentro da tolerância.',
      }
    case 'NONE':
      return {
        needsMonth: false,
        applies: false,
        placeholder: '',
        pendingText: 'não se aplica',
        publishRequirement: 'Exige só a prévia ok.',
      }
  }
}

/** Linha de resumo da auditoria */
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
  parts.push(
    audit.window
      ? `${ymdLabel(audit.window.dataIni)} a ${ymdLabel(audit.window.dataFim)}`
      : 'posição de hoje'
  )
  return parts.join(' · ')
}

/** Título do agrupamento por data: "Por dia" (vendas) ou "Por mês de vencimento" (títulos) */
export function dateGroupTitle(audit: ReconciliationAudit): string | null {
  if (!audit.dateColumn) return null
  if (audit.dateGranularity === 'month') {
    return audit.dateColumn === 'vencimento' ? 'Por mês de vencimento' : `Por mês (${audit.dateColumn})`
  }
  return audit.dateColumn === 'data' ? 'Por dia' : `Por dia (${audit.dateColumn})`
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
  if (audit.duplicateKeys > 0) {
    flags.push({
      tone: 'warning',
      text: `${audit.duplicateKeys} ${audit.keyColumns.join('+')} repetido(s)`,
    })
  }
  if (audit.invalidValues > 0) {
    flags.push({ tone: 'warning', text: `${audit.invalidValues} valor(es) ignorado(s) por não serem número` })
  }
  if (audit.branches.length > 1) {
    flags.push({ tone: 'warning', text: `Total de ${audit.branches.length} filiais` })
  }
  return flags
}

/** Soma de uma lista de valores decimais em texto, arredondada a centavos */
export function sumAmounts(items: { amount: string }[]): number {
  return Math.round(items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) * 100) / 100
}
