// Acesso suspenso da empresa (plano 017) — funções puras do painel, testadas em
// __tests__/company-block.test.ts. O layout decide a tela e o menu por aqui; a
// faixa de cobrança do ADMIN monta o texto por billingBannerContent.
//
// Datas: a API manda dia civil como 'YYYY-MM-DD' e competência como 'YYYY-MM';
// aqui só se reordena o texto, sem Date no fuso do navegador. "Hoje" é o dia
// civil de São Paulo (civilDaySaoPaulo, de @addere/types).
import {
  civilDaySaoPaulo,
  formatBillingDate,
  type BillingOverdueStatus,
  type ClientBlockState,
} from '@addere/types'

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

// ─── Ficha do cliente (SUPERADMIN): o cartão "Acesso" ────────────────────────

/** Instante ISO → 'DD/MM/AAAA' no dia civil de São Paulo */
export function instantDayLabel(iso: string): string {
  return formatBillingDate(civilDaySaoPaulo(new Date(iso)))
}

export interface ClientAccessCardContent {
  tone: 'success' | 'warning' | 'danger' | 'neutral'
  title: string
  detail: string | null
  /** "Liberar até…": com bloqueio, aviso pendente ou liberação vigente */
  canRelease: boolean
}

/**
 * Os estados do cartão "Acesso" da ficha, na precedência do plano 017:
 * desativada → bloqueada (MANUAL reservado, ou por atraso) → liberada até →
 * aviso enviado → liberada. Não há "Bloquear": o bloqueio manual está
 * desabilitado.
 */
export function clientAccessCardContent(block: ClientBlockState): ClientAccessCardContent {
  const notice = block.pendingNotice
  const noticeDetail = notice
    ? `Aviso de suspensão enviado em ${instantDayLabel(notice.sentAt)} (fatura nº ${invoiceLabel(notice.invoiceNumber)}), com data prevista ${isoDayLabel(notice.plannedBlockDate)}.`
    : null
  const canRelease = block.blockedAt !== null || notice !== null || block.exemptUntil !== null

  if (!block.companyActive) {
    return {
      tone: 'neutral',
      title: 'Empresa desativada — o acesso está cortado (ficha técnica, Ativar empresa)',
      detail: noticeDetail,
      canRelease,
    }
  }
  if (block.blockedAt && block.reason === 'MANUAL') {
    // Reservado: nenhum código grava MANUAL; só aparece se gravado à mão
    return {
      tone: 'danger',
      title: `Bloqueado desde ${instantDayLabel(block.blockedAt)}, fora do previsto — use Liberar até…`,
      detail: null,
      canRelease,
    }
  }
  if (block.blockedAt) {
    return {
      tone: 'danger',
      title: `Bloqueado por atraso desde ${instantDayLabel(block.blockedAt)}`,
      detail: noticeDetail,
      canRelease,
    }
  }
  if (block.exemptUntil) {
    return {
      tone: 'success',
      title: `Liberado até ${isoDayLabel(block.exemptUntil)}`,
      detail: noticeDetail,
      canRelease,
    }
  }
  if (notice) {
    return {
      tone: 'warning',
      title: `Aviso enviado em ${instantDayLabel(notice.sentAt)} — suspensão prevista em ${isoDayLabel(notice.plannedBlockDate)} (fatura nº ${invoiceLabel(notice.invoiceNumber)})`,
      detail: null,
      canRelease,
    }
  }
  return { tone: 'success', title: 'Acesso liberado', detail: null, canRelease }
}

// ─── "Liberar até…" ──────────────────────────────────────────────────────────

/** Teto da liberação com data, o mesmo MAX_EXEMPTION_DAYS da API */
export const MAX_EXEMPTION_DAYS = 90

function ymdToIso(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`
}

function addDays(ymd: string, days: number): string {
  const d = new Date(
    Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)) + days)
  )
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
}

/** A faixa do campo de data: de hoje a hoje + 90, em 'YYYY-MM-DD' */
export function unblockDateRange(todayYmd: string): { min: string; max: string } {
  return { min: ymdToIso(todayYmd), max: ymdToIso(addDays(todayYmd, MAX_EXEMPTION_DAYS)) }
}

/** Erro do campo "Liberar até" ('' = sem data, vale), ou null se válido */
export function unblockUntilError(value: string, todayYmd: string): string | null {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Data inválida'
  const { min, max } = unblockDateRange(todayYmd)
  if (value < min || value > max) {
    return `Escolha uma data entre ${isoDayLabel(min)} e ${isoDayLabel(max)}.`
  }
  return null
}

// ─── "Desativar empresa" ─────────────────────────────────────────────────────

/** O aviso da confirmação: desde o plano 017, desativar corta o acesso de todos */
export const DEACTIVATE_COMPANY_WARNING =
  'Desativar corta o acesso de todos os usuários da empresa ao app e ao painel — o administrador só vê Contrato e Plano e cobrança — e para o sync automático do Protheus. Nenhum dado é apagado. Atraso de pagamento não passa por aqui: segue o aviso de 10 dias e a suspensão automática.'
