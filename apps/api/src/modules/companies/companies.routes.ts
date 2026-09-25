import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authenticate, requireSuperAdmin } from '../../middleware/authenticate'
import {
  listCompanies,
  getCompanyById,
  createCompany,
  toggleCompanyActive,
  createUser,
  updateUser,
  toggleUserActive,
  listCompanyCustomers,
  createCustomer,
  updateCustomer,
  toggleCustomerActive,
  listCompanyProducts,
  createProduct,
  updateProduct,
  toggleProductActive,
  listCompanyOrders,
  cancelOrder,
  updateCompany,
  getSyncSchedule,
  updateSyncSchedule,
  updateCompanyProtheus,
  getCompanyFieldConfig,
  updateCompanyFieldConfig,
  listProtheusLogs,
} from './companies.service'
import { createBranch, updateBranch, toggleBranchActive } from '../branches/branches.service'
import { applySchedule } from '../sync/scheduler'
import {
  createCompanySchema,
  updateCompanySchema,
  createBranchSchema,
  updateBranchSchema,
  createCompanyUserSchema,
  updateCompanyUserSchema,
  toggleActiveSchema,
  createCustomerSchema,
  updateCustomerSchema,
  createProductSchema,
  updateProductSchema,
  updateProtheusSchema,
  updateSyncScheduleSchema,
  updateFieldConfigSchema,
  listQuerySchema,
  protheusLogsQuerySchema,
} from './companies.schema'
import { DEFAULT_SYNC_SCHEDULE } from '@addere/types'

// Erros de validação (ZodError) e de negócio (AppError) são convertidos em
// resposta pelo error handler global de app.ts — as rotas não têm try/catch.
export default async function companiesRoutes(app: FastifyInstance) {
  const superadmin = { preHandler: requireSuperAdmin }

  // ─── Empresa ───────────────────────────────────────────────────────────────

  // GET /companies — lista todas as empresas
  app.get('/', superadmin, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await listCompanies())
  })

  // POST /companies — cria empresa
  app.post('/', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const company = await createCompany(createCompanySchema.parse(request.body))
    return reply.status(201).send(company)
  })

  // GET /companies/:id — detalhe da empresa (filiais + usuários)
  app.get('/:id', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    return reply.send(await getCompanyById(id))
  })

  // PATCH /companies/:id — edita dados básicos da empresa
  app.patch('/:id', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const input = updateCompanySchema.parse(request.body)
    return reply.send(await updateCompany(id, { ...input, idProtheus: input.idProtheus ?? null }))
  })

  // PATCH /companies/:id/active — ativa/desativa empresa (e o auto-sync junto)
  app.patch('/:id/active', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const { active } = toggleActiveSchema.parse(request.body)
    return reply.send(await toggleCompanyActive(id, active))
  })

  // PATCH /companies/:id/protheus — atualiza configuração Protheus da empresa
  app.patch('/:id/protheus', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const company = await updateCompanyProtheus(id, updateProtheusSchema.parse(request.body))
    return reply.send(company)
  })

  // ─── Filiais ───────────────────────────────────────────────────────────────

  // POST /companies/:id/branches — cria filial
  app.post('/:id/branches', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const branch = await createBranch(id, createBranchSchema.parse(request.body))
    return reply.status(201).send(branch)
  })

  // PATCH /companies/:id/branches/:branchId — atualiza dados da filial
  app.patch(
    '/:id/branches/:branchId',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, branchId } = request.params as { id: string; branchId: string }
      return reply.send(await updateBranch(id, branchId, updateBranchSchema.parse(request.body)))
    }
  )

  // PATCH /companies/:id/branches/:branchId/active — ativa/desativa filial
  app.patch(
    '/:id/branches/:branchId/active',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, branchId } = request.params as { id: string; branchId: string }
      const { active } = toggleActiveSchema.parse(request.body)
      return reply.send(await toggleBranchActive(id, branchId, active))
    }
  )

  // ─── Usuários da empresa ───────────────────────────────────────────────────

  // POST /companies/:id/users — cria usuário na empresa
  app.post('/:id/users', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const input = createCompanyUserSchema.parse(request.body)
    const user = await createUser(id, input)
    return reply.status(201).send(user)
  })

  // PATCH /companies/:id/users/:userId — atualiza dados do usuário
  app.patch(
    '/:id/users/:userId',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, userId } = request.params as { id: string; userId: string }
      return reply.send(await updateUser(id, userId, updateCompanyUserSchema.parse(request.body)))
    }
  )

  // PATCH /companies/:id/users/:userId/active — ativa/desativa usuário
  app.patch(
    '/:id/users/:userId/active',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, userId } = request.params as { id: string; userId: string }
      const { active } = toggleActiveSchema.parse(request.body)
      return reply.send(await toggleUserActive(id, userId, active))
    }
  )

  // ─── Clientes da empresa ───────────────────────────────────────────────────

  // GET /companies/:id/customers — clientes da empresa
  app.get('/:id/customers', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const { limit, page } = listQuerySchema.parse(request.query)
    return reply.send(await listCompanyCustomers(id, limit, page))
  })

  // POST /companies/:id/customers — cria cliente
  app.post('/:id/customers', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const customer = await createCustomer(id, createCustomerSchema.parse(request.body))
    return reply.status(201).send(customer)
  })

  // PATCH /companies/:id/customers/:customerId — atualiza cliente
  app.patch(
    '/:id/customers/:customerId',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, customerId } = request.params as { id: string; customerId: string }
      return reply.send(
        await updateCustomer(id, customerId, updateCustomerSchema.parse(request.body))
      )
    }
  )

  // PATCH /companies/:id/customers/:customerId/active — ativa/desativa cliente
  app.patch(
    '/:id/customers/:customerId/active',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, customerId } = request.params as { id: string; customerId: string }
      const { active } = toggleActiveSchema.parse(request.body)
      return reply.send(await toggleCustomerActive(id, customerId, active))
    }
  )

  // ─── Produtos da empresa ───────────────────────────────────────────────────

  // GET /companies/:id/products — produtos da empresa
  app.get('/:id/products', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const { limit, page } = listQuerySchema.parse(request.query)
    return reply.send(await listCompanyProducts(id, limit, page))
  })

  // POST /companies/:id/products — cria produto
  app.post('/:id/products', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const product = await createProduct(id, createProductSchema.parse(request.body))
    return reply.status(201).send(product)
  })

  // PATCH /companies/:id/products/:productId — atualiza produto
  app.patch(
    '/:id/products/:productId',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, productId } = request.params as { id: string; productId: string }
      return reply.send(await updateProduct(id, productId, updateProductSchema.parse(request.body)))
    }
  )

  // PATCH /companies/:id/products/:productId/active — ativa/desativa produto
  app.patch(
    '/:id/products/:productId/active',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, productId } = request.params as { id: string; productId: string }
      const { active } = toggleActiveSchema.parse(request.body)
      return reply.send(await toggleProductActive(id, productId, active))
    }
  )

  // ─── Pedidos da empresa ────────────────────────────────────────────────────

  // GET /companies/:id/orders — pedidos da empresa
  app.get('/:id/orders', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const { limit, page } = listQuerySchema.parse(request.query)
    return reply.send(await listCompanyOrders(id, limit, page))
  })

  // PATCH /companies/:id/orders/:orderId/cancel — cancela pedido
  app.patch(
    '/:id/orders/:orderId/cancel',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, orderId } = request.params as { id: string; orderId: string }
      return reply.send(await cancelOrder(id, orderId))
    }
  )

  // ─── Configurações ─────────────────────────────────────────────────────────

  // GET /companies/:id/field-config — retorna config de visibilidade de uma empresa (superadmin)
  app.get('/:id/field-config', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    return reply.send(await getCompanyFieldConfig(id))
  })

  // PATCH /companies/:id/field-config — admin atualiza visibilidade e obrigatoriedade de campos
  app.patch(
    '/:id/field-config',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      const { hidden, required } = updateFieldConfigSchema.parse(request.body)
      return reply.send(await updateCompanyFieldConfig(id, hidden, required))
    }
  )

  // GET /companies/:id/sync-schedule — retorna configuração de agendamento
  app.get(
    '/:id/sync-schedule',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      return reply.send(await getSyncSchedule(id))
    }
  )

  // PATCH /companies/:id/sync-schedule — salva configuração e reinicia timers
  app.patch(
    '/:id/sync-schedule',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      const body = updateSyncScheduleSchema.parse(request.body)
      const current = await getSyncSchedule(id)
      const schedule = {
        products: { ...current.products, ...(body.products ?? {}) },
        customers: { ...current.customers, ...(body.customers ?? {}) },
      }
      await updateSyncSchedule(id, schedule)
      applySchedule(id, schedule)
      return reply.send(schedule)
    }
  )

  // ─── Rotas do usuário logado ───────────────────────────────────────────────

  // GET /companies/me/field-config — config de visibilidade da empresa do usuário logado
  app.get(
    '/me/field-config',
    { preHandler: authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { companyId } = request.user
      if (!companyId) return reply.send({ hidden: [], required: [] })
      return reply.send(await getCompanyFieldConfig(companyId))
    }
  )

  // GET /companies/me/sync-schedule — config de agendamento da empresa do usuário logado
  app.get(
    '/me/sync-schedule',
    { preHandler: authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { companyId } = request.user
      if (!companyId) return reply.send(DEFAULT_SYNC_SCHEDULE)
      return reply.send(await getSyncSchedule(companyId))
    }
  )

  // ─── Logs Protheus ─────────────────────────────────────────────────────────

  // GET /companies/:id/protheus-logs — lista logs de chamadas às APIs Protheus
  app.get(
    '/:id/protheus-logs',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      const q = protheusLogsQuerySchema.parse(request.query)
      const result = await listProtheusLogs(id, {
        page: q.page,
        limit: q.limit,
        operation: q.operation || undefined,
        success: q.success === 'true' ? true : q.success === 'false' ? false : undefined,
        from: q.from ? new Date(q.from) : undefined,
        to: q.to ? new Date(q.to) : undefined,
      })
      return reply.send(result)
    }
  )
}
