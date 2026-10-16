// Modelos de contrato (plano 014, passo 6): só o SUPERADMIN, um rascunho por
// tipo, publicado não se edita, marca [[REVISAR]] impede publicar e a
// publicação arquiva a versão anterior na mesma transação.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { buildApp } from '../../../app'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const TPL_V1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const TPL_V2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const BASE = '/admin/billing/contract-templates'

let app: FastifyInstance
let tokens: Record<string, string>

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  tokens = {
    super: app.jwt.sign({ sub: 'super-1', email: 's@a.com', role: 'SUPERADMIN' }),
    adminA: app.jwt.sign({ sub: 'admin-a', email: 'a@a.com', role: 'ADMIN', companyId: COMPANY_A }),
  }
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  resetPrismaMock()
  prismaMock.user.findUnique.mockResolvedValue({ active: true })
  prismaMock.userPermission.findMany.mockResolvedValue([])
})

const auth = (who: keyof typeof tokens) => ({ authorization: `Bearer ${tokens[who]}` })

const template = (over: Record<string, unknown> = {}) => ({
  id: TPL_V2,
  kind: 'CONTRACT',
  version: 2,
  status: 'DRAFT',
  body: '# Contrato\n\n{{cliente.razaoSocial}}',
  changeNote: null,
  createdById: 'super-1',
  publishedAt: null,
  publishedById: null,
  createdAt: new Date('2026-10-16T12:00:00Z'),
  updatedAt: new Date('2026-10-16T12:00:00Z'),
  ...over,
})

describe('modelos — só o SUPERADMIN', () => {
  it.each([
    ['GET', BASE, undefined],
    ['GET', `${BASE}/${TPL_V2}`, undefined],
    ['POST', BASE, { kind: 'CONTRACT' }],
    ['PUT', `${BASE}/${TPL_V2}`, { body: 'x' }],
    ['POST', `${BASE}/${TPL_V2}/preview`, { companyId: COMPANY_A }],
    ['POST', `${BASE}/${TPL_V2}/publish`, undefined],
  ] as const)('ADMIN em %s %s → 403', async (method, url, payload) => {
    const res = await app.inject({ method, url, headers: auth('adminA'), payload })
    expect(res.statusCode).toBe(403)
    expect(prismaMock.contractTemplate.findMany).not.toHaveBeenCalled()
    expect(prismaMock.contractTemplate.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.contractTemplate.create).not.toHaveBeenCalled()
    expect(prismaMock.contractTemplate.updateMany).not.toHaveBeenCalled()
  })
})

describe('GET /', () => {
  it('lista as versões sem o corpo, com o nome de quem criou', async () => {
    prismaMock.contractTemplate.findMany.mockResolvedValue([
      template(),
      template({ id: TPL_V1, version: 1, status: 'PUBLISHED', createdById: null }),
    ])
    prismaMock.user.findMany.mockResolvedValue([{ id: 'super-1', name: 'Gustavo' }])
    const res = await app.inject({ method: 'GET', url: BASE, headers: auth('super') })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveLength(2)
    expect(body[0]).not.toHaveProperty('body')
    expect(body[0].createdByName).toBe('Gustavo')
    expect(body[1].createdByName).toBeNull()
    expect(prismaMock.contractTemplate.findMany.mock.calls[0][0].orderBy).toEqual([
      { kind: 'asc' },
      { version: 'desc' },
    ])
  })
})

describe('POST / — nova versão', () => {
  it('com rascunho aberto do mesmo tipo → 409 TEMPLATE_DRAFT_EXISTS', async () => {
    prismaMock.contractTemplate.findFirst.mockResolvedValueOnce({ version: 2 })
    const res = await app.inject({
      method: 'POST',
      url: BASE,
      headers: auth('super'),
      payload: { kind: 'CONTRACT' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('TEMPLATE_DRAFT_EXISTS')
    expect(prismaMock.contractTemplate.create).not.toHaveBeenCalled()
  })

  it('copia o corpo da maior versão, com versão + 1, e grava o evento global', async () => {
    const v1 = template({ id: TPL_V1, version: 1, status: 'PUBLISHED', body: 'corpo v1' })
    prismaMock.contractTemplate.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(v1)
    prismaMock.contractTemplate.create.mockResolvedValue(template({ body: 'corpo v1' }))
    const res = await app.inject({
      method: 'POST',
      url: BASE,
      headers: auth('super'),
      payload: { kind: 'CONTRACT' },
    })
    expect(res.statusCode).toBe(201)
    expect(prismaMock.contractTemplate.create).toHaveBeenCalledWith({
      data: {
        kind: 'CONTRACT',
        version: 2,
        status: 'DRAFT',
        body: 'corpo v1',
        createdById: 'super-1',
      },
    })
    expect(prismaMock.billingEvent.create).toHaveBeenCalledWith({
      data: {
        type: 'TEMPLATE_VERSION_CREATED',
        companyId: null,
        actorId: 'super-1',
        payload: { fields: [], templateKind: 'CONTRACT', templateVersion: 2 },
      },
    })
  })
})

describe('PUT /:id', () => {
  it('editar o PUBLISHED → 409 TEMPLATE_NOT_DRAFT', async () => {
    prismaMock.contractTemplate.findUnique.mockResolvedValue(template({ status: 'PUBLISHED' }))
    const res = await app.inject({
      method: 'PUT',
      url: `${BASE}/${TPL_V2}`,
      headers: auth('super'),
      payload: { body: 'novo' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('TEMPLATE_NOT_DRAFT')
    expect(prismaMock.contractTemplate.updateMany).not.toHaveBeenCalled()
  })

  it('grava LF mesmo recebendo CRLF, sem espaço nas pontas', async () => {
    prismaMock.contractTemplate.findUnique.mockResolvedValue(template())
    prismaMock.contractTemplate.updateMany.mockResolvedValue({ count: 1 })
    const res = await app.inject({
      method: 'PUT',
      url: `${BASE}/${TPL_V2}`,
      headers: auth('super'),
      payload: { body: '\r\n# Título\r\n\r\nTexto\r\n', changeNote: 'ajuste' },
    })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.contractTemplate.updateMany).toHaveBeenCalledWith({
      where: { id: TPL_V2, status: 'DRAFT' },
      data: { body: '# Título\n\nTexto', changeNote: 'ajuste' },
    })
  })
})

describe('POST /:id/publish', () => {
  it('com [[REVISAR: x]] → 422 com a lista e sem nenhuma escrita', async () => {
    prismaMock.contractTemplate.findUnique.mockResolvedValue(
      template({ body: '# Contrato\n\nTexto [[REVISAR: x]]' })
    )
    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/${TPL_V2}/publish`,
      headers: auth('super'),
    })
    expect(res.statusCode).toBe(422)
    expect(res.json()).toMatchObject({
      code: 'TEMPLATE_NOT_PUBLISHABLE',
      details: { issues: [{ type: 'REVIEW_MARKER', text: '[[REVISAR: x]]', line: 3 }] },
    })
    expect(prismaMock.contractTemplate.update).not.toHaveBeenCalled()
    expect(prismaMock.contractTemplate.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.billingEvent.create).not.toHaveBeenCalled()
  })

  it('publicado não se publica de novo → 409', async () => {
    prismaMock.contractTemplate.findUnique.mockResolvedValue(template({ status: 'PUBLISHED' }))
    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/${TPL_V2}/publish`,
      headers: auth('super'),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('TEMPLATE_NOT_DRAFT')
  })

  it('limpo: arquiva o anterior e publica, na mesma transação', async () => {
    prismaMock.contractTemplate.findUnique.mockResolvedValue(template())
    prismaMock.contractTemplate.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/${TPL_V2}/publish`,
      headers: auth('super'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id: TPL_V2, status: 'PUBLISHED', version: 2 })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    const [archive, publish] = prismaMock.contractTemplate.updateMany.mock.calls.map(
      (c: unknown[]) => c[0]
    )
    expect(archive).toEqual({
      where: { kind: 'CONTRACT', status: 'PUBLISHED' },
      data: { status: 'ARCHIVED' },
    })
    expect(publish.where).toEqual({ id: TPL_V2, status: 'DRAFT' })
    expect(publish.data).toMatchObject({ status: 'PUBLISHED', publishedById: 'super-1' })
    expect(prismaMock.billingEvent.create.mock.calls[0][0].data).toMatchObject({
      type: 'TEMPLATE_PUBLISHED',
      companyId: null,
      payload: { templateKind: 'CONTRACT', templateVersion: 2 },
    })
  })
})

describe('POST /:id/preview', () => {
  it('empresa inexistente → 404', async () => {
    prismaMock.contractTemplate.findUnique.mockResolvedValue(template())
    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/${TPL_V2}/preview`,
      headers: auth('super'),
      payload: { companyId: COMPANY_A },
    })
    expect(res.statusCode).toBe(404)
  })

  it('preenche com os dados da empresa e lista o que falta', async () => {
    prismaMock.contractTemplate.findUnique.mockResolvedValue(
      template({ body: 'Razão {{cliente.razaoSocial}} · CPF {{cliente.representanteCpf}}' })
    )
    prismaMock.company.findUnique.mockResolvedValue({
      cnpj: '12345678000190',
      clientProfile: { legalName: 'Empresa Exemplo Ltda', legalRepCpf: null },
      contract: null,
    })
    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/${TPL_V2}/preview`,
      headers: auth('super'),
      payload: { companyId: COMPANY_A },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      renderedBody: 'Razão Empresa Exemplo Ltda · CPF {{cliente.representanteCpf}}',
      missing: ['cliente.representanteCpf'],
      issues: [],
    })
  })
})
