// Rotas do gerente (E8, W1 sem mapa) — prefixo /intel/manager.
// Acesso: intel.manager ou intel.admin; SUPERADMIN escolhe o tenant por companyId.
import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '@addere/db'
import { requireAnyPermission } from '../../../middleware/authenticate'
import { resolveTenant } from '../../../middleware/resolve-tenant'
import { getEffectivePermissions } from '../../permissions/permissions.service'
import { ymdSaoPaulo } from '../engine/business-days'
import {
  buildManagerHome,
  buildPilotReport,
  buildTeam,
  countManagers,
  resolveTeamScope,
  type TeamScope,
} from './manager.service'
import { compactYmd, ymdToUtcDate } from './range'

const DEFAULT_LOJA = '01'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data deve ser YYYY-MM-DD')

const teamQuerySchema = z.object({
  date: isoDate.optional(),
  range: z.enum(['day', 'week', 'month']).default('day'),
})

const pilotQuerySchema = z.object({ from: isoDate, to: isoDate })

const planItemSchema = z
  .object({
    companyId: z.string().uuid().optional(),
    vendorCode: z.string().min(1).max(20),
    customerCode: z.string().min(1).max(20),
    loja: z.string().min(1).max(10).default(DEFAULT_LOJA),
    date: isoDate.optional(),
    shortReason: z.string().max(280).optional(),
  })
  .strict()

/** O gerente vê a empresa inteira quando é intel.admin/SUPERADMIN (D3b). */
async function scopeFor(request: FastifyRequest, companyId: string): Promise<TeamScope> {
  const isSuperAdmin = request.user.role === 'SUPERADMIN'
  const permissions = isSuperAdmin
    ? new Set<string>()
    : await getEffectivePermissions(request.user.sub, request.user.role)
  return resolveTeamScope({
    viewerId: request.user.sub,
    isAdmin: isSuperAdmin || permissions.has('intel.admin'),
    managerCount: await countManagers(companyId),
  })
}

export default async function managerRoutes(app: FastifyInstance) {
  const guard = requireAnyPermission('intel.admin', 'intel.manager')

  // GET /intel/manager/team?date=&range= — Equipe em campo (W1)
  app.get('/team', { preHandler: [guard] }, async (request, reply) => {
    const company = await resolveTenant(request, reply, 'query')
    if (!company) return
    const query = teamQuerySchema.parse(request.query)

    const anchorYmd = query.date ? compactYmd(query.date) : ymdSaoPaulo(new Date())
    const scope = await scopeFor(request, company.id)
    return reply.send(await buildTeam(company.id, scope, anchorYmd, query.range))
  })

  // GET /intel/manager/home — home do gerente no app: meta da equipe (soma das
  // metas dos vendedores associados) e as visitas de hoje, só da equipe dele
  app.get('/home', { preHandler: [guard] }, async (request, reply) => {
    const company = await resolveTenant(request, reply, 'query')
    if (!company) return
    return reply.send(await buildManagerHome(company.id, request.user.sub))
  })

  // GET /intel/manager/pilot-metrics?from=&to= — as 3 métricas do dry-run
  app.get('/pilot-metrics', { preHandler: [guard] }, async (request, reply) => {
    const company = await resolveTenant(request, reply, 'query')
    if (!company) return
    const query = pilotQuerySchema.parse(request.query)

    const fromYmd = compactYmd(query.from)
    const toYmd = compactYmd(query.to)
    if (fromYmd > toYmd) {
      return reply.status(400).send({ message: 'A data inicial não pode ser depois da final' })
    }

    const scope = await scopeFor(request, company.id)
    return reply.send(await buildPilotReport(company.id, scope, fromYmd, toYmd))
  })

  // POST /intel/manager/plan-items — gerente põe um cliente no plano do vendedor
  app.post('/plan-items', { preHandler: [guard] }, async (request, reply) => {
    const company = await resolveTenant(request, reply, 'body')
    if (!company) return
    const body = planItemSchema.parse(request.body)

    const seller = await prisma.user.findFirst({
      where: { companyId: company.id, active: true, idVendProt: body.vendorCode },
      select: { id: true, managerId: true },
    })
    if (!seller) {
      return reply.status(404).send({ message: 'Vendedor não encontrado nesta empresa' })
    }

    // O gerente com recorte próprio não mexe no plano de quem não é dele
    const scope = await scopeFor(request, company.id)
    if (scope.managerId && seller.managerId !== scope.managerId) {
      return reply.status(403).send({ message: 'Este vendedor não é da sua equipe' })
    }

    // O cadastro tem cliente com `loja` nula, e o resto da Inteligência os lê
    // como '01' (`loja ?? '01'`) — inclusive o motor, que já os põe no plano.
    // Casar a coluna literalmente devolvia 404 justamente nesses.
    const lojaFilter =
      body.loja === DEFAULT_LOJA
        ? { OR: [{ loja: DEFAULT_LOJA }, { loja: null }] }
        : { loja: body.loja }

    const customer = await prisma.customer.findFirst({
      where: {
        companyId: company.id,
        active: true,
        protheusCode: body.customerCode,
        ...lojaFilter,
      },
      select: { id: true },
    })
    if (!customer) {
      return reply.status(404).send({ message: 'Cliente não encontrado nesta empresa' })
    }

    const ymd = body.date ? compactYmd(body.date) : ymdSaoPaulo(new Date())
    const date = ymdToUtcDate(ymd)

    const plan = await prisma.visitPlan.upsert({
      where: {
        companyId_vendorCode_date_kind: {
          companyId: company.id,
          vendorCode: body.vendorCode,
          date,
          kind: 'DAY',
        },
      },
      update: {},
      create: { companyId: company.id, vendorCode: body.vendorCode, date, kind: 'DAY' },
      select: { id: true },
    })

    const existing = await prisma.visitPlanItem.findFirst({
      where: { planId: plan.id, customerCode: body.customerCode, loja: body.loja },
      select: { id: true, removedAt: true },
    })
    if (existing) {
      // Idempotente: repetir o pedido devolve o item (e desfaz uma remoção)
      const item = await prisma.visitPlanItem.update({
        where: { id: existing.id },
        data: { removedAt: null, origin: 'MANAGER' },
      })
      return reply.status(200).send({ planId: plan.id, item })
    }

    const last = await prisma.visitPlanItem.findFirst({
      where: { planId: plan.id },
      orderBy: { position: 'desc' },
      select: { position: true },
    })
    const signal = await prisma.customerSignal.findUnique({
      where: {
        companyId_customerCode_loja: {
          companyId: company.id,
          customerCode: body.customerCode,
          loja: body.loja,
        },
      },
      select: { status: true, scoreTotal: true },
    })

    const item = await prisma.visitPlanItem.create({
      data: {
        planId: plan.id,
        position: (last?.position ?? 0) + 1,
        customerCode: body.customerCode,
        loja: body.loja,
        statusAtTime: signal?.status ?? 'NEW',
        scoreAtTime: signal?.scoreTotal ?? null,
        shortReason: body.shortReason ?? 'Incluído pelo gerente',
        origin: 'MANAGER',
      },
    })

    return reply.status(201).send({ planId: plan.id, item })
  })
}
