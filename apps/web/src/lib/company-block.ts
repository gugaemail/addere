// Acesso suspenso da empresa (plano 017) — funções puras do painel, testadas em
// __tests__/company-block.test.ts. O layout decide a tela e o menu por aqui; a
// faixa de cobrança do ADMIN monta o texto por billingBannerContent.
//
// Datas: a API manda dia civil como 'YYYY-MM-DD' e competência como 'YYYY-MM';
// aqui só se reordena o texto, sem Date no fuso do navegador. "Hoje" é o dia
// civil de São Paulo (civilDaySaoPaulo, de @addere/types).
import { civilDaySaoPaulo, formatBillingDate, type BillingOverdueStatus } from '@addere/types'

/** As telas que o ADMIN de empresa bloqueada ainda abre: o contrato e a cobrança (§6.6). */
export const BLOCKED_ALLOWED_PREFIXES = ['/plano', '/contrato'] as const

function matchesPrefix(pathname: string): boolean {
  return BLOCKED_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** Só o ADMIN, e só em /plano e /contrato (inclusive /contrato/[id]/imprimir). */
export function isAllowedWhileBlocked(
  pathname: string,
  { isAdmin }: { isAdmin: boolean }
): boolean {
  return isAdmin && matchesPrefix(pathname)
}

/** O menu da empresa bloqueada: só os itens de /plano e /contrato; grupo vazio some. */
export function blockedNavGroups<Item extends { href: string }, Group extends { items: Item[] }>(
  groups: Group[]
): Group[] {
  return groups
    .map((group) => ({ ...group, items: group.items.filter((i) => matchesPrefix(i.href)) }))
    .filter((group) => group.items.length > 0)
}

/** Hoje em São Paulo, 'YYYYMMDD'. */
export function todayYmdSaoPaulo(now: Date = new Date()): string {
  const d = civilDaySaoPaulo(now)
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
}

/** 'YYYY-MM-DD' → 'DD/MM/AAAA' */
export function isoDayLabel(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** 'YYYY-MM' → 'MM/AAAA' */
function competenceLabel(iso: string): string {
  const [y, m] = iso.split('-')
  return `${m}/${y}`
}

/** Número da fatura com seis dígitos, como em Faturas e no e-mail (016) */
function invoiceLabel(n: number): string {
  return String(n).padStart(6, '0')
}

/** Dias corridos de `fromYmd` até `toYmd` ('YYYYMMDD') */
function daysBetween(fromYmd: string, toYmd: string): number {
  const utc = (ymd: string) =>
    Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)))
  return Math.round((utc(toYmd) - utc(fromYmd)) / 86_400_000)
}

export interface BillingBannerContent {
  tone: 'warning' | 'danger'
  text: string
}

/**
 * O texto da faixa de cobrança do ADMIN, com as variações do esboço do plano
 * 017. Sem fatura vencida e com a empresa liberada: null (nada de faixa).
 */
export function billingBannerContent(
  status: BillingOverdueStatus,
  todayYmd: string
): BillingBannerContent | null {
  const { access, invoice, plannedBlockDate } = status

  if (access.blocked) {
    if (access.reason === 'INACTIVE') {
      return { tone: 'danger', text: 'Empresa desativada. Fale com a Addere.' }
    }
    if (access.reason === 'MANUAL') {
      // Reservado: nenhum código grava MANUAL; só aparece se alguém o gravar à mão
      return { tone: 'danger', text: 'Acesso suspenso pela Addere. Fale com a Addere.' }
    }
    const since = status.blockedAt
      ? ` desde ${formatBillingDate(civilDaySaoPaulo(new Date(status.blockedAt)))}`
      : ''
    const which = invoice
      ? `: fatura nº ${invoiceLabel(invoice.number)} vencida em ${isoDayLabel(invoice.dueDate)}`
      : ''
    return {
      tone: 'danger',
      text: `Acesso suspenso${since}${which}. Nenhum dado foi apagado. A baixa do pagamento libera o acesso na hora.`,
    }
  }

  if (!invoice) return null

  const head = `Fatura nº ${invoiceLabel(invoice.number)} (${competenceLabel(invoice.competence)})`
  if (!plannedBlockDate) {
    return { tone: 'warning', text: `${head} vencida em ${isoDayLabel(invoice.dueDate)}.` }
  }
  const plannedYmd = plannedBlockDate.replace(/-/g, '')
  const daysLeft = daysBetween(todayYmd, plannedYmd)
  if (daysLeft <= 0) {
    return {
      tone: 'warning',
      text: `${head} vencida desde ${isoDayLabel(invoice.dueDate)}. O acesso pode ser suspenso a qualquer momento.`,
    }
  }
  const inDays = daysLeft === 1 ? 'em 1 dia' : `em ${daysLeft} dias`
  return {
    tone: 'warning',
    text: `${head} vencida em ${isoDayLabel(invoice.dueDate)}. Se não for paga, o acesso ao app e ao painel será suspenso em ${isoDayLabel(plannedBlockDate)} (${inDays}).`,
  }
}
