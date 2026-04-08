import { FastifyInstance } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { syncProducts } from './sync.service'

export default async function syncRoutes(app: FastifyInstance) {
  // POST /sync/products — importa produtos do Protheus (ADMIN ou SUPERADMIN)
  app.post('/products', { preHandler: authenticate }, async (request, reply) => {
    const { companyId, role } = request.user as { companyId: string | null; role: string }

    if (role === 'SALESPERSON') {
      return reply.status(403).send({ message: 'Acesso negado' })
    }
    if (!companyId) {
      return reply.status(400).send({ message: 'Empresa não associada ao usuário' })
    }

    try {
      const result = await syncProducts(companyId)
      return reply.send(result)
    } catch (err) {
      app.log.error({ err }, 'Falha ao sincronizar produtos com Protheus')
      return reply.status(502).send({ message: 'Erro ao comunicar com o Protheus. Verifique as configurações da empresa.' })
    }
  })
}
