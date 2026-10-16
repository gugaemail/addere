import { prisma } from '@addere/db'
import type { ContractTemplate, Prisma } from '@prisma/client'
import {
  checkTemplateForPublish,
  fillContractTemplate,
  normalizeTemplateBody,
  type ContractTemplateDto,
  type ContractTemplateSummaryDto,
  type TemplatePreviewDto,
} from '@addere/types'
import { conflict, notFound, unprocessable } from '../../lib/errors'
import { recordBillingEvent } from './billing-events'
import { buildContractFieldValues, loadContractFieldInput } from './contract-fields'
import type { TemplateCreateData, TemplateUpdateData } from './contract-templates.schema'

// Modelos do contrato e do aditivo (plano 014). Só o SUPERADMIN opera. Editar
// um publicado cria uma versão nova; um só PUBLISHED por tipo (garantido aqui,
// na transação da publicação). Os autores são colunas simples, sem relação com
// User (decisão de desenho 8): os nomes são lidos à parte.

/** Nomes dos usuários pelos ids (autores gravados como coluna simples) */
export async function userNames(
  db: Prisma.TransactionClient,
  ids: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))]
  if (unique.length === 0) return new Map()
  const users = await db.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  })
  return new Map(users.map((u) => [u.id, u.name]))
}

function toSummary(t: ContractTemplate, names: Map<string, string>): ContractTemplateSummaryDto {
  return {
    id: t.id,
    kind: t.kind,
    version: t.version,
    status: t.status,
    changeNote: t.changeNote,
    createdByName: t.createdById ? (names.get(t.createdById) ?? null) : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    publishedAt: t.publishedAt ? t.publishedAt.toISOString() : null,
    publishedByName: t.publishedById ? (names.get(t.publishedById) ?? null) : null,
  }
}

async function toDto(t: ContractTemplate): Promise<ContractTemplateDto> {
  const names = await userNames(prisma, [t.createdById, t.publishedById])
  return { ...toSummary(t, names), body: t.body }
}

export async function listTemplates(): Promise<ContractTemplateSummaryDto[]> {
  const rows = await prisma.contractTemplate.findMany({
    orderBy: [{ kind: 'asc' }, { version: 'desc' }],
  })
  const names = await userNames(
    prisma,
    rows.flatMap((r) => [r.createdById, r.publishedById])
  )
  return rows.map((r) => toSummary(r, names))
}

export async function getTemplate(id: string): Promise<ContractTemplateDto> {
  const row = await prisma.contractTemplate.findUnique({ where: { id } })
  if (!row) throw notFound('Modelo não encontrado')
  return toDto(row)
}

/** Nova versão em DRAFT: maior + 1, com o corpo da origem ou da maior versão do tipo */
export async function createTemplateVersion(
  input: TemplateCreateData,
  actorId: string
): Promise<ContractTemplateDto> {
  const created = await prisma.$transaction(async (tx) => {
    const draft = await tx.contractTemplate.findFirst({
      where: { kind: input.kind, status: 'DRAFT' },
      select: { version: true },
    })
    if (draft) {
      throw conflict(
        `Já existe um rascunho deste modelo (v${draft.version}): edite-o ou publique-o antes`,
        'TEMPLATE_DRAFT_EXISTS'
      )
    }

    const latest = await tx.contractTemplate.findFirst({
      where: { kind: input.kind },
      orderBy: { version: 'desc' },
    })
    let source = latest
    if (input.fromTemplateId) {
      source = await tx.contractTemplate.findUnique({ where: { id: input.fromTemplateId } })
      if (!source || source.kind !== input.kind) throw notFound('Modelo de origem não encontrado')
    }

    // Dois pedidos ao mesmo tempo esbarram no @@unique([kind, version]) → 409
    const row = await tx.contractTemplate.create({
      data: {
        kind: input.kind,
        version: (latest?.version ?? 0) + 1,
        status: 'DRAFT',
        body: source?.body ?? '',
        createdById: actorId,
      },
    })
    await recordBillingEvent(tx, {
      type: 'TEMPLATE_VERSION_CREATED',
      companyId: null,
      actorId,
      fields: [],
      ref: { templateKind: row.kind, templateVersion: row.version },
    })
    return row
  })
  return toDto(created)
}

export async function updateTemplate(
  id: string,
  input: TemplateUpdateData
): Promise<ContractTemplateDto> {
  const row = await prisma.contractTemplate.findUnique({ where: { id } })
  if (!row) throw notFound('Modelo não encontrado')
  if (row.status !== 'DRAFT') {
    throw conflict('Só o rascunho é editável: crie uma versão nova', 'TEMPLATE_NOT_DRAFT')
  }
  // updateMany com o status no filtro: quem publicou no meio do caminho ganha
  const { count } = await prisma.contractTemplate.updateMany({
    where: { id, status: 'DRAFT' },
    data: { body: normalizeTemplateBody(input.body), changeNote: input.changeNote },
  })
  if (count === 0) {
    throw conflict('Só o rascunho é editável: crie uma versão nova', 'TEMPLATE_NOT_DRAFT')
  }
  return getTemplate(id)
}

/** O modelo preenchido com os dados reais da empresa, sem gravar nada */
export async function previewTemplate(
  id: string,
  companyId: string,
  now: Date
): Promise<TemplatePreviewDto> {
  const template = await prisma.contractTemplate.findUnique({ where: { id } })
  if (!template) throw notFound('Modelo não encontrado')
  const input = await loadContractFieldInput(prisma, companyId, template.kind, template, now)
  if (!input) throw notFound('Cliente não encontrado')
  const { text, missing } = fillContractTemplate(template.body, buildContractFieldValues(input))
  return {
    renderedBody: text,
    missing,
    issues: checkTemplateForPublish(template.kind, template.body),
  }
}

/** Arquiva o PUBLISHED do tipo e publica este, na mesma transação */
export async function publishTemplate(id: string, actorId: string): Promise<ContractTemplateDto> {
  const published = await prisma.$transaction(async (tx) => {
    const row = await tx.contractTemplate.findUnique({ where: { id } })
    if (!row) throw notFound('Modelo não encontrado')
    if (row.status !== 'DRAFT') {
      throw conflict('Só o rascunho pode ser publicado', 'TEMPLATE_NOT_DRAFT')
    }
    const issues = checkTemplateForPublish(row.kind, row.body)
    if (issues.length > 0) {
      throw unprocessable(
        'O modelo ainda tem o que impede publicar',
        { issues },
        'TEMPLATE_NOT_PUBLISHABLE'
      )
    }

    await tx.contractTemplate.updateMany({
      where: { kind: row.kind, status: 'PUBLISHED' },
      data: { status: 'ARCHIVED' },
    })
    const now = new Date()
    const { count } = await tx.contractTemplate.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'PUBLISHED', publishedAt: now, publishedById: actorId },
    })
    if (count === 0) throw conflict('Só o rascunho pode ser publicado', 'TEMPLATE_NOT_DRAFT')

    await recordBillingEvent(tx, {
      type: 'TEMPLATE_PUBLISHED',
      companyId: null,
      actorId,
      fields: [],
      ref: { templateKind: row.kind, templateVersion: row.version },
    })
    return { ...row, status: 'PUBLISHED' as const, publishedAt: now, publishedById: actorId }
  })
  return toDto(published)
}
