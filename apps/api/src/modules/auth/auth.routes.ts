import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { loginSchema } from './auth.schema'
import {
  loginUser,
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from './auth.service'
import { authenticate } from '../../middleware/authenticate'
import { prisma } from '@addere/db'

const COOKIE_NAME = 'refreshToken'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 dias em segundos

function cookieOptions(secure: boolean) {
  return {
    httpOnly: true,           // inacessível via JavaScript no cliente
    secure,                   // apenas HTTPS em produção
    sameSite: 'strict' as const,
    path: '/auth',            // cookie restrito às rotas de auth
    maxAge: COOKIE_MAX_AGE,
  }
}

export default async function authRoutes(app: FastifyInstance) {
  const isProduction = process.env.NODE_ENV === 'production'

  // POST /auth/login
  app.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const result = loginSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() })
    }

    try {
      const user = await loginUser(result.data)
      const refreshToken = await createRefreshToken(user.id)

      const accessToken = app.jwt.sign({ sub: user.id, email: user.email, role: user.role })

      reply.setCookie(COOKIE_NAME, refreshToken, cookieOptions(isProduction))

      return reply.send({
        accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        },
      })
    } catch (err) {
      return reply.status(401).send({ message: (err as Error).message })
    }
  })

  // POST /auth/refresh — emite novo access token usando o refresh token do cookie
  app.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[COOKIE_NAME]
    if (!token) {
      return reply.status(401).send({ message: 'Refresh token ausente' })
    }

    try {
      const { user, newToken } = await rotateRefreshToken(token)

      const accessToken = app.jwt.sign({ sub: user.id, email: user.email, role: user.role })

      reply.setCookie(COOKIE_NAME, newToken, cookieOptions(isProduction))

      return reply.send({ accessToken })
    } catch (err) {
      return reply.status(401).send({ message: (err as Error).message })
    }
  })

  // GET /auth/me — retorna o usuário autenticado
  app.get('/me', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    })
    if (!user) return reply.status(404).send({ message: 'Usuário não encontrado' })
    return reply.send(user)
  })

  // POST /auth/logout — revoga o refresh token e limpa o cookie
  app.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[COOKIE_NAME]
    if (token) {
      await revokeRefreshToken(token)
    }

    reply.clearCookie(COOKIE_NAME, { path: '/auth' })
    return reply.send({ message: 'Logout realizado com sucesso' })
  })
}
