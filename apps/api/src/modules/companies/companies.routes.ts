import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { requireSuperAdmin } from '../../middleware/authenticate'
import {
  listCompanies,
  getCompanyById,
  createCompany,
  toggleCompanyActive,
  createBranch,
  toggleBranchActive,
  createUser,
  toggleUserActive,
  listCompanyCustomers,
  listCompanyProducts,
  listCompanyOrders,
  updateCompanyProtheus,
} from './companies.service'

const createCompanySchema = z.object({
  name: z.string().min(1),
  cnpj: z.string().min(1),
  idProtheus: z.string().optional(),
})

const createBranchSchema = z.object({
  name: z.string().min(1),
  cnpj: z.string().optional(),
  idProtheus: z.string().optional(),
})

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'SALESPERSON']),
})

const toggleActiveSchema = z.object({
  active: z.boolean(),
})

const updateProtheusSchema = z.object({
  apiToken:     z.string().url().optional().or(z.literal('')),
  apiPord:      z.string().url().optional().or(z.literal('')),
  apiCliente:   z.string().url().optional().or(z.literal('')),
  apiPedido:    z.string().url().optional().or(z.literal('')),
  apiConsPed:   z.string().url().optional().or(z.literal('')),
  apiCondPag:   z.string().url().optional().or(z.literal('')),
  apiTransp:    z.string().url().optional().or(z.literal('')),
  apiMetaVend:  z.string().url().optional().or(z.literal('')),
  usrProtheus:  z.string().optional(),
  passProtheus: z.string().optional(),
  syncConfig:   z.record(z.unknown()).optional(),
})

export default async function companiesRoutes(app: FastifyInstance) {
  // GET /companies — lista todas as empresas
  app.get('/', { preHandler: requireSuperAdmin }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const companies = await listCompanies()
    return reply.send(companies)
  })

  // POST /companies — cria empresa
  app.post('/', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = createCompanySchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() })
    }
    const company = await createCompany(result.data)
    return reply.status(201).send(company)
  })

  // GET /companies/:id — detalhe da empresa (filiais + usuários)
  app.get('/:id', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    try {
      const company = await getCompanyById(id)
      return reply.send(company)
    } catch (err) {
      return reply.status(404).send({ message: (err as Error).message })
    }
  })

  // PATCH /companies/:id/active — ativa/desativa empresa
  app.patch('/:id/active', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const result = toggleActiveSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() })
    }
    const company = await toggleCompanyActive(id, result.data.active)
    return reply.send(company)
  })

  // PATCH /companies/:id/protheus — atualiza configuração Protheus da empresa
  app.patch('/:id/protheus', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const result = updateProtheusSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() })
    }
    try {
      const company = await updateCompanyProtheus(id, result.data)
      return reply.send(company)
    } catch (err) {
      return reply.status(422).send({ message: (err as Error).message })
    }
  })

  // POST /companies/:id/branches — cria filial
  app.post('/:id/branches', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const result = createBranchSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() })
    }
    const branch = await createBranch(id, result.data)
    return reply.status(201).send(branch)
  })

  // PATCH /companies/:id/branches/:branchId/active — ativa/desativa filial
  app.patch('/:id/branches/:branchId/active', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { branchId } = request.params as { id: string; branchId: string }
    const result = toggleActiveSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() })
    }
    const branch = await toggleBranchActive(branchId, result.data.active)
    return reply.send(branch)
  })

  // POST /companies/:id/users — cria usuário na empresa
  app.post('/:id/users', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const result = createUserSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() })
    }
    try {
      const user = await createUser(id, result.data)
      return reply.status(201).send(user)
    } catch (err) {
      return reply.status(422).send({ message: (err as Error).message })
    }
  })

  // PATCH /companies/:id/users/:userId/active — ativa/desativa usuário
  app.patch('/:id/users/:userId/active', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request.params as { id: string; userId: string }
    const result = toggleActiveSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() })
    }
    const user = await toggleUserActive(userId, result.data.active)
    return reply.send(user)
  })

  // GET /companies/:id/customers — clientes da empresa
  app.get('/:id/customers', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const { limit, page } = request.query as { limit?: string; page?: string }
    const customers = await listCompanyCustomers(id, limit ? Number(limit) : undefined, page ? Number(page) : undefined)
    return reply.send(customers)
  })

  // GET /companies/:id/products — produtos da empresa
  app.get('/:id/products', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const { limit, page } = request.query as { limit?: string; page?: string }
    const products = await listCompanyProducts(id, limit ? Number(limit) : undefined, page ? Number(page) : undefined)
    return reply.send(products)
  })

  // GET /companies/:id/orders — pedidos da empresa
  app.get('/:id/orders', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const { limit, page } = request.query as { limit?: string; page?: string }
    const orders = await listCompanyOrders(id, limit ? Number(limit) : undefined, page ? Number(page) : undefined)
    return reply.send(orders)
  })
}
