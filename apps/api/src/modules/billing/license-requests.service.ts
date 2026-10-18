import { createHash } from 'node:crypto'
import { prisma } from '@addere/db'
import { Prisma } from '@prisma/client'
import {
  licenseRequestDeclaration,
  resolveCurrentTerms,
  type LicenseRequestDto,
} from '@addere/types'
import { AppError, conflict, notFound } from '../../lib/errors'
import { captureError } from '../../lib/sentry'
import { recordBillingEvent } from './billing-events'
import { lockContractRow } from './contract-lock'
import { assertDesignatedAdmin } from './designated-admin'
import { assertMonthlyTotalFits } from './invoice-rules'
import { syncIntelligenceWithTerms } from './jobs/apply-due-terms'
import { sendLicenseRequestEmail } from './license-request-email'
import type {
  CreateLicenseRequestInput,
  DecideLicenseRequestInput,
  ListLicenseRequestsQuery,
} from './license-requests.schema'

// Pedido de licenças adicionais (plano 015). Só o administrador indicado pede
// (decisão padrão 10): o pedido mostra o preço e vale como contratação, sem
// aditivo. O superadmin aprova (vira termos EFFECTIVE na hora, origin
// LICENSE_REQUEST) ou recusa com motivo. O limite sobe na hora; a cobrança, na
// competência seguinte (o 016 cobra pelos termos vigentes no início do mês).
//
// Criar e decidir começam pela trava da linha do contrato (lockContractRow,
// contract-lock.ts), a mesma da trava de licenças e do aceite: serializa dois
// pedidos ao mesmo tempo, a troca do indicado, um aditivo em andamento e duas
// decisões do mesmo pedido.

const USER_AGENT_MAX = 512
const MY_REQUESTS_TAKE = 20
const ADMIN_REQUESTS_TAKE = 200

type Db = Prisma.TransactionClient

const VALUE_TERMS_SELECT = {
  id: true,
  status: true,
  effectiveFrom: true,
  version: true,
  packageId: true,
  licenseType: true,
  includedSeats: true,
  extraSeats: true,
  packagePrice: true,
  extraSeatPrice: true,
} satisfies Prisma.ContractTermsSelect

// ─── DTO ─────────────────────────────────────────────────────────────────────

export const LICENSE_REQUEST_INCLUDE = {
  company: { select: { name: true } },
  decidedBy: { select: { name: true } },
} satisfies Prisma.LicenseRequestInclude

type LicenseRequestRow = Prisma.LicenseRequestGetPayload<{
  include: typeof LICENSE_REQUEST_INCLUDE
}>

/** `audit` põe IP e hash da declaração: só nas rotas do superadmin */
export function toLicenseRequestDto(row: LicenseRequestRow, audit: boolean): LicenseRequestDto {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.company.name,
    quantity: row.quantity,
    message: row.message,
    unitPriceShown: row.unitPriceShown.toFixed(2),
    monthlyIncrease: row.unitPriceShown.mul(row.quantity).toFixed(2),
    declarationText: row.declarationText,
    status: row.status,
    requestedAt: row.createdAt.toISOString(),
    requestedByName: row.requestedByName,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decidedByName: row.decidedBy?.name ?? null,
    decisionReason: row.decisionReason,
    resultingTermsId: row.resultingTermsId,
    ...(audit ? { requestedIp: row.requestedIp, declarationSha256: row.declarationSha256 } : {}),
  }
}

// ─── Criar (administrador indicado) ──────────────────────────────────────────

export interface LicenseRequestMeta {
  ip: string
  userAgent: string | undefined
}

export async function createLicenseRequest(
  requester: { userId: string; companyId: string },
  body: CreateLicenseRequestInput,
  meta: LicenseRequestMeta,
  now: Date
): Promise<LicenseRequestDto> {
  const { companyId } = requester

  const created = await prisma.$transaction(async (tx) => {
    // 1. Trava: dois pedidos da mesma empresa (ou a troca do indicado) esperam
    await lockContractRow(tx, companyId)

    // 2. Só com contrato ACTIVE há limite para ampliar
    const contract = await tx.companyContract.findUnique({
      where: { companyId },
      select: { id: true, companyId: true, status: true, designatedAdminId: true },
    })
    if (!contract || contract.status !== 'ACTIVE') {
      throw conflict(
        'Sua empresa ainda não tem contrato ativo: não há limite de licenças para ampliar.',
        'CONTRACT_NOT_ACTIVE'
      )
    }

    // 3. Só o administrador indicado, relido no banco — antes do preço e do
    // pedido pendente, para quem não pode pedir não receber mensagem sobre eles
    const designee = await assertDesignatedAdmin(tx, contract, requester.userId)

    // 4. O preço mostrado tem de ser o atual
    const effective = await tx.contractTerms.findMany({
      where: { contractId: contract.id, status: 'EFFECTIVE' },
      select: VALUE_TERMS_SELECT,
    })
    const current = resolveCurrentTerms(effective, now)
    if (!current) throw new Error(`Contrato ${contract.id} ACTIVE sem termos vigentes`)
    if (!new Prisma.Decimal(body.unitPriceShown).equals(current.extraSeatPrice)) {
      throw new AppError(
        409,
        'O valor por licença mudou. Confira o novo valor antes de enviar.',
        { unitPrice: current.extraSeatPrice.toFixed(2) },
        'LICENSE_PRICE_CHANGED'
      )
    }

    // 5. Um pedido pendente por empresa (decisão de desenho 2)
    const pending = await tx.licenseRequest.findFirst({
      where: { companyId, status: 'PENDING' },
      select: { id: true },
    })
    if (pending) {
      throw conflict('Você já tem um pedido de licenças em análise.', 'LICENSE_REQUEST_PENDING')
    }

    // 6. A frase é a do painel: mesma função, mesmas entradas
    const unitPrice = current.extraSeatPrice.toFixed(2)
    const declarationText = licenseRequestDeclaration(body.quantity, unitPrice)
    const declarationSha256 = createHash('sha256').update(declarationText, 'utf8').digest('hex')

    // 7. O pedido, com nome e e-mail lidos do banco, e o histórico
    const row = await tx.licenseRequest.create({
      data: {
        companyId,
        quantity: body.quantity,
        message: body.message ? body.message : null,
        unitPriceShown: unitPrice,
        declarationText,
        declarationSha256,
        requestedById: designee.id,
        requestedByName: designee.name,
        requestedByEmail: designee.email,
        requestedIp: meta.ip,
        requestedUserAgent: meta.userAgent ? meta.userAgent.slice(0, USER_AGENT_MAX) : null,
      },
      include: LICENSE_REQUEST_INCLUDE,
    })
    await recordBillingEvent(tx, {
      type: 'LICENSE_REQUEST_CREATED',
      companyId,
      actorId: designee.id,
      fields: [],
      ref: { licenseRequestId: row.id },
    })
    return row
  })

  // 8. Depois do commit: o aviso à Addere. Falha de e-mail não desfaz o pedido,
  // que aparece em Gestão Addere › Solicitações de qualquer forma
  await notifyAddere(created)

  return toLicenseRequestDto(created, false)
}

async function notifyAddere(row: LicenseRequestRow): Promise<void> {
  try {
    const settings = await prisma.billingSettings.findUnique({
      where: { id: 'global' },
      select: { notifyEmail: true },
    })
    const to = settings?.notifyEmail?.trim()
    if (!to) {
      console.warn('[billing] notifyEmail vazio — aviso de pedido de licenças não enviado')
      return
    }
    const dto = toLicenseRequestDto(row, false)
    await sendLicenseRequestEmail(to, {
      companyName: dto.companyName,
      requestedByName: row.requestedByName,
      requestedByEmail: row.requestedByEmail,
      quantity: dto.quantity,
      unitPrice: dto.unitPriceShown,
      monthlyIncrease: dto.monthlyIncrease,
      declarationText: dto.declarationText,
      message: dto.message,
    })
  } catch (err) {
    captureError(err, { module: 'billing', op: 'license-request-email' })
  }
}

// ─── Listar ──────────────────────────────────────────────────────────────────

/** Os 20 mais recentes da empresa, para o /plano do ADMIN (sem IP nem hash) */
export async function listMyLicenseRequests(companyId: string): Promise<LicenseRequestDto[]> {
  const rows = await prisma.licenseRequest.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: MY_REQUESTS_TAKE,
    include: LICENSE_REQUEST_INCLUDE,
  })
  return rows.map((r) => toLicenseRequestDto(r, false))
}

/** Gestão Addere › Solicitações e a aba Licenças da ficha, do mais novo ao mais antigo */
export async function listLicenseRequests(
  query: ListLicenseRequestsQuery
): Promise<LicenseRequestDto[]> {
  const rows = await prisma.licenseRequest.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: ADMIN_REQUESTS_TAKE,
    include: LICENSE_REQUEST_INCLUDE,
  })
  return rows.map((r) => toLicenseRequestDto(r, true))
}

// ─── Decidir (superadmin) ────────────────────────────────────────────────────

const ALREADY_DECIDED = 'Este pedido já foi decidido.'

export async function decideLicenseRequest(
  id: string,
  body: DecideLicenseRequestInput,
  actorId: string,
  now: Date
): Promise<LicenseRequestDto> {
  const decided = await prisma.$transaction(async (tx) => {
    // 1. O pedido existe? (a empresa dele diz qual linha travar)
    const head = await tx.licenseRequest.findUnique({ where: { id }, select: { companyId: true } })
    if (!head) throw notFound('Pedido não encontrado')
    const { companyId } = head

    // 2. Trava da empresa: serializa com a trava de licenças e com outra decisão
    await lockContractRow(tx, companyId)

    // Relido depois da trava: uma decisão que acabou de terminar já aparece
    const request = await tx.licenseRequest.findUnique({
      where: { id },
      select: { status: true, quantity: true, unitPriceShown: true },
    })
    if (!request || request.status !== 'PENDING') {
      throw conflict(ALREADY_DECIDED, 'LICENSE_REQUEST_ALREADY_DECIDED')
    }

    // 3. Recusa: só o motivo
    if (body.decision === 'REJECT') {
      const { count } = await tx.licenseRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          decidedAt: now,
          decidedById: actorId,
          decisionReason: body.reason,
        },
      })
      if (count === 0) throw conflict(ALREADY_DECIDED, 'LICENSE_REQUEST_ALREADY_DECIDED')
      await recordBillingEvent(tx, {
        type: 'LICENSE_REQUEST_REJECTED',
        companyId,
        actorId,
        fields: [],
        ref: { licenseRequestId: id },
      })
    } else {
      await approve(tx, { id, companyId, ...request }, actorId, now)
    }

    const row = await tx.licenseRequest.findUnique({
      where: { id },
      include: LICENSE_REQUEST_INCLUDE,
    })
    if (!row) throw notFound('Pedido não encontrado')
    return row
  })
  return toLicenseRequestDto(decided, true)
}

/** 4. Aprovação: termos novos EFFECTIVE agora, com as licenças somadas */
async function approve(
  tx: Db,
  request: { id: string; companyId: string; quantity: number; unitPriceShown: Prisma.Decimal },
  actorId: string,
  now: Date
): Promise<void> {
  const contract = await tx.companyContract.findUnique({
    where: { companyId: request.companyId },
    select: {
      id: true,
      status: true,
      terms: {
        where: { status: { in: ['EFFECTIVE', 'PROPOSED'] } },
        select: VALUE_TERMS_SELECT,
      },
    },
  })
  if (!contract || contract.status !== 'ACTIVE') {
    throw conflict(
      'O contrato desta empresa não está ativo: o pedido não pode ser aprovado.',
      'CONTRACT_NOT_ACTIVE'
    )
  }

  // Aditivo em rascunho ou enviado: foi montado sobre os termos antigos e, ao
  // ser aceito, apagaria as licenças aprovadas (decisão de desenho 3)
  if (contract.terms.some((t) => t.status === 'PROPOSED')) {
    throw conflict(
      'Há um aditivo em andamento. Aprove depois do aceite do aditivo, ou cancele o aditivo antes.',
      'AMENDMENT_PENDING'
    )
  }
  // Aditivo aceito que ainda não passou a valer: pelo mesmo motivo, quando a
  // data dele chegasse, as licenças aprovadas sumiriam
  const effective = contract.terms.filter((t) => t.status === 'EFFECTIVE')
  if (effective.some((t) => t.effectiveFrom && t.effectiveFrom > now)) {
    throw conflict(
      'Há um aditivo aceito que ainda não passou a valer. Aprove depois da data dele.',
      'AMENDMENT_NOT_YET_EFFECTIVE'
    )
  }

  const current = resolveCurrentTerms(effective, now)
  if (!current) throw new Error(`Contrato ${contract.id} ACTIVE sem termos vigentes`)
  // O cliente aceitou um preço; se os termos mudaram desde então, não vale
  if (!request.unitPriceShown.equals(current.extraSeatPrice)) {
    throw new AppError(
      409,
      'O valor por licença mudou depois do pedido: o cliente aceitou outro preço.',
      { unitPrice: current.extraSeatPrice.toFixed(2) },
      'LICENSE_PRICE_CHANGED'
    )
  }

  // O total mensal com as licenças somadas tem de caber no Decimal(14,2)
  assertMonthlyTotalFits({
    packagePrice: current.packagePrice,
    extraSeats: current.extraSeats + request.quantity,
    extraSeatPrice: current.extraSeatPrice,
  })

  // Próxima versão: da linha mais alta, em qualquer status (como o 013 e o 014)
  const last = await tx.contractTerms.findFirst({
    where: { contractId: contract.id },
    orderBy: { version: 'desc' },
    select: { version: true },
  })
  const terms = await tx.contractTerms.create({
    data: {
      contractId: contract.id,
      version: (last?.version ?? 0) + 1,
      status: 'EFFECTIVE',
      origin: 'LICENSE_REQUEST',
      proposedEffectiveFrom: null,
      effectiveFrom: now,
      packageId: current.packageId,
      licenseType: current.licenseType,
      includedSeats: current.includedSeats,
      extraSeats: current.extraSeats + request.quantity,
      packagePrice: current.packagePrice,
      extraSeatPrice: current.extraSeatPrice,
      reason: `Pedido de licenças ${request.id}`,
      createdById: actorId,
    },
    select: { id: true, version: true },
  })

  const { count } = await tx.licenseRequest.updateMany({
    where: { id: request.id, status: 'PENDING' },
    data: { status: 'APPROVED', decidedAt: now, decidedById: actorId, resultingTermsId: terms.id },
  })
  // Desfaz os termos junto (a transação inteira volta)
  if (count === 0) throw conflict(ALREADY_DECIDED, 'LICENSE_REQUEST_ALREADY_DECIDED')

  // intelligenceEnabled pela derivação do 014, na mesma transação dos termos
  await syncIntelligenceWithTerms(tx, request.companyId, now)

  await recordBillingEvent(tx, {
    type: 'LICENSE_REQUEST_APPROVED',
    companyId: request.companyId,
    actorId,
    fields: ['extraSeats'],
    ref: { licenseRequestId: request.id, termsId: terms.id, termsVersion: terms.version },
  })
}
