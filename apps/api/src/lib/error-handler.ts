import { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'
import { AppError } from './errors'

// Error handler global — formato único de erro: { message }. Services lançam
// AppError com o status; Zod e Prisma são mapeados aqui; o resto vira 500 sem
// vazar detalhes internos. Extraído de app.ts para ser testável isoladamente.
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ message: err.message })
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({ message: err.errors[0]?.message ?? 'Dados inválidos' })
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      const e = err as Prisma.PrismaClientKnownRequestError
      if (e.code === 'P2025') return reply.status(404).send({ message: 'Registro não encontrado' })
      if (e.code === 'P2002') return reply.status(409).send({ message: 'Registro duplicado' })
    }
    // Erros do próprio Fastify que já têm statusCode (validação, rate limit, payload)
    const statusCode = (err as { statusCode?: number }).statusCode
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({ message: (err as Error).message })
    }
    request.log.error({ err }, 'Erro não tratado')
    return reply.status(500).send({ message: 'Erro interno do servidor' })
  })

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({ message: 'Rota não encontrada' })
  })
}
