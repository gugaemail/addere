// Helpers puros da tela "Resultado da Inteligência" (W7) — testados em
// __tests__/pilot-metrics.test.ts. A tela só formata o que
// GET /intel/manager/pilot-metrics já calculou; nada aqui recalcula conversão.
import type { MetricRatio as Ratio } from '@/hooks/useIntel'

export type { Ratio }

export type LiftTone = 'positivo' | 'negativo' | 'indefinido'

export interface LiftLabel {
  tone: LiftTone
  text: string
}

/**
 * Leitura do lift (sugestão − fora do plano, em pontos percentuais).
 * O caso negativo é informação legítima — a escolha do vendedor converteu
 * mais do que a sugestão do motor nesta janela — e precisa aparecer na tela
 * com tratamento próprio, não ser escondido atrás de um texto genérico.
 */
export function liftLabel(liftPp: number | null): LiftLabel {
  if (liftPp === null || !Number.isFinite(liftPp)) {
    return {
      tone: 'indefinido',
      text: 'Ainda não há visitas fora do plano suficientes para comparar',
    }
  }
  if (liftPp < 0) {
    return {
      tone: 'negativo',
      text: 'A escolha do vendedor converteu mais nesta janela',
    }
  }
  return {
    tone: 'positivo',
    text:
      'Quem o Addere mandou visitar comprou mais do que quem o vendedor escolheu por conta ' +
      'própria, nesta janela.',
  }
}

/**
 * "40 de 64 clientes"; sem denominador, "sem clientes na janela". `unit`
 * troca o rótulo (ex.: "em risco" para a recuperação de risco) sem mudar o
 * contrato padrão de quem chama com um argumento só.
 */
export function ratioSubtitle(r: Ratio, unit = 'clientes'): string {
  if (r.total === 0) return 'sem clientes na janela'
  return `${r.hits} de ${r.total} ${unit}`
}

export type MonthRangeKind = 'current' | 'previous' | 'last3'

interface YearMonth {
  year: number
  month: number // 1-12
}

function parseYmd(ymd: string): { year: number; month: number } {
  const [year, month] = ymd.split('-').map(Number)
  return { year, month }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Último dia do mês pelo calendário (28/29/30/31) — nunca `dia 1 + 30`. */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Desloca `delta` meses a partir de `ym`, estourando o ano corretamente. */
function shiftMonth(ym: YearMonth, delta: number): YearMonth {
  const total = ym.year * 12 + (ym.month - 1) + delta
  return { year: Math.floor(total / 12), month: (total % 12) + 1 }
}

function monthStart(ym: YearMonth): string {
  return `${ym.year}-${pad2(ym.month)}-01`
}

function monthEnd(ym: YearMonth): string {
  return `${ym.year}-${pad2(ym.month)}-${pad2(lastDayOfMonth(ym.year, ym.month))}`
}

/**
 * Período em 'YYYY-MM-DD' para alimentar `usePilotMetrics`. Puro: recebe o
 * dia de hoje já resolvido (`todayInSaoPaulo()`), nunca chama `new Date()`
 * por conta própria — senão o resultado passa a depender do fuso de quem
 * roda e a função deixa de ser testável.
 *
 * - `current`: dia 1 do mês corrente até hoje.
 * - `previous`: o mês fechado anterior, inteiro (do 1º ao último dia do
 *   calendário — nunca `1º + 30`).
 * - `last3`: os três meses fechados anteriores ao corrente, inteiros.
 *
 * A virada de ano é implícita em `shiftMonth`: o mês anterior a janeiro é
 * dezembro do ano anterior.
 */
export function monthRange(kind: MonthRangeKind, todayYmd: string): { from: string; to: string } {
  const current = parseYmd(todayYmd)

  if (kind === 'current') {
    return { from: monthStart(current), to: todayYmd }
  }

  if (kind === 'previous') {
    const previous = shiftMonth(current, -1)
    return { from: monthStart(previous), to: monthEnd(previous) }
  }

  // last3: os três meses fechados antes do corrente (current - 3 .. current - 1)
  const start = shiftMonth(current, -3)
  const end = shiftMonth(current, -1)
  return { from: monthStart(start), to: monthEnd(end) }
}

/**
 * "01/10/2026 a 06/10/2026" — sempre DD/MM/YYYY nas duas pontas. Atenção:
 * `PilotMetrics.range` vem em 'YYYYMMDD' (compacto), não em 'YYYY-MM-DD'.
 */
export function rangeLabel(fromYmd: string, toYmd: string): string {
  const format = (ymd: string) => `${ymd.slice(6, 8)}/${ymd.slice(4, 6)}/${ymd.slice(0, 4)}`
  return `${format(fromYmd)} a ${format(toYmd)}`
}
