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
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'SALESPERSON']),
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
    const { active } = request.body as { active: boolean }
    const company = await toggleCompanyActive(id, active)
    return reply.send(company)
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
    const { active } = request.body as { active: boolean }
    const branch = await toggleBranchActive(branchId, active)
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
    const { active } = request.body as { active: boolean }
    const user = await toggleUserActive(userId, active)
    return reply.send(user)
  })

  // GET /companies/:id/customers — clientes da empresa
  app.get('/:id/customers', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const customers = await listCompanyCustomers(id)
    return reply.send(customers)
  })

  // GET /companies/:id/products — produtos da empresa
  app.get('/:id/products', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const products = await listCompanyProducts(id)
    return reply.send(products)
  })

  // GET /companies/:id/orders — pedidos da empresa
  app.get('/:id/orders', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const orders = await listCompanyOrders(id)
    return reply.send(orders)
  })
}
