// Serviço das consultas configuráveis (E3, tela W3).
// Fluxo: rascunho (PUT) → prévia com checks (POST /preview) → reconciliação
// (POST /reconcile) → publicação (POST /publish, só com tudo verde).

import { prisma } from '@addere/db'
import type { Company, IntelQuery } from '@prisma/client'
import type {
  IntelQueryDto,
  IntelQueryName,
  QueryCheck,
  QueryPreviewResult,
  ReconciliationResult,
} from '@addere/types'
import { DEFAULT_INTEL_PARAMETERS } from '@addere/types'
import { badRequest, notFound, unprocessable } from '../../../lib/errors'
import { env } from '../../../lib/env'
import { QUERY_CONTRACTS } from '../protheus-sql/contracts'
import { validateSql } from '../protheus-sql/sql-guard'
import { substitutePlaceholders, formatDateYmdSaoPaulo } from '../protheus-sql/placeholders'
import { buildPlaceholderValues } from '../protheus-sql/placeholder-values'
import { periodWindow, type DateWindow } from '../sync/windows'
import { getSqlAdapter } from '../protheus-sql/sql-api.adapter'
import { validateResultAgainstContract } from '../protheus-sql/contract-validator'
import type { UpsertQueryInput } from './queries.schema'

const PREVIEW_WINDOW_DAYS = 7
const PREVIEW_TIMEOUT_MS = 30_000
const PREVIEW_MAX_CHECK_MS = 10_000
const PREVIEW_MAX_ROWS = 200 // busca 1 página; a resposta corta em 50
const PREVIEW_RESPONSE_ROWS = 50
const RECONCILE_TIMEOUT_MS = 120_000

// ─── Mapeamento para DTO ───

export function toQueryDto(row: IntelQuery, validatedByName: string | null = null): IntelQueryDto {
  return {
    id: row.id,
    name: row.name as IntelQueryName,
    scope: row.scope,
    sql: row.sql,
    definition: row.definition,
    exclusions: row.exclusions,
    gotchas: row.gotchas,
    version: row.version,
    validatedAt: row.validatedAt?.toISOString() ?? null,
    validatedBy: row.validatedBy,
    validatedByName,
    reconciliationPeriod: row.reconciliationPeriod,
    reconciliationRefAmount: row.reconciliationRefAmount?.toString() ?? null,
    reconciliationCalcAmount: row.reconciliationCalcAmount?.toString() ?? null,
    reconciliationDiffPct:
      row.reconciliationDiffPct === null ? null : Number(row.reconciliationDiffPct),
    published: row.published,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// validatedBy guarda o id do usuário — a tela mostrava o UUID cru em
// "Prévia ok em … por …". Resolve os nomes de uma vez para a lista.
async function validatorNames(rows: IntelQuery[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.validatedBy).filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return new Map()
  const users =
    (await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })) ?? []
  return new Map(users.map((u) => [u.id, u.name]))
}

async function toQueryDtoNamed(row: IntelQuery): Promise<IntelQueryDto> {
  const names = await validatorNames([row])
  return toQueryDto(row, row.validatedBy ? (names.get(row.validatedBy) ?? null) : null)
}

async function getLatestQuery(companyId: string, name: IntelQueryName) {
  return prisma.intelQuery.findFirst({
    where: { companyId, name },
    orderBy: { version: 'desc' },
  })
}

// ─── Lista (GET /intel/admin/queries) ───

export async function listQueries(company: Company) {
  const rows = await prisma.intelQuery.findMany({
    where: { companyId: company.id },
    orderBy: [{ name: 'asc' }, { version: 'desc' }],
  })
  const latestByName = new Map<string, IntelQuery>()
  for (const row of rows) {
    if (!latestByName.has(row.name)) latestByName.set(row.name, row)
  }
  const names = await validatorNames([...latestByName.values()])

  const contracts = Object.values(QUERY_CONTRACTS).map((contract) => {
    const latest = latestByName.get(contract.name) ?? null
    const status = !latest ? 'missing' : latest.published ? 'published' : 'draft'
    return {
      name: contract.name,
      labelPt: contract.labelPt,
      frequency: contract.frequency,
      allowedScopes: contract.allowedScopes,
      requiredPlaceholders: contract.requiredPlaceholders,
      optionalPlaceholders: contract.optionalPlaceholders,
      columns: contract.columns,
      referenceSql: contract.referenceSql,
      helpText: contract.helpText,
      status,
      query: latest
        ? toQueryDto(latest, latest.validatedBy ? (names.get(latest.validatedBy) ?? null) : null)
        : null,
    }
  })

  // Chip "meta (API)": metas de vendedor já chegam pela API dedicada (apiMetaVend)
  const lastGoalSnapshot = await prisma.goalSnapshot.findFirst({
    where: { companyId: company.id },
    orderBy: { capturedAt: 'desc' },
    select: { capturedAt: true },
  })

  return {
    contracts,
    goalMeta: {
      viaApi: Boolean(company.apiMetaVend),
      lastSnapshotAt: lastGoalSnapshot?.capturedAt.toISOString() ?? null,
    },
    sqlEndpointConfigured: Boolean(company.apiSql),
  }
}

// ─── Rascunho (PUT /intel/admin/queries/:name) ───

export async function saveDraft(
  company: Company,
  name: IntelQueryName,
  input: UpsertQueryInput,
  userId: string
) {
  const contract = QUERY_CONTRACTS[name]
  const scope = input.scope ?? 'ALL'

  const violations = validateSql(input.sql, contract, scope)
  if (violations.length > 0) {
    throw unprocessable('SQL reprovado pela guarda', violations)
  }

  const latest = await getLatestQuery(company.id, name)

  const data = {
    sql: input.sql,
    scope,
    definition: input.definition ?? null,
    exclusions: input.exclusions ?? null,
    gotchas: input.gotchas ?? null,
    // Qualquer edição invalida prévia e reconciliação anteriores
    validatedAt: null,
    validatedBy: userId,
    reconciliationPeriod: null,
    reconciliationRefAmount: null,
    reconciliationCalcAmount: null,
    reconciliationDiffPct: null,
  }

  if (!latest) {
    const created = await prisma.intelQuery.create({
      data: { ...data, companyId: company.id, name, version: 1 },
    })
    return toQueryDtoNamed(created)
  }

  if (latest.published) {
    // Versão publicada é imutável — edição vira nova versão em rascunho
    const created = await prisma.intelQuery.create({
      data: { ...data, companyId: company.id, name, version: latest.version + 1 },
    })
    return toQueryDtoNamed(created)
  }

  const updated = await prisma.intelQuery.update({ where: { id: latest.id }, data })
  return toQueryDtoNamed(updated)
}

// ─── Janela da prévia ───

function previewWindow(): DateWindow {
  const now = new Date()
  const ini = new Date(now.getTime() - PREVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  return { dataIni: formatDateYmdSaoPaulo(ini), dataFim: formatDateYmdSaoPaulo(now) }
}

// ─── Prévia (POST /intel/admin/queries/:name/preview) ───

export async function previewQuery(
  company: Company,
  name: IntelQueryName,
  userId: string
): Promise<QueryPreviewResult> {
  const contract = QUERY_CONTRACTS[name]
  const latest = await getLatestQuery(company.id, name)
  if (!latest) throw notFound(`Consulta ${contract.labelPt} ainda não configurada`)

  const checks: QueryCheck[] = []
  const fail = (result: Omit<QueryPreviewResult, 'checks'>): QueryPreviewResult => ({
    ...result,
    checks,
  })

  // 1. Guarda SQL (defesa em profundidade — o rascunho já passou por ela)
  const violations = validateSql(latest.sql, contract, latest.scope)
  checks.push({
    key: 'sql_guard',
    label: 'Guarda SQL (só SELECT/WITH)',
    ok: violations.length === 0,
    detail: violations.map((v) => v.message).join('; ') || undefined,
  })
  if (violations.length > 0) {
    return fail({ ok: false, error: 'SQL reprovado pela guarda', columns: [], rows: [], stats: { rows: 0 }, ms: 0 })
  }

  // 2. Placeholders substituíveis com os dados do tenant
  const { values, errors: valueErrors } = await buildPlaceholderValues(
    company,
    contract,
    previewWindow()
  )
  const substituted = substitutePlaceholders(latest.sql, values)
  const placeholderErrors = [...valueErrors, ...substituted.errors]
  checks.push({
    key: 'placeholders',
    label: 'Placeholders resolvidos',
    ok: placeholderErrors.length === 0,
    detail: placeholderErrors.join('; ') || undefined,
  })
  if (placeholderErrors.length > 0) {
    return fail({ ok: false, error: 'Placeholders não resolvidos', columns: [], rows: [], stats: { rows: 0 }, ms: 0 })
  }

  // 3. Execução no ERP (janela de 7 dias, 1 página)
  const adapter = getSqlAdapter(env.INTEL_SQL_ADAPTER)
  let ms: number
  let rows
  try {
    const result = await adapter.run(company, substituted.sql, {
      queryName: name,
      timeoutMs: PREVIEW_TIMEOUT_MS,
      maxRows: PREVIEW_MAX_ROWS,
    })
    rows = result.rows
    ms = result.ms
  } catch (err) {
    // Mensagem sanitizada — nunca o corpo da resposta do ERP
    checks.push({ key: 'erp_call', label: 'Chamada ao endpoint SQL', ok: false, detail: (err as Error).message.slice(0, 300) })
    return fail({ ok: false, error: 'Falha na chamada ao endpoint SQL do Protheus', columns: [], rows: [], stats: { rows: 0 }, ms: 0 })
  }
  checks.push({ key: 'erp_call', label: 'Chamada ao endpoint SQL', ok: true })

  // 4. Tempo de resposta aceitável para uso recorrente
  checks.push({
    key: 'preview_time',
    label: `Tempo de resposta ≤ ${PREVIEW_MAX_CHECK_MS / 1000}s`,
    ok: ms <= PREVIEW_MAX_CHECK_MS,
    detail: `${ms} ms`,
  })

  // 5. Contrato: colunas obrigatórias, tipos, duplicidade e fan-out
  const contractResult = validateResultAgainstContract(contract, rows)
  checks.push(...contractResult.checks)

  const ok = checks.every((c) => c.ok)

  // Prévia verde marca a versão como validada; vermelha limpa a validação
  await prisma.intelQuery.update({
    where: { id: latest.id },
    data: { validatedAt: ok ? new Date() : null, validatedBy: userId },
  })

  const columns = rows.length > 0 ? Object.keys(rows[0]) : []
  return {
    ok,
    checks,
    columns,
    rows: rows.slice(0, PREVIEW_RESPONSE_ROWS),
    stats: {
      rows: contractResult.stats.rows,
      distinctOrders: contractResult.stats.distinctOrders,
      distinctCustomers: contractResult.stats.distinctCustomers,
    },
    ms,
  }
}

// ─── Reconciliação (POST /intel/admin/queries/:name/reconcile) ───

async function getTolerancePct(companyId: string): Promise<number> {
  const row = await prisma.intelParameter.findUnique({
    where: {
      companyId_key_segment: { companyId, key: 'reconciliation_tolerance_pct', segment: '' },
    },
  })
  const value = Number(row?.value)
  return Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_INTEL_PARAMETERS.reconciliation_tolerance_pct
}

function probableCauses(diffPct: number, name: IntelQueryName): string[] {
  if (Math.abs(diffPct) < 0.005) return []
  const causes: string[] = []
  if (diffPct < 0) {
    causes.push(
      'Alguma filial ficou fora do filtro {{FILIAL}} (confira as filiais ativas cadastradas)',
      'A consulta exclui CFOPs que o número oficial considera (bonificação, remessa)',
      'Janela de datas por emissão × faturamento (D2_EMISSAO vs F2_EMISSAO)'
    )
  } else {
    causes.push(
      'Devoluções não estão sendo abatidas (D2_QTDEDEV / CFOPs de devolução)',
      'Notas canceladas entrando na soma (conferir D_E_L_E_T_ nas tabelas do JOIN)',
      'JOIN multiplicando itens (fan-out) — confira as chaves com a prévia'
    )
  }
  if (name === 'SALES') {
    causes.push('O número oficial pode incluir outras séries/tipos de nota')
  }
  return causes
}

export async function reconcileQuery(
  company: Company,
  name: IntelQueryName,
  period: string,
  refAmount: number,
  userId: string
): Promise<ReconciliationResult> {
  const contract = QUERY_CONTRACTS[name]
  const latest = await getLatestQuery(company.id, name)
  if (!latest) throw notFound(`Consulta ${contract.labelPt} ainda não configurada`)
  if (!contract.columns.some((c) => c.name === 'valor')) {
    throw unprocessable(`Reconciliação exige a coluna "valor" — contrato ${contract.labelPt} não a possui`)
  }

  const month = Number(period.slice(4, 6))
  if (month < 1 || month > 12) throw badRequest('Período inválido (mês fora de 01–12)')

  const { values, errors: valueErrors } = await buildPlaceholderValues(
    company,
    contract,
    periodWindow(period)
  )
  const substituted = substitutePlaceholders(latest.sql, values)
  const errors = [...valueErrors, ...substituted.errors]
  if (errors.length > 0) throw unprocessable(errors.join('; '))

  const adapter = getSqlAdapter(env.INTEL_SQL_ADAPTER)
  const result = await adapter.run(company, substituted.sql, {
    queryName: name,
    timeoutMs: RECONCILE_TIMEOUT_MS,
  })

  let calcAmount = 0
  for (const row of result.rows) {
    const value = Number(String(row['valor'] ?? '0').replace(',', '.'))
    if (Number.isFinite(value)) calcAmount += value
  }
  calcAmount = Math.round(calcAmount * 100) / 100

  const diffPct = refAmount === 0 ? 0 : Math.round(((calcAmount - refAmount) / refAmount) * 10_000) / 100
  const tolerance = await getTolerancePct(company.id)
  const withinTolerance = Math.abs(diffPct) <= tolerance

  await prisma.intelQuery.update({
    where: { id: latest.id },
    data: {
      reconciliationPeriod: period,
      reconciliationRefAmount: refAmount,
      reconciliationCalcAmount: calcAmount,
      reconciliationDiffPct: diffPct,
      validatedBy: userId,
    },
  })

  return {
    ok: true,
    period,
    refAmount: refAmount.toFixed(2),
    calcAmount: calcAmount.toFixed(2),
    diffPct,
    withinTolerance,
    probableCauses: withinTolerance ? [] : probableCauses(diffPct, name),
  }
}

// ─── Publicação (POST /intel/admin/queries/:name/publish) ───

export async function publishQuery(company: Company, name: IntelQueryName, userId: string) {
  const contract = QUERY_CONTRACTS[name]
  const latest = await getLatestQuery(company.id, name)
  if (!latest) throw notFound(`Consulta ${contract.labelPt} ainda não configurada`)
  if (latest.published) throw badRequest('Esta versão já está publicada')
  if (!latest.validatedAt) {
    throw unprocessable('Rode a prévia com todos os checks verdes antes de publicar')
  }

  const tolerance = await getTolerancePct(company.id)
  const diffPct = latest.reconciliationDiffPct === null ? null : Number(latest.reconciliationDiffPct)
  if (diffPct === null) {
    throw unprocessable('Faça a reconciliação de um mês fechado antes de publicar')
  }
  if (Math.abs(diffPct) > tolerance) {
    throw unprocessable(
      `Diferença da reconciliação (${diffPct.toFixed(2)}%) acima da tolerância (${tolerance}%)`
    )
  }

  const [, published] = await prisma.$transaction([
    prisma.intelQuery.updateMany({
      where: { companyId: company.id, name, published: true },
      data: { published: false },
    }),
    prisma.intelQuery.update({
      where: { id: latest.id },
      data: { published: true, publishedAt: new Date(), validatedBy: userId },
    }),
  ])

  return toQueryDtoNamed(published)
}
