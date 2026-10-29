import { prisma } from '@addere/db'
import { formatBrl } from '@addere/types'
import { renderEmail } from '../../lib/email-layout'
import { sendBillingEmailOnce, webUrl, type SendOutcome } from './billing-mailer'

// Aviso à Addere do orçamento de IA de uma empresa (custo do agente): aos 80 %
// e aos 100 %, quando o agente pausa até o fim do mês. Uma vez por nível e por
// mês (dedupeKey), para o notifyEmail das regras de cobrança. O cliente não é
// avisado: o orçamento é controle de custo da Addere, e o app segue com o
// texto do motor.

export type BudgetAlertLevel = 80 | 100

export interface BudgetAlert {
  companyId: string
  month: string // 'YYYY-MM'
  level: BudgetAlertLevel
  pct: number
  tokens: number
  costBrl: number | null
  budgetTokens: number | null
  budgetBrl: number | null
}

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number)
  return `${MONTHS[m - 1]} de ${year}`
}

const formatTokens = (n: number) => `${new Intl.NumberFormat('pt-BR').format(n)} tokens`

export function budgetAlertSubject(level: BudgetAlertLevel, companyName: string): string {
  return level === 100
    ? `IA pausada: orçamento do mês atingido — ${companyName}`
    : `IA em 80% do orçamento do mês — ${companyName}`
}

export async function sendLlmBudgetAlert(alert: BudgetAlert): Promise<SendOutcome> {
  const [company, settings] = await Promise.all([
    prisma.company.findUnique({ where: { id: alert.companyId }, select: { name: true } }),
    prisma.billingSettings.findUnique({ where: { id: 'global' }, select: { notifyEmail: true } }),
  ])
  const companyName = company?.name ?? 'Empresa'
  const used: [string, string][] = [
    ['Empresa', companyName],
    ['Mês', monthLabel(alert.month)],
    ['Usado', `${alert.pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do orçamento`],
    [
      'Consumo',
      [alert.costBrl === null ? null : formatBrl(alert.costBrl), formatTokens(alert.tokens)]
        .filter(Boolean)
        .join(' · '),
    ],
    [
      'Orçamento',
      [
        alert.budgetBrl === null ? null : formatBrl(alert.budgetBrl),
        alert.budgetTokens === null ? null : formatTokens(alert.budgetTokens),
      ]
        .filter(Boolean)
        .join(' · '),
    ],
  ]

  return sendBillingEmailOnce({
    companyId: alert.companyId,
    dedupeKey: `llm-budget:${alert.companyId}:${alert.month}:${alert.level}`,
    eventType: alert.level === 100 ? 'LLM_BUDGET_EXCEEDED' : 'LLM_BUDGET_WARNING',
    payload: { month: alert.month, pct: alert.pct },
    to: settings?.notifyEmail ? [settings.notifyEmail] : [],
    subject: budgetAlertSubject(alert.level, companyName),
    ...renderEmail({
      preheader:
        alert.level === 100
          ? `${companyName} atingiu o orçamento de IA do mês: o agente pausou.`
          : `${companyName} já usou 80% do orçamento de IA do mês.`,
      heading: alert.level === 100 ? 'IA pausada até o fim do mês' : 'IA em 80% do orçamento',
      paragraphs: [
        alert.level === 100
          ? 'A empresa atingiu o orçamento de IA do mês. O agente pausou: até o dia 1º, o app mostra só o texto do motor. Para liberar antes, aumente o orçamento na ficha de custo de IA.'
          : 'A empresa já usou 80% do orçamento de IA do mês. Ao chegar a 100%, o agente pausa até o dia 1º e o app passa a mostrar só o texto do motor.',
      ],
      details: used,
      action: { label: 'Abrir custo de IA', url: webUrl('/gestao/clientes') },
      reason:
        'Você recebeu este e-mail porque é o endereço de avisos das regras de cobrança da Gestão Addere.',
    }),
  })
}
