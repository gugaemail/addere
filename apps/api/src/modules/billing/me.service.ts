import { prisma } from '@addere/db'
import type { Prisma } from '@prisma/client'
import {
  computeBillingCalendar,
  civilDaySaoPaulo,
  contractMonthlyTotal,
  resolveCurrentTerms,
  type ContractDocumentDto,
  type MyBillingDto,
  type MyDocumentsDto,
  type MyTermsDto,
  type PendingDocumentRef,
} from '@addere/types'
import { conflict, notFound, unprocessable } from '../../lib/errors'
import { captureError } from '../../lib/sentry'
import { recordBillingEvent } from './billing-events'
import { DOCUMENT_INCLUDE, toDocumentDto, toDocumentSummary } from './contract-documents.service'
import { sendDocumentAcceptedEmail } from './contract-email'
import { lockContractRow } from './contract-lock'
import {
  DESIGNATED_ADMIN_SELECT,
  assertDesignatedAdmin,
  designatedAdminRef,
} from './designated-admin'
import { syncIntelligenceWithTerms } from './jobs/apply-due-terms'
import { buildSeatUsage } from './seats.service'
import { listMyLicenseRequests } from './license-requests.service'

// O contrato visto pelo ADMIN da empresa (plano 014), em /billing/me. Todo
// ADMIN da empresa lê; só o administrador indicado aceita. LGPD: o ADMIN lê os
// registros de aceite só da própria empresa.

const USER_AGENT_MAX = 512

// ─── Documento pendente (faixa do painel e /auth/me) ────────────────────────

export const PENDING_DOCUMENT_SELECT = {
  id: true,
  kind: true,
  sentAt: true,
  contract: { select: { companyId: true, designatedAdmin: { select: DESIGNATED_ADMIN_SELECT } } },
} satisfies Prisma.ContractDocumentSelect

type PendingRow = Prisma.ContractDocumentGetPayload<{ select: typeof PENDING_DOCUMENT_SELECT }>

export function toPendingDocumentRef(row: PendingRow | null): PendingDocumentRef | null {
  if (!row) return null
  return {
    id: row.id,
    kind: row.kind,
    sentAt: row.sentAt.toISOString(),
    designatedAdmin: designatedAdminRef(row.contract),
  }
}

export async function findPendingDocument(companyId: string): Promise<PendingDocumentRef | null> {
  const row = await prisma.contractDocument.findFirst({
    where: { companyId, status: 'SENT' },
    orderBy: { sentAt: 'desc' },
    select: PENDING_DOCUMENT_SELECT,
  })
  return toPendingDocumentRef(row)
}

// ─── GET /billing/me ─────────────────────────────────────────────────────────

const MY_TERMS_SELECT = {
  status: true,
  version: true,
  effectiveFrom: true,
  licenseType: true,
  includedSeats: true,
  extraSeats: true,
  packagePrice: true,
  extraSeatPrice: true,
  package: { select: { code: true, name: true } },
} satisfies Prisma.ContractTermsSelect

type MyTermsRow = Prisma.ContractTermsGetPayload<{ select: typeof MY_TERMS_SELECT }>

function toMyTerms(t: MyTermsRow | null): MyTermsDto | null {
  if (!t || !t.effectiveFrom) return null
  const packagePrice = t.packagePrice.toFixed(2)
  const extraSeatPrice = t.extraSeatPrice.toFixed(2)
  return {
    packageCode: t.package.code,
    packageName: t.package.name,
    licenseType: t.licenseType,
    includedSeats: t.includedSeats,
    extraSeats: t.extraSeats,
    packagePrice,
    extraSeatPrice,
    monthlyTotal: contractMonthlyTotal({ packagePrice, extraSeats: t.extraSeats, extraSeatPrice }),
    effectiveFrom: t.effectiveFrom.toISOString(),
  }
}

export async function getMyBilling(companyId: string, now: Date): Promise<MyBillingDto> {
  const contract = await prisma.companyContract.findUnique({
    where: { companyId },
    select: {
      companyId: true,
      status: true,
      startDate: true,
      graceMonths: true,
      firstBilledCompetence: true,
      dueDay: true,
      designatedAdmin: { select: DESIGNATED_ADMIN_SELECT },
      terms: { where: { status: 'EFFECTIVE' }, select: MY_TERMS_SELECT },
    },
  })
  // O rascunho é só da Addere: o cliente não vê contrato em DRAFT
  if (!contract || contract.status === 'DRAFT') {
    return {
      contract: null,
      currentTerms: null,
      scheduledTerms: null,
      pendingDocument: null,
      designatedAdmin: null,
    }
  }

  const current = resolveCurrentTerms(contract.terms, now)
  // Aceito, com "vale a partir de" no futuro: o mais próximo
  const scheduled =
    contract.terms
      .filter((t) => t.effectiveFrom && t.effectiveFrom > now)
      .sort((a, b) => (a.effectiveFrom?.getTime() ?? 0) - (b.effectiveFrom?.getTime() ?? 0))[0] ??
    null

  return {
    contract: {
      status: contract.status,
      startDate: contract.startDate?.toISOString() ?? null,
      graceMonths: contract.graceMonths,
      firstBilledCompetence: contract.firstBilledCompetence?.toISOString() ?? null,
      dueDay: contract.dueDay,
    },
    currentTerms: toMyTerms(current),
    scheduledTerms: toMyTerms(scheduled),
    pendingDocument: await findPendingDocument(companyId),
    designatedAdmin: designatedAdminRef(contract),
    // Plano 015: licenças em uso, o limite (só com contrato ACTIVE) e os
    // pedidos de licenças da empresa
    seats: await buildSeatUsage(
      companyId,
      contract.status,
      contract.status === 'ACTIVE' ? current : null
    ),
    licenseRequests: await listMyLicenseRequests(companyId),
  }
}

// ─── Documentos ──────────────────────────────────────────────────────────────

export async function listMyDocuments(companyId: string): Promise<MyDocumentsDto> {
  const [pending, accepted] = await Promise.all([
    prisma.contractDocument.findFirst({
      where: { companyId, status: 'SENT' },
      orderBy: { sentAt: 'desc' },
      include: DOCUMENT_INCLUDE,
    }),
    prisma.contractDocument.findMany({
      where: { companyId, status: 'ACCEPTED' },
      orderBy: { acceptedAt: 'desc' },
      include: DOCUMENT_INCLUDE,
    }),
  ])
  return {
    pending: pending ? toDocumentDto(pending) : null,
    accepted: accepted.map((d) => toDocumentSummary(d)),
  }
}

/** Em qualquer status: o link de um documento cancelado mostra que ele foi substituído */
export async function getMyDocument(companyId: string, id: string): Promise<ContractDocumentDto> {
  const doc = await prisma.contractDocument.findFirst({
    where: { id, companyId },
    include: DOCUMENT_INCLUDE,
  })
  if (!doc) throw notFound('Documento não encontrado')
  return toDocumentDto(doc)
}

// ─── Aceite ──────────────────────────────────────────────────────────────────

export interface AcceptRequest {
  userId: string
  companyId: string
  sha256: string
  ip: string
  userAgent: string | undefined
}

const NOT_PENDING_MESSAGE = 'Este documento já foi aceito ou cancelado.'

/**
 * Aceite pelo administrador indicado, numa transação só. Começa pela trava da
 * linha do contrato (contract-lock.ts), a mesma da edição do rascunho e do
 * aditivo: o que for lido depois dela é o estado confirmado, e uma edição que
 * chegou antes já deixou o documento CANCELLED (409). O updateMany filtra
 * SENT: com dois aceites ao mesmo tempo (o indicado em duas abas), o segundo
 * recebe 409, e um documento cancelado no meio do caminho (troca de indicado)
 * não é aceito.
 */
export async function acceptDocument(
  documentId: string,
  req: AcceptRequest,
  now: Date
): Promise<ContractDocumentDto> {
  const { accepted, designee } = await prisma.$transaction(async (tx) => {
    // 0. Trava da empresa de quem chama, antes de ler o documento. Sem
    // contrato não há documento
    if (!(await lockContractRow(tx, req.companyId))) {
      throw notFound('Documento não encontrado')
    }

    // 1. Só da empresa de quem chama
    const doc = await tx.contractDocument.findFirst({
      where: { id: documentId, companyId: req.companyId },
      select: {
        id: true,
        kind: true,
        status: true,
        sha256: true,
        contractId: true,
        termsId: true,
      },
    })
    if (!doc) throw notFound('Documento não encontrado')

    // 2. Ainda pendente
    if (doc.status !== 'SENT') throw conflict(NOT_PENDING_MESSAGE, 'DOCUMENT_NOT_PENDING')

    // 3. Só o indicado, relido no banco — antes do hash, para quem não pode
    // aceitar não receber mensagem sobre o texto
    const contract = await tx.companyContract.findUnique({
      where: { id: doc.contractId },
      select: {
        id: true,
        companyId: true,
        designatedAdminId: true,
        graceMonths: true,
        dueDay: true,
      },
    })
    if (!contract) throw notFound('Documento não encontrado')
    const designee = await assertDesignatedAdmin(tx, contract, req.userId)

    // 4. O texto exibido é o gravado: o navegador calculou o hash sobre ele
    if (req.sha256.toLowerCase() !== doc.sha256) {
      throw unprocessable(
        'O texto exibido não confere com o documento enviado. Recarregue a página.',
        undefined,
        'DOCUMENT_HASH_MISMATCH'
      )
    }

    // 5. O aceite, congelando nome e e-mail lidos do banco
    const { count } = await tx.contractDocument.updateMany({
      where: { id: doc.id, status: 'SENT' },
      data: {
        status: 'ACCEPTED',
        acceptedAt: now,
        acceptedById: designee.id,
        acceptedByName: designee.name,
        acceptedByEmail: designee.email,
        acceptedIp: req.ip,
        acceptedUserAgent: req.userAgent ? req.userAgent.slice(0, USER_AGENT_MAX) : null,
      },
    })
    if (count === 0) throw conflict(NOT_PENDING_MESSAGE, 'DOCUMENT_NOT_PENDING')

    // 6. Os termos passam a valer: no maior entre o aceite e o "vale a partir
    // de" (já gravado às 00:01 de São Paulo); num CONTRACT, no aceite
    const terms = await tx.contractTerms.findUnique({
      where: { id: doc.termsId },
      select: { version: true, proposedEffectiveFrom: true },
    })
    if (!terms) throw conflict(NOT_PENDING_MESSAGE, 'DOCUMENT_NOT_PENDING')
    const proposed = doc.kind === 'AMENDMENT' ? terms.proposedEffectiveFrom : null
    const effectiveFrom = proposed && proposed > now ? proposed : now
    const termsUpdate = await tx.contractTerms.updateMany({
      where: { id: doc.termsId, status: 'PROPOSED' },
      data: { status: 'EFFECTIVE', effectiveFrom },
    })
    if (termsUpdate.count === 0) throw conflict(NOT_PENDING_MESSAGE, 'DOCUMENT_NOT_PENDING')

    // 7. Contrato: começa no dia do aceite em São Paulo
    if (doc.kind === 'CONTRACT') {
      const { firstBilledCompetence } = computeBillingCalendar({
        acceptDate: now,
        graceMonths: contract.graceMonths,
        dueDay: contract.dueDay,
      })
      const contractUpdate = await tx.companyContract.updateMany({
        where: { id: contract.id, status: 'PENDING_ACCEPTANCE' },
        data: { status: 'ACTIVE', startDate: civilDaySaoPaulo(now), firstBilledCompetence },
      })
      if (contractUpdate.count === 0) throw conflict(NOT_PENDING_MESSAGE, 'DOCUMENT_NOT_PENDING')
    }

    // 8. A Inteligência segue o tipo de licença vigente
    await syncIntelligenceWithTerms(tx, req.companyId, now)

    // 9. Histórico: ids, nunca IP, e-mail ou texto
    await recordBillingEvent(tx, {
      type: 'DOCUMENT_ACCEPTED',
      companyId: req.companyId,
      actorId: designee.id,
      fields: [],
      ref: { documentId: doc.id, documentKind: doc.kind, termsVersion: terms.version },
    })

    const accepted = await tx.contractDocument.findUnique({
      where: { id: doc.id },
      include: DOCUMENT_INCLUDE,
    })
    if (!accepted) throw notFound('Documento não encontrado')
    return { accepted, designee }
  })

  // Depois do commit: confirmação aos ADMINs ativos, ao contato de cobrança e à
  // Addere, sem repetir endereço. Falha de e-mail não desfaz o aceite.
  try {
    const [admins, profile, settings] = await Promise.all([
      prisma.user.findMany({
        where: { companyId: req.companyId, role: 'ADMIN', active: true },
        select: { email: true },
      }),
      prisma.clientProfile.findUnique({
        where: { companyId: req.companyId },
        select: { billingEmail: true },
      }),
      prisma.billingSettings.findUnique({ where: { id: 'global' }, select: { notifyEmail: true } }),
    ])
    const recipients = [...admins.map((a) => a.email), profile?.billingEmail, settings?.notifyEmail]
      .map((e) => e?.trim().toLowerCase())
      .filter((e): e is string => !!e)
    await sendDocumentAcceptedEmail(
      {
        id: accepted.id,
        kind: accepted.kind,
        acceptedAt: now,
        acceptedByName: designee.name,
      },
      [...new Set(recipients)]
    )
  } catch (err) {
    // O aceite já está gravado; o e-mail é só aviso
    captureError(err, { module: 'billing', op: 'accepted-email' })
  }

  return toDocumentDto(accepted)
}
