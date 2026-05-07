import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { authenticate, requireSuperAdmin } from '../../middleware/authenticate'
import {
  listCompanies,
  getCompanyById,
  createCompany,
  toggleCompanyActive,
  createBranch,
  updateBranch,
  toggleBranchActive,
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
  updateCompanyProtheus,
  getCompanyFieldConfig,
  updateCompanyFieldConfig,
} from './companies.service'
import { FIELD_REGISTRY_KEYS } from '@addere/types'

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
  name:       z.string().min(1),
  email:      z.string().email(),
  password:   z.string().min(8),
  role:       z.enum(['ADMIN', 'SALESPERSON']),
  idVendProt: z.string().optional().nullable(),
})

const toggleActiveSchema = z.object({
  active: z.boolean(),
})

const updateBranchSchema = z.object({
  name:        z.string().min(1).optional(),
  cnpj:        z.string().optional(),
  idProtheus:  z.string().optional(),
})

const updateUserSchema = z.object({
  name:       z.string().min(1).optional(),
  email:      z.string().email().optional(),
  password:   z.string().min(8).optional(),
  role:       z.enum(['ADMIN', 'SALESPERSON']).optional(),
  idVendProt: z.string().optional().nullable(),
})

const createCustomerSchema = z.object({
  name:         z.string().min(1),
  protheusCode: z.string().optional(),
  loja:         z.string().optional(),
  document:     z.string().optional(),
  email:        z.string().email().optional().or(z.literal('')),
  phone:        z.string().optional(),
  address:      z.string().optional(),
  municipio:    z.string().optional(),
  bairro:       z.string().optional(),
  cep:          z.string().optional(),
  uf:           z.string().optional(),
})

const updateCustomerSchema = createCustomerSchema.partial()

const createProductSchema = z.object({
  name:         z.string().min(1),
  protheusCode: z.string().optional(),
  description:  z.string().optional(),
  price:        z.number().min(0),
  unit:         z.string().optional(),
  stock:        z.number().min(0).optional(),
  saldo:        z.number().optional(),
})

const updateProductSchema = createProductSchema.partial()

const updateProtheusSchema = z.object({
  apiToken:     z.string().optional(),
  apiPord:      z.string().optional(),
  apiCliente:   z.string().optional(),
  apiPedido:    z.string().optional(),
  apiConsPed:   z.string().optional(),
  apiCondPag:   z.string().optional(),
  apiTransp:    z.string().optional(),
  apiMetaVend:  z.string().optional(),
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

  // PATCH /companies/:id/branches/:branchId — atualiza dados da filial
  app.patch('/:id/branches/:branchId', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, branchId } = request.params as { id: string; branchId: string }
    const result = updateBranchSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() })
    }
    try {
      const branch = await updateBranch(id, branchId, result.data)
      return reply.send(branch)
    } catch (err) {
      return reply.status(404).send({ message: (err as Error).message })
    }
  })

  // PATCH /companies/:id/branches/:branchId/active — ativa/desativa filial
  app.patch('/:id/branches/:branchId/active', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, branchId } = request.params as { id: string; branchId: string }
    const result = toggleActiveSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() })
    }
    try {
      const branch = await toggleBranchActive(id, branchId, result.data.active)
      return reply.send(branch)
    } catch (err) {
      return reply.status(404).send({ message: (err as Error).message })
    }
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

  // PATCH /companies/:id/users/:userId — atualiza dados do usuário
  app.patch('/:id/users/:userId', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, userId } = request.params as { id: string; userId: string }
    const result = updateUserSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() })
    }
    try {
      const user = await updateUser(id, userId, result.data)
      return reply.send(user)
    } catch (err) {
      return reply.status(422).send({ message: (err as Error).message })
    }
  })

  // PATCH /companies/:id/users/:userId/active — ativa/desativa usuário
  app.patch('/:id/users/:userId/active', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, userId } = request.params as { id: string; userId: string }
    const result = toggleActiveSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() })
    }
    try {
      const user = await toggleUserActive(id, userId, result.data.active)
      return reply.send(user)
    } catch (err) {
      return reply.status(404).send({ message: (err as Error).message })
    }
  })

  // GET /companies/:id/customers — clientes da empresa
  app.get('/:id/customers', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const { limit, page } = request.query as { limit?: string; page?: string }
    const customers = await listCompanyCustomers(id, limit ? Number(limit) : undefined, page ? Number(page) : undefined)
    return reply.send(customers)
  })

  // POST /companies/:id/customers — cria cliente
  app.post('/:id/customers', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const result = createCustomerSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() })
    }
    try {
      const customer = await createCustomer(id, result.data)
      return reply.status(201).send(customer)
    } catch (err) {
      return reply.status(422).send({ message: (err as Error).message })
    }
  })

  // PATCH /companies/:id/customers/:customerId — atualiza cliente
  app.patch('/:id/customers/:customerId', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, customerId } = request.params as { id: string; customerId: string }
    const result = updateCustomerSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() })
    }
    try {
      const customer = await updateCustomer(id, customerId, result.data)
      return reply.send(customer)
    } catch (err) {
      return reply.status(422).send({ message: (err as Error).message })
    }
  })

  // PATCH /companies/:id/customers/:customerId/active — ativa/desativa cliente
  app.patch('/:id/customers/:customerId/active', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, customerId } = request.params as { id: string; customerId: string }
    const result = toggleActiveSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() })
    }
    try {
      const customer = await toggleCustomerActive(id, customerId, result.data.active)
      return reply.send(customer)
    } catch (err) {
      return reply.status(404).send({ message: (err as Error).message })
    }
  })

  // GET /companies/:id/products — produtos da empresa
  app.get('/:id/products', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const { limit, page } = request.query as { limit?: string; page?: string }
    const products = await listCompanyProducts(id, limit ? Number(limit) : undefined, page ? Number(page) : undefined)
    return reply.send(products)
  })

  // POST /companies/:id/products — cria produto
  app.post('/:id/products', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const result = createProductSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() })
    }
    try {
      const product = await createProduct(id, result.data)
      return reply.status(201).send(product)
    } catch (err) {
      return reply.status(422).send({ message: (err as Error).message })
    }
  })

  // PATCH /companies/:id/products/:productId — atualiza produto
  app.patch('/:id/products/:productId', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, productId } = request.params as { id: string; productId: string }
    const result = updateProductSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() })
    }
    try {
      const product = await updateProduct(id, productId, result.data)
      return reply.send(product)
    } catch (err) {
      return reply.status(422).send({ message: (err as Error).message })
    }
  })

  // PATCH /companies/:id/products/:productId/active — ativa/desativa produto
  app.patch('/:id/products/:productId/active', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, productId } = request.params as { id: string; productId: string }
    const result = toggleActiveSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() })
    }
    try {
      const product = await toggleProductActive(id, productId, result.data.active)
      return reply.send(product)
    } catch (err) {
      return reply.status(404).send({ message: (err as Error).message })
    }
  })

  // GET /companies/:id/orders — pedidos da empresa
  app.get('/:id/orders', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const { limit, page } = request.query as { limit?: string; page?: string }
    const orders = await listCompanyOrders(id, limit ? Number(limit) : undefined, page ? Number(page) : undefined)
    return reply.send(orders)
  })

  // PATCH /companies/:id/orders/:orderId/cancel — cancela pedido
  app.patch('/:id/orders/:orderId/cancel', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, orderId } = request.params as { id: string; orderId: string }
    try {
      const order = await cancelOrder(id, orderId)
      return reply.send(order)
    } catch (err) {
      return reply.status(422).send({ message: (err as Error).message })
    }
  })

  // GET /companies/:id/field-config — retorna config de visibilidade de uma empresa (superadmin)
  app.get('/:id/field-config', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const config = await getCompanyFieldConfig(id)
    return reply.send(config)
  })

  // GET /companies/me/field-config — retorna config de visibilidade da empresa do usuário logado
  app.get('/me/field-config', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { companyId } = request.user
    if (!companyId) return reply.send({ hidden: [] })
    const config = await getCompanyFieldConfig(companyId)
    return reply.send(config)
  })

  // PATCH /companies/:id/field-config — admin atualiza visibilidade de campos da empresa
  app.patch('/:id/field-config', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { hidden?: unknown }
    if (!Array.isArray(body.hidden)) {
      return reply.status(400).send({ message: 'Campo "hidden" deve ser um array de strings' })
    }
    const invalidKeys = (body.hidden as string[]).filter((k) => !FIELD_REGISTRY_KEYS.has(k))
    if (invalidKeys.length > 0) {
      return reply.status(400).send({ message: `Chaves inválidas: ${invalidKeys.join(', ')}` })
    }
    const config = await updateCompanyFieldConfig(id, body.hidden as string[])
    return reply.send(config)
  })
}
