import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { registerErrorHandling } from '../error-handler'
import { AppError, notFound, unprocessable } from '../errors'

let app: FastifyInstance

beforeAll(async () => {
  app = Fastify({ logger: false })
  registerErrorHandling(app)

  app.get('/app-error', async () => { throw notFound('Recurso não encontrado') })
  app.get('/unprocessable', async () => { throw unprocessable('Regra de negócio violada') })
  app.get('/zod', async () => { z.object({ x: z.string() }).parse({}) })
  app.get('/generic', async () => { throw new Error('detalhe interno sensível') })
  app.get('/custom-status', async () => {
    throw Object.assign(new Error('payload muito grande'), { statusCode: 413 })
  })

  await app.ready()
})

afterAll(() => app.close())

describe('error handler global', () => {
  it('converte AppError no status e formato { message }', async () => {
    const res = await app.inject({ method: 'GET', url: '/app-error' })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ message: 'Recurso não encontrado' })
  })

  it('converte AppError 422', async () => {
    const res = await app.inject({ method: 'GET', url: '/unprocessable' })
    expect(res.statusCode).toBe(422)
    expect(res.json()).toEqual({ message: 'Regra de negócio violada' })
  })

  it('converte ZodError em 400 com a primeira mensagem', async () => {
    const res = await app.inject({ method: 'GET', url: '/zod' })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toBeTruthy()
  })

  it('erro genérico vira 500 sem vazar a mensagem interna', async () => {
    const res = await app.inject({ method: 'GET', url: '/generic' })
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({ message: 'Erro interno do servidor' })
    expect(res.body).not.toContain('sensível')
  })

  it('respeita statusCode 4xx de erros do próprio Fastify', async () => {
    const res = await app.inject({ method: 'GET', url: '/custom-status' })
    expect(res.statusCode).toBe(413)
  })

  it('rota inexistente responde 404 { message }', async () => {
    const res = await app.inject({ method: 'GET', url: '/nao-existe' })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ message: 'Rota não encontrada' })
  })

  it('AppError expõe statusCode', () => {
    expect(new AppError(409, 'x').statusCode).toBe(409)
  })
})
