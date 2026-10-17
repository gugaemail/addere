import type { Prisma } from '@prisma/client'
import { Resend } from 'resend'
import { prisma } from '@addere/db'
import {
  CONTRACT_DOCUMENT_KIND_LABELS,
  CONTRATADA,
  formatBillingDate,
  formatBrl,
  formatCompetence,
  type BillingEventType,
  type ContractDocumentKind,
} from '@addere/types'
import { env } from '../../lib/env'
import { captureError } from '../../lib/sentry'
import { isUniqueViolation } from './billing-events'

// Envio de e-mail da Gestão Addere (plano 014), no padrão do reset de senha
// (auth.service.ts). O 015 e o 016 acrescentam aqui as funções deles.
//
// Diferenças de propósito: sem RESEND_API_KEY o envio só avisa e devolve
// false, sem erro (o contrato enviado continua válido e o superadmin reenvia
// depois); e todo texto vindo do banco passa por escapeHtml antes de entrar no
// HTML. Nada de dado pessoal no log nem no Sentry: nem o destinatário, nem o
// assunto, nem a mensagem de erro do Resend (que pode citar o endereço).

const FALLBACK_WEB_URL = 'https://addere-web.vercel.app' // o mesmo do auth.service.ts

/** URL do painel com o caminho: WEB_URL do ambiente, com o mesmo fallback do reset de senha */
export function webUrl(path: string): string {
  const base = (env.WEB_URL ?? FALLBACK_WEB_URL).replace(/\/+$/, '')
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

/** Texto do banco → seguro dentro do HTML do e-mail */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Um destinatário por chamada (ninguém vê o endereço de ninguém). Devolve se o
 * e-mail saiu. O SDK do Resend 4.x DEVOLVE `{ data, error }` em vez de lançar
 * quando a API recusa: o `error` é conferido.
 */
export async function sendBillingEmail(input: {
  to: string
  subject: string
  html: string
}): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.warn('[billing] RESEND_API_KEY não configurada — e-mail não enviado')
    return false
  }
  try {
    const resend = new Resend(env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: 'Addere <noreply@addere.com.br>',
      to: [input.to],
      replyTo: CONTRATADA.emailContato,
      subject: input.subject,
      html: input.html,
    })
    if (error) {
      captureError(new Error(`Resend recusou o envio: ${error.name}`), {
        module: 'billing',
        op: 'send-email',
      })
      return false
    }
    return true
  } catch (err) {
    captureError(err, { module: 'billing', op: 'send-email' })
    return false
  }
}

// ─── Envio com deduplicação (plano 016) ─────────────────────────────────────
// Lembretes do agendador: o mesmo e-mail não pode sair duas vezes, nem com dois
// ticks, nem com dois processos durante um deploy, nem com um jobs/run manual
// no meio do tick automático. A trava é o dedupeKey único do BillingEvent: a
// reserva vem ANTES do envio, e só um envio que não aconteceu a libera.

export type SendOutcome = 'sent' | 'duplicate' | 'skipped' | 'failed'

const FROM = 'Addere <noreply@addere.com.br>' // o mesmo do reset de senha

/** Minúsculas, sem espaço, sem vazio e sem repetição, na ordem de chegada */
export function normalizeRecipients(emails: ReadonlyArray<string | null | undefined>): string[] {
  const seen = new Set<string>()
  for (const email of emails) {
    const normalized = email?.trim().toLowerCase()
    if (normalized) seen.add(normalized)
  }
  return [...seen]
}

/** Contato de cobrança do cadastro mais os ADMINs ativos da empresa */
export async function billingRecipients(companyId: string): Promise<string[]> {
  const [profile, admins] = await Promise.all([
    prisma.clientProfile.findUnique({ where: { companyId }, select: { billingEmail: true } }),
    prisma.user.findMany({
      where: { companyId, role: 'ADMIN', active: true },
      select: { email: true },
    }),
  ])
  return normalizeRecipients([profile?.billingEmail, ...admins.map((a) => a.email)])
}

/** Responder vai para o e-mail da Addere das regras de cobrança; sem ele, o contato da Addere */
async function replyToAddress(): Promise<string> {
  const settings = await prisma.billingSettings.findUnique({
    where: { id: 'global' },
    select: { notifyEmail: true },
  })
  return settings?.notifyEmail?.trim() || CONTRATADA.emailContato
}

async function releaseReservation(dedupeKey: string): Promise<void> {
  try {
    // A única exclusão de BillingEvent permitida: a reserva de um envio que
    // não aconteceu. Sem ela, o lembrete nunca mais sairia.
    await prisma.billingEvent.deleteMany({ where: { dedupeKey } })
  } catch (err) {
    captureError(err, { module: 'billing', op: 'release-reservation' })
  }
}

/**
 * Envia uma vez só por `dedupeKey`. A ordem importa:
 *
 * 1. sem RESEND_API_KEY ou sem destinatário → 'skipped', sem gravar nada
 *    (quando a chave entrar, o lembrete ainda sai);
 * 2. reserva: cria o BillingEvent com o dedupeKey, autor null. P2002 →
 *    'duplicate' (outro tick ou outro processo já mandou);
 * 3. envia com idempotencyKey = dedupeKey (o Resend também deduplica);
 * 4. `error` no retorno, ou exceção: apaga a reserva, Sentry, 'failed' (o
 *    próximo tick tenta de novo);
 * 5. sucesso → 'sent'.
 *
 * Erro de banco na reserva (não P2002) é lançado: nada foi reservado nem
 * enviado, e quem chama decide se é transitório.
 */
export async function sendBillingEmailOnce(input: {
  companyId: string
  dedupeKey: string // ex.: 'invoice:<id>:due-reminder'
  eventType: BillingEventType
  payload: Record<string, unknown> // só ids e nomes de campo
  to: string[]
  subject: string
  html: string
}): Promise<SendOutcome> {
  const to = normalizeRecipients(input.to)
  if (!env.RESEND_API_KEY || to.length === 0) return 'skipped'

  const replyTo = await replyToAddress()

  try {
    await prisma.billingEvent.create({
      data: {
        type: input.eventType,
        companyId: input.companyId,
        actorId: null,
        payload: input.payload as Prisma.InputJsonObject,
        dedupeKey: input.dedupeKey,
      },
    })
  } catch (err) {
    if (isUniqueViolation(err)) return 'duplicate'
    throw err
  }

  let failure: unknown
  try {
    const resend = new Resend(env.RESEND_API_KEY)
    const { error } = await resend.emails.send(
      { from: FROM, to, replyTo, subject: input.subject, html: input.html },
      { idempotencyKey: input.dedupeKey }
    )
    failure = error
  } catch (err) {
    failure = err
  }

  if (failure) {
    await releaseReservation(input.dedupeKey)
    // Sem destinatário, assunto nem a mensagem do Resend (pode citar o endereço)
    const name =
      failure instanceof Error ? failure.name : String((failure as { name?: unknown }).name)
    captureError(new Error(`Resend recusou o envio: ${name}`), {
      module: 'billing',
      op: 'send-email-once',
      eventType: input.eventType,
    })
    return 'failed'
  }
  return 'sent'
}

// ─── Envio que grava depois (plano 017) ─────────────────────────────────────
// O aviso de suspensão NÃO usa o sendBillingEmailOnce, de propósito (decisão
// de desenho 1 do plano 017). Lá a reserva é gravada antes do envio: se o
// processo caísse entre a reserva e o envio, ficaria um aviso gravado sem
// e-mail, e 10 dias depois a empresa seria bloqueada sem ter sido avisada.
// Aqui o evento só é gravado DEPOIS de o Resend aceitar. O pior caso (cair
// entre o envio e a gravação) é o cliente receber o aviso de novo no tick
// seguinte: o erro possível vai sempre para o lado do cliente, nunca para
// "bloqueou sem avisar". O lembrete de 3 dias não é condição de bloqueio e
// continua no sendBillingEmailOnce.

/**
 * Envia e só então grava o BillingEvent com o `dedupeKey`. A ordem:
 *
 * 1. sem RESEND_API_KEY ou sem destinatário → 'skipped', nada gravado;
 * 2. já existe evento com o `dedupeKey` → 'duplicate', sem enviar;
 * 3. envia com `idempotencyKey` (para o aviso: o dedupeKey + a data prevista,
 *    porque um reenvio com data recalculada é outro e-mail);
 * 4. erro do Resend (retorno com `error` ou exceção) → Sentry e 'failed',
 *    nada gravado;
 * 5. sucesso → grava o evento; P2002 aqui é outro tick que gravou primeiro →
 *    'duplicate'; senão 'sent'.
 *
 * Erro de banco na gravação (não P2002) é lançado: o e-mail saiu, mas sem
 * evento não há bloqueio, e o próximo tick avisa de novo.
 */
export async function sendBillingEmailThenRecord(input: {
  companyId: string
  dedupeKey: string // ex.: 'invoice:<id>:suspension-notice'
  idempotencyKey: string
  eventType: BillingEventType
  payload: Record<string, unknown> // só ids, datas e contagens
  to: string[]
  subject: string
  html: string
}): Promise<SendOutcome> {
  const to = normalizeRecipients(input.to)
  if (!env.RESEND_API_KEY || to.length === 0) return 'skipped'

  const existing = await prisma.billingEvent.findUnique({
    where: { dedupeKey: input.dedupeKey },
    select: { id: true },
  })
  if (existing) return 'duplicate'

  const replyTo = await replyToAddress()

  let failure: unknown
  try {
    const resend = new Resend(env.RESEND_API_KEY)
    const { error } = await resend.emails.send(
      { from: FROM, to, replyTo, subject: input.subject, html: input.html },
      { idempotencyKey: input.idempotencyKey }
    )
    failure = error
  } catch (err) {
    failure = err
  }

  if (failure) {
    // Sem destinatário, assunto nem a mensagem do Resend (pode citar o endereço)
    const name =
      failure instanceof Error ? failure.name : String((failure as { name?: unknown }).name)
    captureError(new Error(`Resend recusou o envio: ${name}`), {
      module: 'billing',
      op: 'send-email-then-record',
      eventType: input.eventType,
    })
    return 'failed'
  }

  try {
    await prisma.billingEvent.create({
      data: {
        type: input.eventType,
        companyId: input.companyId,
        actorId: null,
        payload: input.payload as Prisma.InputJsonObject,
        dedupeKey: input.dedupeKey,
      },
    })
  } catch (err) {
    if (isUniqueViolation(err)) return 'duplicate'
    throw err
  }
  return 'sent'
}

// ─── Modelos dos lembretes (plano 016) ──────────────────────────────────────
// Todo texto do banco (nome da empresa, descrição de item) passa por escapeHtml.

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

/** Competência (@db.Date do dia 1) por extenso: 'outubro de 2026' */
export function competenceInWords(competence: Date): string {
  return `${MONTHS[competence.getUTCMonth()]} de ${competence.getUTCFullYear()}`
}

/** Número da fatura com seis dígitos: 124 → '000124' */
export function invoiceNumberLabel(n: number): string {
  return String(n).padStart(6, '0')
}

export interface DueReminderInvoice {
  number: number
  competence: Date // @db.Date
  dueDate: Date // @db.Date
  total: string // '2139.80'
  items: Array<{ description: string; amount: string }>
}

export function dueReminderEmail(
  companyName: string,
  invoice: DueReminderInvoice
): { subject: string; html: string } {
  const due = formatBillingDate(invoice.dueDate)
  const rows = invoice.items
    .map((i) => `<li>${escapeHtml(i.description)}: ${escapeHtml(formatBrl(i.amount))}</li>`)
    .join('\n')
  const link = webUrl('/plano')
  return {
    subject: `Fatura do Addere vence em ${due}`,
    html: [
      `<p>Olá. Este é um lembrete da fatura do Addere de ${escapeHtml(companyName)}.</p>`,
      `<p>Fatura ${invoiceNumberLabel(invoice.number)}, referente a ${competenceInWords(invoice.competence)}, no valor de ${escapeHtml(formatBrl(invoice.total))}, com vencimento em ${due}.</p>`,
      `<ul>\n${rows}\n</ul>`,
      '<p>As faturas ficam no painel do Addere, em Plano e cobrança. Se o pagamento já foi feito, desconsidere este lembrete.</p>',
      `<p><a href="${escapeHtml(link)}">Ver as faturas no painel</a></p>`,
      '<p>Addere</p>',
    ].join('\n'),
  }
}

export function documentPendingReminderEmail(
  doc: { id: string; kind: ContractDocumentKind },
  recipientName: string
): { subject: string; html: string } {
  const label = CONTRACT_DOCUMENT_KIND_LABELS[doc.kind]
  // O mesmo link do e-mail de envio do 014 (contract-email.ts)
  const link = webUrl(`/contrato/${doc.id}`)
  return {
    subject: `Lembrete: ${label} do Addere aguardando seu aceite`,
    html: [
      `<p>Olá, ${escapeHtml(recipientName)}.</p>`,
      `<p>O ${escapeHtml(label)} da sua empresa continua aguardando o seu aceite no painel do Addere. Você é o administrador indicado pela sua empresa para esse aceite.</p>`,
      `<p><a href="${escapeHtml(link)}">Ler e aceitar o ${escapeHtml(label)}</a></p>`,
      '<p>Addere</p>',
    ].join('\n'),
  }
}

// ─── Modelos da inadimplência (plano 017) ───────────────────────────────────
// Datas de dia civil (@db.Date) pelo formatBillingDate; competência MM/AAAA.

export interface OverdueInvoiceForEmail {
  number: number
  competence: Date // @db.Date
  dueDate: Date // @db.Date
  total: string // '1990.00'
}

function overdueInvoiceSentence(invoice: OverdueInvoiceForEmail): string {
  return `fatura nº ${invoiceNumberLabel(invoice.number)}, da competência ${formatCompetence(invoice.competence)}, no valor de ${escapeHtml(formatBrl(invoice.total))}, venceu em ${formatBillingDate(invoice.dueDate)} e ainda não tem pagamento registrado`
}

function planLink(): string {
  const link = webUrl('/plano')
  return `<p>Ver Plano e cobrança: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`
}

/** Aviso de suspensão: a data prevista é a do aviso e não muda depois. */
export function buildSuspensionNoticeEmail(
  companyName: string,
  invoice: OverdueInvoiceForEmail,
  plannedBlockDate: Date // @db.Date
): { subject: string; html: string } {
  const planned = formatBillingDate(plannedBlockDate)
  return {
    subject: `Aviso de suspensão do Addere — fatura nº ${invoiceNumberLabel(invoice.number)}`,
    html: [
      `<p>A ${overdueInvoiceSentence(invoice)}.</p>`,
      `<p>Se ela não for paga, o acesso da ${escapeHtml(companyName)} ao app e ao painel do Addere será suspenso em <strong>${planned}</strong>.</p>`,
      '<p>A suspensão não apaga nenhum dado. O administrador continua vendo o Contrato e o Plano e cobrança, e o acesso volta assim que a Addere registrar o pagamento. Se o pagamento já foi feito, responda este e-mail com o comprovante.</p>',
      planLink(),
      '<p>Addere</p>',
    ].join('\n'),
  }
}

/** Lembrete de 1 a 3 dias antes da data prevista (não é condição de bloqueio). */
export function buildSuspensionReminderEmail(
  companyName: string,
  invoice: OverdueInvoiceForEmail,
  plannedBlockDate: Date // @db.Date
): { subject: string; html: string } {
  const planned = formatBillingDate(plannedBlockDate)
  return {
    subject: `Lembrete: o acesso ao Addere será suspenso em ${planned}`,
    html: [
      `<p>Lembrete: a ${overdueInvoiceSentence(invoice)}.</p>`,
      `<p>Se ela não for paga, o acesso da ${escapeHtml(companyName)} ao app e ao painel do Addere será suspenso em <strong>${planned}</strong>. A suspensão não apaga nenhum dado, e o acesso volta assim que a Addere registrar o pagamento. Se o pagamento já foi feito, responda este e-mail com o comprovante.</p>`,
      planLink(),
      '<p>Addere</p>',
    ].join('\n'),
  }
}

/** "Liberar até…" com data: o cliente fica sabendo até quando e o que acontece depois. */
export function buildAccessReleasedEmail(
  companyName: string,
  until: Date, // @db.Date
  overdueInvoice: { number: number } | null
): { subject: string; html: string } {
  const untilLabel = formatBillingDate(until)
  const nextDay = new Date(until.getTime() + 86_400_000)
  return {
    subject: `Acesso ao Addere liberado até ${untilLabel}`,
    html: [
      `<p>O acesso da ${escapeHtml(companyName)} ao Addere está liberado até ${untilLabel}.</p>`,
      ...(overdueInvoice
        ? [
            `<p>Se a fatura nº ${invoiceNumberLabel(overdueInvoice.number)} não for paga até lá, o acesso volta a ser suspenso em ${formatBillingDate(nextDay)}.</p>`,
          ]
        : []),
      planLink(),
      '<p>Addere</p>',
    ].join('\n'),
  }
}
