import { FastifyInstance } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { syncProducts, syncCustomers } from './sync.service'

export default async function syncRoutes(app: FastifyInstance) {
  // POST /sync/products — importa produtos do Protheus (ADMIN ou SUPERADMIN)
  app.post('/products', { preHandler: authenticate }, async (request, reply) => {
    const { role } = request.user as { role: string }
    const { companyId } = (request.body ?? {}) as { companyId?: string }

    if (role === 'SALESPERSON') {
      return reply.status(403).send({ message: 'Acesso negado' })
    }
    if (!companyId) {
      return reply.status(400).send({ message: 'companyId é obrigatório' })
    }

    try {
      const result = await syncProducts(companyId)
      return reply.send(result)
    } catch (err) {
      app.log.error({ err }, 'Falha ao sincronizar produtos com Protheus')
      return reply.status(502).send({ message: 'Erro ao comunicar com o Protheus. Verifique as configurações da empresa.' })
    }
  })

  // POST /sync/customers — importa clientes do Protheus (ADMIN ou SUPERADMIN)
  app.post('/customers', { preHandler: authenticate }, async (request, reply) => {
    const { role } = request.user as { role: string }
    const { companyId } = (request.body ?? {}) as { companyId?: string }

    if (role === 'SALESPERSON') {
      return reply.status(403).send({ message: 'Acesso negado' })
    }
    if (!companyId) {
      return reply.status(400).send({ message: 'companyId é obrigatório' })
    }

    try {
      const result = await syncCustomers(companyId)
      return reply.send(result)
    } catch (err) {
      app.log.error({ err }, 'Falha ao sincronizar clientes com Protheus')
      return reply.status(502).send({ message: 'Erro ao comunicar com o Protheus. Verifique as configurações da empresa.' })
    }
  })
}
