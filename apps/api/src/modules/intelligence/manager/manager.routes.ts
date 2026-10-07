// Rotas do gerente (E8, W1 sem mapa) — prefixo /intel/manager.
// Acesso: intel.manager ou intel.admin; SUPERADMIN escolhe o tenant por companyId.
import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '@addere/db'
import { requireAnyPermission } from '../../../middleware/authenticate'
import { resolveTenant } from '../../../middleware/resolve-tenant'
import { resolveViewerScope, type ViewerScope } from '../../users/data-scope'
import { ymdSaoPaulo } from '../engine/business-days'
import { buildManagerHome, buildPilotReport, buildTeam } from './manager.service'
import { compactYmd, ymdToUtcDate } from './range'
import { buildTeamMapForDay } from './team-map.service'
import { buildLossesReport } from './losses.service'
import { buildNoOrderReasonsReport } from './no-order.service'

const DEFAULT_LOJA = '01'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data deve ser YYYY-MM-DD')

const teamQuerySchema = z.object({
  date: isoDate.optional(),
  range: z.enum(['day', 'week', 'month']).default('day'),
})

const pilotQuerySchema = z.object({ from: isoDate, to: isoDate })

const mapQuerySchema = z.object({ date: isoDate.optional() })

const lossesQuerySchema = z.object({
  date: isoDate.optional(),
  baselineMonths: z.coerce.number().int().min(1).max(12).default(3),
  vendorCode: z.string().min(1).max(20).optional(),
})

const noOrderQuerySchema = z.object({
  date: isoDate.optional(),
  range: z.enum(['day', 'week', 'month']).default('day'),
})

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

/**
 * Só intel.admin/SUPERADMIN veem a empresa inteira; o gerente, a sua equipe
 * (D3b). Delega a resolveViewerScope (users/data-scope.ts — resolvedor único
 * desde o plano 007); antes disso havia resolveTeamScope só para este módulo.
 */
function scopeFor(request: FastifyRequest): Promise<ViewerScope> {
  return resolveViewerScope(request.user.sub, request.user.role)
}

export default async function managerRoutes(app: FastifyInstance) {
  const guard = requireAnyPermission('intel.admin', 'intel.manager')

  // GET /intel/manager/team?date=&range= — Equipe em campo (W1)
  app.get('/team', { preHandler: [guard] }, async (request, reply) => {
    const company = await resolveTenant(request, reply, 'query')
    if (!company) return
    const query = teamQuerySchema.parse(request.query)

    const anchorYmd = query.date ? compactYmd(query.date) : ymdSaoPaulo(new Date())
    const scope = await scopeFor(request)
    return reply.send(await buildTeam(company.id, scope, anchorYmd, query.range))
  })

  // GET /intel/manager/home — home do gerente no app: meta da equipe (soma das
  // metas dos vendedores associados) e as visitas de hoje, só da equipe dele
  app.get('/home', { preHandler: [guard] }, async (request, reply) => {
    const company = await resolveTenant(request, reply, 'query')
    if (!company) return
    // A home do gerente é sempre a equipe de quem chamou, mesmo que ele
    // também tenha intel.admin/SUPERADMIN (decisão existente — nunca passou
    // por scopeFor). Por isso não usa scopeFor/resolveViewerScope aqui, que
    // dariam 'company' pro admin. ownVendorCode fica null de propósito:
    // loadSellers (via sellerWhere) só lê scope.managerId para o caso 'team'.
    const scope: ViewerScope = { kind: 'team', managerId: request.user.sub, ownVendorCode: null }
    return reply.send(await buildManagerHome(company.id, scope))
  })

  // GET /intel/manager/team-map?date= — Mapa da equipe (E20): paradas do dia e último check-in
  app.get('/team-map', { preHandler: [guard] }, async (request, reply) => {
    const company = await resolveTenant(request, reply, 'query')
    if (!company) return
    const query = mapQuerySchema.parse(request.query)
    const anchorYmd = query.date ? compactYmd(query.date) : ymdSaoPaulo(new Date())
    const scope = await scopeFor(request)
    return reply.send(await buildTeamMapForDay(company.id, scope, anchorYmd))
  })

  // GET /intel/manager/losses?date=&baselineMonths=&vendorCode= — Onde estou perdendo (E21)
  app.get('/losses', { preHandler: [guard] }, async (request, reply) => {
    const company = await resolveTenant(request, reply, 'query')
    if (!company) return
    const query = lossesQuerySchema.parse(request.query)
    const anchorYmd = query.date ? compactYmd(query.date) : ymdSaoPaulo(new Date())
    const scope = await scopeFor(request)

    // Gerente só pergunta pelos vendedores dele — vendedor de fora → 403
    if (query.vendorCode && scope.kind === 'team') {
      const seller = await prisma.user.findFirst({
        where: { companyId: company.id, active: true, idVendProt: query.vendorCode },
        select: { id: true, managerId: true },
      })
      const mine = seller && (seller.managerId === scope.managerId || seller.id === scope.managerId)
      if (!mine) {
        return reply.status(403).send({ message: 'Este vendedor não é da sua equipe' })
      }
    }

    return reply.send(
      await buildLossesReport(company.id, scope, {
        anchorYmd,
        baselineMonths: query.baselineMonths,
        vendorCode: query.vendorCode ?? null,
      })
    )
  })

  // GET /intel/manager/no-order-reasons?date=&range= — Por que não vendeu (E22)
  app.get('/no-order-reasons', { preHandler: [guard] }, async (request, reply) => {
    const company = await resolveTenant(request, reply, 'query')
    if (!company) return
    const query = noOrderQuerySchema.parse(request.query)

    const anchorYmd = query.date ? compactYmd(query.date) : ymdSaoPaulo(new Date())
    const scope = await scopeFor(request)
    return reply.send(await buildNoOrderReasonsReport(company.id, scope, anchorYmd, query.range))
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

    const scope = await scopeFor(request)
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
    const scope = await scopeFor(request)
    if (scope.kind === 'team' && seller.managerId !== scope.managerId && seller.id !== scope.managerId) {
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
