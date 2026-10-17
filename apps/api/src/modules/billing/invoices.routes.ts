import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { requireSuperAdmin } from '../../middleware/authenticate'
import { userRateLimit } from '../../lib/rate-limit'
import { tickBillingScheduler } from './jobs/billing-scheduler'
import {
  cancelInvoiceSchema,
  invoiceIdParam,
  invoiceItemParam,
  listInvoicesQuery,
  manualInvoiceSchema,
  manualItemSchema,
  payInvoiceSchema,
  updateInvoiceSchema,
} from './invoices.schema'
import {
  addInvoiceItem,
  cancelInvoice,
  createManualInvoice,
  getInvoice,
  listInvoices,
  payInvoice,
  recalculateInvoice,
  removeInvoiceItem,
  updateInvoice,
} from './invoices.service'

// Faturas (plano 016) — registrado com o prefixo /admin/billing. Só o
// SUPERADMIN; o autor de cada ação é request.user.sub. A rota do ADMIN do
// cliente (GET /billing/me/invoices) fica em me.routes.ts, com a guarda dela.
export default async function invoicesRoutes(app: FastifyInstance) {
  const superadmin = { preHandler: requireSuperAdmin }
  const actorOf = (request: FastifyRequest) => ({ id: request.user.sub })

  app.get('/invoices', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const filters = listInvoicesQuery.parse(request.query)
    return reply.send(await listInvoices(filters, new Date()))
  })

  app.get('/invoices/:id', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = invoiceIdParam.parse(request.params)
    return reply.send(await getInvoice(id, new Date()))
  })

  // Fatura avulsa (D3)
  app.post('/invoices', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const input = manualInvoiceSchema.parse(request.body)
    return reply.status(201).send(await createManualInvoice(input, actorOf(request), new Date()))
  })

  app.post(
    '/invoices/:id/recalculate',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = invoiceIdParam.parse(request.params)
      return reply.send(await recalculateInvoice(id, actorOf(request), new Date()))
    }
  )

  app.post(
    '/invoices/:id/pay',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = invoiceIdParam.parse(request.params)
      const input = payInvoiceSchema.parse(request.body)
      return reply.send(await payInvoice(id, input, actorOf(request), new Date()))
    }
  )

  app.post(
    '/invoices/:id/cancel',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = invoiceIdParam.parse(request.params)
      const { reason } = cancelInvoiceSchema.parse(request.body)
      return reply.send(await cancelInvoice(id, reason, actorOf(request), new Date()))
    }
  )

  app.post(
    '/invoices/:id/items',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = invoiceIdParam.parse(request.params)
      const item = manualItemSchema.parse(request.body)
      return reply.status(201).send(await addInvoiceItem(id, item, actorOf(request), new Date()))
    }
  )

  app.delete(
    '/invoices/:id/items/:itemId',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, itemId } = invoiceItemParam.parse(request.params)
      return reply.send(await removeInvoiceItem(id, itemId, actorOf(request), new Date()))
    }
  )

  app.patch('/invoices/:id', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = invoiceIdParam.parse(request.params)
    const input = updateInvoiceSchema.parse(request.body)
    return reply.send(await updateInvoice(id, input, actorOf(request), new Date()))
  })

  // Ferramenta de incidente: roda o tick agora, mesmo com BILLING_JOBS_ENABLED
  // desligada. Seguro repetir: nada é duplicado (chaves únicas).
  app.post(
    '/jobs/run',
    { preHandler: [requireSuperAdmin, userRateLimit(3, '1 minute')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(await tickBillingScheduler(new Date()))
    }
  )
}
