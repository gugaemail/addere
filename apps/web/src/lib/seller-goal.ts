// Meta do mês no card do vendedor (Equipe em campo) — a mesma da tela Hoje do
// app, em qualquer recorte. Puro: testado em __tests__/seller-goal.test.ts.
import type { TeamSellerGoal } from '@/hooks/useIntel'
import { brl } from './intel-helpers'

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

export interface SellerGoalView {
  /** 'Meta de outubro' — sem captura no mês, 'Meta do mês' */
  title: string
  /** '120%' — null quando não há meta para comparar */
  pctLabel: string | null
  /** Largura da barra: o percentual real pode passar de 100, a barra não */
  barPct: number
  reached: boolean
  line: string
  /** 'Capturada em 28/10 às 16:53' (horário de Brasília) */
  capturedLabel: string | null
}

const toNumber = (value: string | null): number | null => {
  if (value === null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function capturedLabel(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `Capturada em ${get('day')}/${get('month')} às ${get('hour')}:${get('minute')}`
}

export function sellerGoalView(goal: TeamSellerGoal | null): SellerGoalView {
  if (!goal) {
    return {
      title: 'Meta do mês',
      pctLabel: null,
      barPct: 0,
      reached: false,
      line: 'Sem meta capturada neste mês',
      capturedLabel: null,
    }
  }

  const month = MONTHS[Number(goal.period.slice(4, 6)) - 1]
  const title = month ? `Meta de ${month}` : 'Meta do mês'
  const target = toNumber(goal.goalAmount)
  const sold = toNumber(goal.soldAmount) ?? 0
  const captured = capturedLabel(goal.capturedAt)

  // Mesma regra do card da Hoje no app: meta zerada ou ausente não é meta
  if (target === null || target <= 0) {
    return {
      title,
      pctLabel: null,
      barPct: 0,
      reached: false,
      line: `Sem meta cadastrada no Protheus · vendido ${brl(sold)}`,
      capturedLabel: captured,
    }
  }

  const pct = goal.pct ?? Math.round((sold / target) * 100)
  const gap = toNumber(goal.gap) ?? Math.max(0, target - sold)
  const reached = gap <= 0
  return {
    title,
    pctLabel: `${pct}%`,
    barPct: Math.min(100, Math.max(0, pct)),
    reached,
    line: `Vendido ${brl(sold)} de ${brl(target)} · ${reached ? 'meta batida' : `faltam ${brl(gap)}`}`,
    capturedLabel: captured,
  }
}
