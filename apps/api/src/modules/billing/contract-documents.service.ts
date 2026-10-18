import { createHash } from 'node:crypto'
import { prisma } from '@addere/db'
import type { ContractTemplate, Prisma } from '@prisma/client'
import {
  checkTemplateForPublish,
  effectiveInstantOfDay,
  fillContractTemplate,
  type ClientDocumentsDto,
  type ContractDocumentDto,
  type ContractDocumentKind,
  type ContractDocumentSummaryDto,
  type DocumentPreviewDto,
  type DocumentSendResultDto,
} from '@addere/types'
import { conflict, notFound, unprocessable } from '../../lib/errors'
import {
  assertAmendmentNotice,
  effectiveFromYmd,
  isPriceIncrease,
  requiredNoticeDate,
  todayYmdSaoPaulo,
} from './amendment-rules'
import { changedFields, recordBillingEvent } from './billing-events'
import type { AmendmentData } from './contract-documents.schema'
import { sendDocumentPendingEmail } from './contract-email'
import { lockContractRow } from './contract-lock'
import { assertMonthlyTotalFits } from './invoice-rules'
import {
  buildContractFieldValues,
  latestEffectiveTerms,
  loadContractFieldInput,
} from './contract-fields'
import { userNames } from './contract-templates.service'
import { assertValidDesignee, isValidDesignee, type DesigneeUser } from './designated-admin'

// Documentos enviados para aceite e aditivo (plano 014). renderedBody e sha256
// são gravados só no create e nunca mudam: o texto aceito é o do documento,
// não o modelo atual. Nenhum evento leva texto, e-mail ou IP.

export const CANCEL_REASON_DRAFT_CHANGED = 'Rascunho alterado depois do envio'
export const CANCEL_REASON_DESIGNEE_CHANGED = 'Administrador indicado trocado depois do envio'
export const CANCEL_REASON_AMENDMENT_CHANGED = 'Aditivo alterado depois do envio'
export const CANCEL_REASON_AMENDMENT_WITHDRAWN = 'Aditivo descartado'
export const CANCEL_REASON_MANUAL = 'Envio cancelado pela Addere'

// ─── DTO ─────────────────────────────────────────────────────────────────────

export const DOCUMENT_INCLUDE = {
  template: { select: { version: true } },
  conditionsTemplate: { select: { version: true } },
  terms: { select: { version: true } },
} satisfies Prisma.ContractDocumentInclude

type DocumentRow = Prisma.ContractDocumentGetPayload<{ include: typeof DOCUMENT_INCLUDE }>

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null)

export function toDocumentSummary(
  d: DocumentRow,
  names: Map<string, string> = new Map()
): ContractDocumentSummaryDto {
  return {
    id: d.id,
    kind: d.kind,
    status: d.status,
    companyId: d.companyId,
    templateVersion: d.template.version,
    conditionsVersion: d.conditionsTemplate?.version ?? null,
    termsVersion: d.terms.version,
    sha256: d.sha256,
    sentAt: d.sentAt.toISOString(),
    sentByName: names.get(d.sentById) ?? null,
    lastEmailAt: iso(d.lastEmailAt),
    acceptedAt: iso(d.acceptedAt),
    acceptedByName: d.acceptedByName,
    acceptedByEmail: d.acceptedByEmail,
    acceptedIp: d.acceptedIp,
    acceptedUserAgent: d.acceptedUserAgent,
    cancelledAt: iso(d.cancelledAt),
    cancelReason: d.cancelReason,
  }
}

export function toDocumentDto(d: DocumentRow, names?: Map<string, string>): ContractDocumentDto {
  return { ...toDocumentSummary(d, names), renderedBody: d.renderedBody }
}

export function sha256Of(renderedBody: string): string {
  return createHash('sha256').update(renderedBody, 'utf8').digest('hex')
}

// ─── Cancelamento ────────────────────────────────────────────────────────────

/**
 * Cancela o documento em SENT do contrato, na transação de quem chama. Um
 * CONTRACT cancelado devolve o contrato de PENDING_ACCEPTANCE a DRAFT; num
 * aditivo, o contrato continua ACTIVE e os termos continuam PROPOSED. Sem
 * documento SENT, não faz nada. O 016 chama esta mesma função no encerramento.
 */
export async function cancelSentDocuments(
  tx: Prisma.TransactionClient,
  contractId: string,
  actorId: string | null,
  reason: string
): Promise<number> {
  const sent = await tx.contractDocument.findMany({
    where: { contractId, status: 'SENT' },
    select: { id: true, kind: true, companyId: true },
  })
  if (sent.length === 0) return 0

  const { count } = await tx.contractDocument.updateMany({
    where: { contractId, status: 'SENT' },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelledById: actorId,
      cancelReason: reason,
    },
  })
  if (count === 0) return 0

  if (sent.some((d) => d.kind === 'CONTRACT')) {
    await tx.companyContract.updateMany({
      where: { id: contractId, status: 'PENDING_ACCEPTANCE' },
      data: { status: 'DRAFT' },
    })
  }
  for (const d of sent) {
    await recordBillingEvent(tx, {
      type: 'DOCUMENT_CANCELLED',
      companyId: d.companyId,
      actorId,
      fields: [],
      ref: { documentId: d.id, documentKind: d.kind },
    })
  }
  return count
}

// ─── Linha do tempo da ficha ─────────────────────────────────────────────────

export async function listClientDocuments(companyId: string): Promise<ClientDocumentsDto> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      contract: {
        select: {
          designatedAdmin: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              active: true,
              companyId: true,
            },
          },
          terms: {
            where: { status: 'PROPOSED', origin: 'AMENDMENT' },
            orderBy: { version: 'desc' },
            take: 1,
            select: {
              id: true,
              version: true,
              requestedByClient: true,
              proposedEffectiveFrom: true,
            },
          },
        },
      },
    },
  })
  if (!company) throw notFound('Cliente não encontrado')

  const [documents, latestPublished, activePilot, adminCandidates] = await Promise.all([
    prisma.contractDocument.findMany({
      where: { companyId },
      orderBy: { sentAt: 'desc' },
      include: DOCUMENT_INCLUDE,
    }),
    prisma.contractTemplate.findFirst({
      where: { kind: 'CONTRACT', status: 'PUBLISHED' },
      select: { version: true },
    }),
    prisma.pilot.findFirst({ where: { companyId, status: 'ACTIVE' }, select: { id: true } }),
    prisma.user.findMany({
      where: { companyId, role: 'ADMIN', active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
  ])
  const names = await userNames(
    prisma,
    documents.map((d) => d.sentById)
  )

  // Condições gerais aceitas: as do último documento aceito que carrega condições
  const acceptedWithConditions = documents
    .filter((d) => d.status === 'ACCEPTED' && d.conditionsTemplate)
    .sort((a, b) => (b.acceptedAt?.getTime() ?? 0) - (a.acceptedAt?.getTime() ?? 0))[0]

  const admin = company.contract?.designatedAdmin ?? null
  const amendment = company.contract?.terms[0] ?? null
  return {
    documents: documents.map((d) => toDocumentSummary(d, names)),
    conditions: {
      acceptedVersion: acceptedWithConditions?.conditionsTemplate?.version ?? null,
      latestPublishedVersion: latestPublished?.version ?? null,
    },
    activePilot: !!activePilot,
    designatedAdmin: admin
      ? {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          valid: isValidDesignee(admin, companyId),
        }
      : null,
    adminCandidates,
    amendment: amendment
      ? {
          termsId: amendment.id,
          version: amendment.version,
          requestedByClient: amendment.requestedByClient,
          proposedEffectiveFrom: effectiveFromYmd(amendment.proposedEffectiveFrom),
        }
      : null,
  }
}

// ─── Administrador indicado ──────────────────────────────────────────────────

export async function setDesignatedAdmin(
  companyId: string,
  userId: string,
  actorId: string
): Promise<{ changed: boolean; cancelledDocuments: number }> {
  return prisma.$transaction(async (tx) => {
    // Trava da linha do contrato antes de ler (contract-lock.ts): o aceite em
    // curso termina antes, ou espera a troca e relê o indicado novo
    const hasContract = await lockContractRow(tx, companyId)
    const contract = hasContract
      ? await tx.companyContract.findUnique({
          where: { companyId },
          select: { id: true, status: true, designatedAdminId: true },
        })
      : null
    if (!contract) {
      throw notFound('Salve o rascunho do contrato antes de indicar o administrador.')
    }
    if (contract.status === 'CANCELLED') {
      throw conflict(
        'Contrato cancelado: o administrador indicado não muda mais.',
        'CONTRACT_NOT_ACTIVE'
      )
    }
    await assertValidDesignee(tx, companyId, userId)
    if (contract.designatedAdminId === userId) return { changed: false, cancelledDocuments: 0 }

    await tx.companyContract.update({
      where: { id: contract.id },
      data: { designatedAdminId: userId },
    })
    // O nome do indicado está no texto do contrato e do aditivo (decisão 11)
    const cancelledDocuments = await cancelSentDocuments(
      tx,
      contract.id,
      actorId,
      CANCEL_REASON_DESIGNEE_CHANGED
    )
    await recordBillingEvent(tx, {
      type: 'DESIGNATED_ADMIN_CHANGED',
      companyId,
      actorId,
      fields: ['designatedAdminId'],
    })
    return { changed: true, cancelledDocuments }
  })
}

// ─── Preparo do documento (prévia e envio) ───────────────────────────────────

interface PreparedDocument {
  kind: ContractDocumentKind
  contractId: string
  termsId: string
  termsVersion: number
  template: ContractTemplate
  conditionsTemplateId: string | null
  renderedBody: string
  missing: string[]
  priceIncrease: boolean
  minimumEffectiveFrom: string | null
  designee: DesigneeUser | null
}

/**
 * Passos 1 a 5 do envio. Na prévia (`strict` falso) não recusa por indicado,
 * antecedência nem campo faltando: mostra o que falta.
 */
async function prepareDocument(
  db: Prisma.TransactionClient,
  companyId: string,
  carryConditionsRequested: boolean,
  now: Date,
  strict: boolean
): Promise<PreparedDocument> {
  // 1. Qual documento
  const contract = await db.companyContract.findUnique({
    where: { companyId },
    select: {
      id: true,
      status: true,
      designatedAdminId: true,
      terms: { where: { status: 'PROPOSED' }, select: { origin: true } },
    },
  })
  let kind: ContractDocumentKind | null = null
  if (contract?.status === 'DRAFT' && contract.terms.some((t) => t.origin === 'CONTRACT')) {
    kind = 'CONTRACT'
  } else if (
    contract?.status === 'ACTIVE' &&
    contract.terms.some((t) => t.origin === 'AMENDMENT')
  ) {
    kind = 'AMENDMENT'
  }
  if (!contract || !kind) {
    throw conflict(
      'Nada a enviar: só o contrato em rascunho ou um aditivo proposto vão para aceite',
      'NOTHING_TO_SEND'
    )
  }
  // As condições gerais novas só fazem sentido num aditivo
  const carryConditions = kind === 'AMENDMENT' && carryConditionsRequested

  // 2. Modelo
  const [template, conditionsTemplate] = await Promise.all([
    db.contractTemplate.findFirst({ where: { kind, status: 'PUBLISHED' } }),
    carryConditions
      ? db.contractTemplate.findFirst({ where: { kind: 'CONTRACT', status: 'PUBLISHED' } })
      : Promise.resolve(null),
  ])
  if (!template || (carryConditions && !conditionsTemplate)) {
    throw unprocessable(
      'Publique o modelo em Gestão Addere › Modelos de contrato',
      undefined,
      'TEMPLATE_NOT_PUBLISHED'
    )
  }
  for (const t of [template, conditionsTemplate]) {
    if (t && checkTemplateForPublish(t.kind, t.body).length > 0) {
      throw unprocessable(
        'O modelo publicado tem o que impede publicar',
        { issues: checkTemplateForPublish(t.kind, t.body) },
        'TEMPLATE_NOT_PUBLISHABLE'
      )
    }
  }

  // 3. Administrador indicado (decisão de desenho 10)
  let designee: DesigneeUser | null = null
  if (strict) {
    if (!contract.designatedAdminId) {
      throw unprocessable(
        'Escolha o administrador indicado pela Empresa antes de enviar.',
        undefined,
        'DESIGNATED_ADMIN_REQUIRED'
      )
    }
    designee = await assertValidDesignee(db, companyId, contract.designatedAdminId)
  }

  // 5. Texto (o 4 precisa dos termos que o carregador escolhe)
  const input = await loadContractFieldInput(db, companyId, kind, template, now)
  if (!input?.terms) {
    throw conflict('Nada a enviar: os termos propostos não foram encontrados', 'NOTHING_TO_SEND')
  }
  const filled = fillContractTemplate(template.body, buildContractFieldValues(input))
  let renderedBody = filled.text
  const missing = [...filled.missing]
  if (carryConditions && conditionsTemplate) {
    const annex = fillContractTemplate(
      conditionsTemplate.body,
      buildContractFieldValues({
        ...input,
        kind: 'CONTRACT',
        template: conditionsTemplate,
        previousTerms: null,
        acceptedContractAt: null,
      })
    )
    renderedBody = `${renderedBody}\n\n---\n\n# Anexo: Contrato de Licença de Uso consolidado\n\n${annex.text}`
    for (const key of annex.missing) if (!missing.includes(key)) missing.push(key)
  }

  // 4. Aditivo: aumento de preço e antecedência, com a data de hoje em São Paulo
  let priceIncrease = false
  let minimumEffectiveFrom: string | null = null
  if (kind === 'AMENDMENT') {
    const previous = input.previousTerms
    const proposed = input.terms
    priceIncrease = previous
      ? isPriceIncrease(
          {
            packagePrice: previous.packagePrice.toFixed(2),
            extraSeatPrice: previous.extraSeatPrice.toFixed(2),
          },
          {
            packagePrice: proposed.packagePrice.toFixed(2),
            extraSeatPrice: proposed.extraSeatPrice.toFixed(2),
          },
          carryConditions
        )
      : carryConditions
    const notice = {
      increase: priceIncrease,
      requestedByClient: proposed.requestedByClient,
      carryConditions,
      proposedEffectiveFromYmd: effectiveFromYmd(proposed.proposedEffectiveFrom),
      sentYmd: todayYmdSaoPaulo(now),
      reason: proposed.reason,
    }
    minimumEffectiveFrom = requiredNoticeDate(notice)
    if (strict) assertAmendmentNotice(notice)
  }

  if (strict && missing.length > 0) {
    throw unprocessable(
      'Há campos sem dado no documento: complete o cadastro antes de enviar',
      { missing },
      'CONTRACT_FIELDS_MISSING'
    )
  }

  return {
    kind,
    contractId: contract.id,
    termsId: input.terms.id,
    termsVersion: input.terms.version,
    template,
    // Num CONTRACT, o próprio modelo; num aditivo, só quando leva às condições novas
    conditionsTemplateId:
      kind === 'CONTRACT' ? template.id : carryConditions ? (conditionsTemplate?.id ?? null) : null,
    renderedBody,
    missing,
    priceIncrease,
    minimumEffectiveFrom,
    designee,
  }
}

export async function previewDocument(
  companyId: string,
  carryConditions: boolean,
  now: Date
): Promise<DocumentPreviewDto> {
  const p = await prepareDocument(prisma, companyId, carryConditions, now, false)
  return {
    kind: p.kind,
    templateVersion: p.template.version,
    renderedBody: p.renderedBody,
    missing: p.missing,
    priceIncrease: p.priceIncrease,
    minimumEffectiveFrom: p.minimumEffectiveFrom,
  }
}

// ─── Envio ───────────────────────────────────────────────────────────────────

export async function sendDocument(
  companyId: string,
  carryConditions: boolean,
  actorId: string,
  now: Date
): Promise<DocumentSendResultDto> {
  const { document, designee } = await prisma.$transaction(async (tx) => {
    // Trava a linha do contrato (contract-lock.ts): dois envios da mesma
    // empresa, ou um envio e uma edição do rascunho, não correm juntos
    if (!(await lockContractRow(tx, companyId))) {
      throw conflict(
        'Nada a enviar: só o contrato em rascunho ou um aditivo proposto vão para aceite',
        'NOTHING_TO_SEND'
      )
    }

    const p = await prepareDocument(tx, companyId, carryConditions, now, true)

    const alreadySent = await tx.contractDocument.findFirst({
      where: { contractId: p.contractId, status: 'SENT' },
      select: { id: true },
    })
    if (alreadySent) {
      throw conflict(
        'Já existe um documento enviado e aguardando aceite: cancele o envio antes',
        'DOCUMENT_ALREADY_SENT'
      )
    }

    const created = await tx.contractDocument.create({
      data: {
        kind: p.kind,
        status: 'SENT',
        renderedBody: p.renderedBody,
        sha256: sha256Of(p.renderedBody),
        sentAt: now,
        sentById: actorId,
        companyId,
        contractId: p.contractId,
        termsId: p.termsId,
        templateId: p.template.id,
        conditionsTemplateId: p.conditionsTemplateId,
      },
      include: DOCUMENT_INCLUDE,
    })

    if (p.kind === 'CONTRACT') {
      const { count } = await tx.companyContract.updateMany({
        where: { id: p.contractId, status: 'DRAFT' },
        data: { status: 'PENDING_ACCEPTANCE' },
      })
      if (count === 0) {
        throw conflict('Nada a enviar: o contrato saiu do rascunho', 'NOTHING_TO_SEND')
      }
    }

    await recordBillingEvent(tx, {
      type: 'DOCUMENT_SENT',
      companyId,
      actorId,
      fields: [],
      ref: { documentId: created.id, documentKind: created.kind },
    })
    return { document: created, designee: p.designee }
  })

  // Depois do commit: falha de e-mail não desfaz o envio (o superadmin reenvia)
  let emailSent = false
  let lastEmailAt: Date | null = null
  if (designee) {
    emailSent = await sendDocumentPendingEmail(document, designee)
    if (emailSent) {
      lastEmailAt = new Date()
      await prisma.contractDocument.update({ where: { id: document.id }, data: { lastEmailAt } })
    }
  }
  const names = await userNames(prisma, [actorId])
  return { document: toDocumentSummary({ ...document, lastEmailAt }, names), emailSent }
}

// ─── Documento, reenvio e cancelamento (SUPERADMIN) ──────────────────────────

export async function getDocumentForSuperadmin(id: string): Promise<ContractDocumentDto> {
  const doc = await prisma.contractDocument.findUnique({ where: { id }, include: DOCUMENT_INCLUDE })
  if (!doc) throw notFound('Documento não encontrado')
  return toDocumentDto(doc, await userNames(prisma, [doc.sentById]))
}

export async function resendDocumentEmail(
  id: string,
  actorId: string
): Promise<{ emailSent: boolean }> {
  const doc = await prisma.contractDocument.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      status: true,
      companyId: true,
      contract: { select: { designatedAdminId: true } },
    },
  })
  if (!doc) throw notFound('Documento não encontrado')
  if (doc.status !== 'SENT') {
    throw conflict('Este documento já foi aceito ou cancelado.', 'DOCUMENT_NOT_PENDING')
  }
  if (!doc.contract.designatedAdminId) {
    throw unprocessable(
      'Escolha o administrador indicado pela Empresa antes de enviar.',
      undefined,
      'DESIGNATED_ADMIN_REQUIRED'
    )
  }
  // Indicado que deixou de ser ADMIN ativo: troque o indicado (o que cancela o
  // documento) e envie de novo
  const designee = await assertValidDesignee(prisma, doc.companyId, doc.contract.designatedAdminId)

  const emailSent = await sendDocumentPendingEmail(doc, designee)
  if (emailSent) {
    await prisma.$transaction(async (tx) => {
      // A mesma ordem de travas de tudo que escreve no documento
      await lockContractRow(tx, doc.companyId)
      await tx.contractDocument.update({ where: { id }, data: { lastEmailAt: new Date() } })
      await recordBillingEvent(tx, {
        type: 'DOCUMENT_RESENT',
        companyId: doc.companyId,
        actorId,
        fields: [],
        ref: { documentId: doc.id, documentKind: doc.kind },
      })
    })
  }
  return { emailSent }
}

export async function cancelDocument(
  id: string,
  reason: string | null,
  actorId: string
): Promise<{ cancelled: number }> {
  return prisma.$transaction(async (tx) => {
    // A empresa do documento diz qual linha travar; o status é relido depois
    const head = await tx.contractDocument.findUnique({
      where: { id },
      select: { companyId: true },
    })
    if (!head) throw notFound('Documento não encontrado')
    await lockContractRow(tx, head.companyId)

    const doc = await tx.contractDocument.findUnique({
      where: { id },
      select: { status: true, contractId: true },
    })
    if (!doc) throw notFound('Documento não encontrado')
    if (doc.status !== 'SENT') {
      throw conflict('Este documento já foi aceito ou cancelado.', 'DOCUMENT_NOT_PENDING')
    }
    const cancelled = await cancelSentDocuments(
      tx,
      doc.contractId,
      actorId,
      reason ?? CANCEL_REASON_MANUAL
    )
    return { cancelled }
  })
}

// ─── Aditivo ─────────────────────────────────────────────────────────────────

const AMENDMENT_MONEY_KEYS = ['packagePrice', 'extraSeatPrice'] as const
const AMENDMENT_KEYS = [
  'packageId',
  'licenseType',
  'includedSeats',
  'extraSeats',
  ...AMENDMENT_MONEY_KEYS,
  'proposedEffectiveFrom',
  'reason',
  'requestedByClient',
] as const

const TERMS_NOT_EDITABLE_MESSAGE =
  'O aditivo mudou enquanto você editava: foi aceito, descartado ou substituído. Recarregue a ficha e confira.'

/**
 * Cria ou atualiza o aditivo proposto (um só por vez). Começa pela trava da
 * linha do contrato (contract-lock.ts), a mesma do aceite: um aceite que
 * confirma antes já aparece na releitura, e o UPDATE dos termos leva PROPOSED
 * no where, então termos aceitos nunca são reescritos. Com `termsVersion` no
 * corpo (o painel manda a versão que está editando, ou null para um aditivo
 * novo), a proposta tem de ser a mesma da tela: senão 409 TERMS_NOT_EDITABLE,
 * em vez de criar uma proposta nova sem ninguém perceber.
 */
export async function saveAmendment(
  companyId: string,
  input: AmendmentData,
  actorId: string,
  now: Date
): Promise<{ termsVersion: number; changed: boolean }> {
  return prisma.$transaction(async (tx) => {
    // 1. Trava: a primeira escrita. O que vem depois é o estado confirmado
    await lockContractRow(tx, companyId)

    const contract = await tx.companyContract.findUnique({
      where: { companyId },
      select: {
        id: true,
        status: true,
        terms: {
          select: {
            id: true,
            version: true,
            status: true,
            origin: true,
            effectiveFrom: true,
            packageId: true,
            licenseType: true,
            includedSeats: true,
            extraSeats: true,
            packagePrice: true,
            extraSeatPrice: true,
            proposedEffectiveFrom: true,
            reason: true,
            requestedByClient: true,
          },
        },
      },
    })
    if (!contract || contract.status !== 'ACTIVE') {
      throw conflict(
        'O aditivo vale só para contrato ativo; antes do aceite, mude o rascunho',
        'CONTRACT_NOT_ACTIVE'
      )
    }

    const proposed =
      contract.terms
        .filter((t) => t.status === 'PROPOSED' && t.origin === 'AMENDMENT')
        .sort((a, b) => b.version - a.version)[0] ?? null
    // A proposta da tela tem de ser a do banco, relida depois da trava
    if (input.termsVersion !== undefined && input.termsVersion !== (proposed?.version ?? null)) {
      throw conflict(TERMS_NOT_EDITABLE_MESSAGE, 'TERMS_NOT_EDITABLE')
    }

    if (
      contract.terms.some(
        (t) => t.status === 'EFFECTIVE' && t.effectiveFrom && t.effectiveFrom > now
      )
    ) {
      throw conflict(
        'Há um aditivo aceito que ainda não passou a valer: espere a data dele',
        'AMENDMENT_NOT_YET_EFFECTIVE'
      )
    }

    const pkg = await tx.licensePackage.findUnique({ where: { id: input.packageId } })
    if (!pkg) throw notFound('Pacote não encontrado')
    if (!pkg.active) {
      throw unprocessable('Pacote desativado: escolha outro', undefined, 'PACKAGE_INACTIVE')
    }
    const includedSeats = pkg.seats ?? input.includedSeats
    if (includedSeats === undefined) {
      throw unprocessable(
        'Informe a quantidade de licenças do pacote',
        undefined,
        'INCLUDED_SEATS_REQUIRED'
      )
    }

    // Já confere os 30 dias com a data de hoje, para o formulário avisar cedo
    const previous = latestEffectiveTerms(contract.terms)
    const increase = previous
      ? isPriceIncrease(
          {
            packagePrice: previous.packagePrice.toFixed(2),
            extraSeatPrice: previous.extraSeatPrice.toFixed(2),
          },
          input,
          input.carryConditions
        )
      : input.carryConditions
    assertAmendmentNotice({
      increase,
      requestedByClient: input.requestedByClient,
      carryConditions: input.carryConditions,
      proposedEffectiveFromYmd: input.proposedEffectiveFrom,
      sentYmd: todayYmdSaoPaulo(now),
      reason: input.reason,
    })

    const termsData = {
      packageId: pkg.id,
      licenseType: input.licenseType,
      includedSeats,
      extraSeats: input.extraSeats,
      packagePrice: input.packagePrice,
      extraSeatPrice: input.extraSeatPrice,
      // "Vale a partir de D" = 00:01 de São Paulo do dia D (decisão de desenho 9)
      proposedEffectiveFrom: input.proposedEffectiveFrom
        ? effectiveInstantOfDay(input.proposedEffectiveFrom)
        : null,
      reason: input.reason,
      requestedByClient: input.requestedByClient,
    }
    // O gerador grava esse total na fatura todo mês: tem de caber no Decimal(14,2)
    assertMonthlyTotalFits(termsData)

    let termsVersion: number
    let fields: string[]
    if (proposed) {
      termsVersion = proposed.version
      fields = changedFields(proposed, termsData, AMENDMENT_KEYS, AMENDMENT_MONEY_KEYS)
      if (fields.length === 0) return { termsVersion, changed: false }
      // O texto enviado não é mais o dos termos gravados (decisão 11). Documento
      // antes dos termos, na mesma ordem do aceite
      await cancelSentDocuments(tx, contract.id, actorId, CANCEL_REASON_AMENDMENT_CHANGED)
      // Escrita defensiva: só termos ainda PROPOSED. Com a trava não deveria
      // dar 0; se der, é 409, nunca 200
      const { count } = await tx.contractTerms.updateMany({
        where: { id: proposed.id, status: 'PROPOSED' },
        data: termsData,
      })
      if (count === 0) throw conflict(TERMS_NOT_EDITABLE_MESSAGE, 'TERMS_NOT_EDITABLE')
    } else {
      termsVersion = Math.max(0, ...contract.terms.map((t) => t.version)) + 1
      await tx.contractTerms.create({
        data: {
          contractId: contract.id,
          version: termsVersion,
          status: 'PROPOSED',
          origin: 'AMENDMENT',
          createdById: actorId,
          ...termsData,
        },
      })
      fields = changedFields(null, termsData, AMENDMENT_KEYS, AMENDMENT_MONEY_KEYS)
    }

    await recordBillingEvent(tx, {
      type: 'AMENDMENT_PROPOSED',
      companyId,
      actorId,
      fields,
      ref: { termsVersion, requestedByClient: input.requestedByClient },
    })
    return { termsVersion, changed: true }
  })
}

/** Descarta o aditivo proposto e cancela o documento enviado dele */
export async function withdrawAmendment(
  companyId: string,
  actorId: string
): Promise<{ termsVersion: number }> {
  return prisma.$transaction(async (tx) => {
    // Trava antes de ler: um aceite em curso termina antes, e aí não há o que descartar
    await lockContractRow(tx, companyId)

    const contract = await tx.companyContract.findUnique({
      where: { companyId },
      select: {
        id: true,
        terms: {
          where: { status: 'PROPOSED', origin: 'AMENDMENT' },
          orderBy: { version: 'desc' },
          select: { id: true, version: true },
        },
      },
    })
    const proposed = contract?.terms[0]
    if (!contract || !proposed) throw notFound('Nenhum aditivo proposto para descartar')

    await tx.contractTerms.updateMany({
      where: { contractId: contract.id, status: 'PROPOSED', origin: 'AMENDMENT' },
      data: { status: 'WITHDRAWN' },
    })
    await cancelSentDocuments(tx, contract.id, actorId, CANCEL_REASON_AMENDMENT_WITHDRAWN)
    await recordBillingEvent(tx, {
      type: 'AMENDMENT_WITHDRAWN',
      companyId,
      actorId,
      fields: [],
      ref: { termsVersion: proposed.version },
    })
    return { termsVersion: proposed.version }
  })
}
