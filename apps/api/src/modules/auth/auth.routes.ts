import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { loginSchema, forgotPasswordSchema, resetPasswordSchema } from './auth.schema'
import {
  loginUser,
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  forgotPassword,
  resetPassword,
} from './auth.service'
import { authenticate } from '../../middleware/authenticate'
import { prisma } from '@addere/db'

const COOKIE_NAME = 'refreshToken'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 dias em segundos

function cookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    // Em produção (HTTPS): SameSite=None para permitir cross-origin entre
    // addere-web.vercel.app e addere-api.onrender.com.
    // Em desenvolvimento (HTTP): SameSite=Strict (same-origin apenas).
    sameSite: (secure ? 'none' : 'strict') as 'none' | 'strict',
    path: '/auth',
    maxAge: COOKIE_MAX_AGE,
  }
}

export default async function authRoutes(app: FastifyInstance) {
  const isProduction = process.env.NODE_ENV === 'production'

  // POST /auth/login — rate limit: 10 tentativas por minuto por IP
  app.post('/login', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
        errorResponseBuilder: () => ({ message: 'Muitas tentativas. Aguarde 1 minuto e tente novamente.' }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = loginSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() })
    }

    try {
      const user = await loginUser(result.data)
      const refreshToken = await createRefreshToken(user.id)

      const accessToken = app.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
      })

      reply.setCookie(COOKIE_NAME, refreshToken, cookieOptions(isProduction))

      return reply.send({
        accessToken,
        refreshToken, // mobile persiste no SecureStore para biometria
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          createdAt: user.createdAt,
        },
      })
    } catch (err) {
      return reply.status(401).send({ message: (err as Error).message })
    }
  })

  // POST /auth/refresh — rate limit: 30 tentativas por minuto por IP
  app.post('/refresh', {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute',
        errorResponseBuilder: () => ({ message: 'Muitas tentativas. Aguarde 1 minuto e tente novamente.' }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Cookie (web) tem prioridade; body (mobile/biometria) é fallback
    const bodyToken = (request.body as { refreshToken?: string } | null)?.refreshToken
    const token = request.cookies[COOKIE_NAME] ?? bodyToken
    if (!token) {
      return reply.status(401).send({ message: 'Refresh token ausente' })
    }

    try {
      const { user, newToken } = await rotateRefreshToken(token)

      const accessToken = app.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
      })

      reply.setCookie(COOKIE_NAME, newToken, cookieOptions(isProduction))

      return reply.send({ accessToken, refreshToken: newToken })
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

  // POST /auth/forgot-password — envia email de redefinição de senha
  app.post('/forgot-password', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '5 minutes',
        errorResponseBuilder: () => ({ message: 'Muitas tentativas. Aguarde 5 minutos e tente novamente.' }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = forgotPasswordSchema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ message: 'Email inválido' })

    try {
      await forgotPassword(result.data.email)
    } catch (err) {
      app.log.error(err, '[auth] forgotPassword falhou')
    }
    // Sempre retorna sucesso para não revelar se e-mail existe ou se ocorreu erro
    return reply.send({ message: 'Se o e-mail estiver cadastrado, você receberá as instruções em breve.' })
  })

  // POST /auth/reset-password — redefine a senha com o token recebido por e-mail
  app.post('/reset-password', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '5 minutes',
        errorResponseBuilder: () => ({ message: 'Muitas tentativas. Aguarde 5 minutos e tente novamente.' }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = resetPasswordSchema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ message: 'Dados inválidos' })

    try {
      await resetPassword(result.data.token, result.data.newPassword)
      return reply.send({ message: 'Senha redefinida com sucesso.' })
    } catch (err) {
      return reply.status(400).send({ message: (err as Error).message })
    }
  })

  // POST /auth/logout — revoga o refresh token e limpa o cookie
  app.post('/logout', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
        errorResponseBuilder: () => ({ message: 'Muitas tentativas. Aguarde 1 minuto e tente novamente.' }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[COOKIE_NAME]
    if (token) {
      await revokeRefreshToken(token)
    }

    reply.clearCookie(COOKIE_NAME, { path: '/auth' })
    return reply.send({ message: 'Logout realizado com sucesso' })
  })
}
