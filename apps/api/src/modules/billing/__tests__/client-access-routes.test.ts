// Liberar pela ficha do cliente (plano 017, passo 5): só "Liberar até…", só o
// SUPERADMIN, com a data entre hoje e hoje + 90 (São Paulo). A rota de
// bloqueio manual não existe. A ficha devolve o estado do acesso, e a lista
// mostra BLOCKED para empresa bloqueada por atraso e para empresa inativa.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

const { sendMock, recipientsMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  recipientsMock: vi.fn(),
}))

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())
vi.mock('../billing-mailer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../billing-mailer')>()),
  sendBillingEmail: sendMock,
  billingRecipients: recipientsMock,
}))

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { buildApp } from '../../../app'
import { dateToIsoDay, todaySaoPaulo } from '../competence'
import { addDaysYmd, dateToYmdUtc, ymdToDate } from '../../intelligence/engine/business-days'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const COMPANY_B = '22222222-2222-4222-8222-222222222222'
const INV = 'f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6'

// Hoje em São Paulo e os vizinhos, pelo mesmo relógio da API
const todayYmd = () => dateToYmdUtc(todaySaoPaulo(new Date()))
const shiftDay = (days: number) => dateToIsoDay(ymdToDate(addDaysYmd(todayYmd(), days)))

let app: FastifyInstance
let tokens: Record<string, string>

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  tokens = {
    super: app.jwt.sign({ sub: 'super-1', email: 's@example.com', role: 'SUPERADMIN' }),
    admin: app.jwt.sign({
      sub: 'admin-a',
      email: 'a@example.com',
      role: 'ADMIN',
      companyId: COMPANY_A,
    }),
  }
})

afterAll(async () => {
  await app.close()
})

const companyState = (o: Record<string, unknown> = {}) => ({
  id: COMPANY_A,
  name: 'Distribuidora Exemplo',
  cnpj: '12.345.678/0001-90',
  idProtheus: '01',
  active: true,
  createdAt: new Date('2026-10-01T12:00:00Z'),
  accessBlockedAt: null,
  accessBlockReason: null,
  blockExemptUntil: null,
  clientProfile: null,
  contract: null,
  ...o,
})

const OVERDUE = { accessBlockedAt: new Date('2026-10-25T12:00:00Z'), accessBlockReason: 'OVERDUE' }

beforeEach(() => {
  resetPrismaMock()
  sendMock.mockReset()
  sendMock.mockResolvedValue(true)
  recipientsMock.mockReset()
  recipientsMock.mockResolvedValue(['financeiro@cliente.test', 'ana@cliente.test'])
  // O SUPERADMIN do token passa pelo authenticate sem empresa
  prismaMock.user.findUnique.mockResolvedValue({ active: true })
  prismaMock.company.findUnique.mockResolvedValue(companyState(OVERDUE))
})

const auth = (who: keyof typeof tokens) => ({ authorization: `Bearer ${tokens[who]}` })
const unblock = (payload: object, who: keyof typeof tokens = 'super') =>
  app.inject({
    method: 'POST',
    url: `/admin/billing/clients/${COMPANY_A}/unblock`,
    headers: auth(who),
    payload,
  })

describe('o bloqueio manual não existe', () => {
  it('POST /admin/billing/clients/:companyId/block → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/billing/clients/${COMPANY_A}/block`,
      headers: auth('super'),
      payload: { note: 'teste' },
    })
    expect(res.statusCode).toBe(404)
    expect(prismaMock.company.update).not.toHaveBeenCalled()
    expect(prismaMock.company.updateMany).not.toHaveBeenCalled()
  })
})

describe('POST /admin/billing/clients/:companyId/unblock', () => {
  it('ADMIN chamando o unblock → 403, sem escrita', async () => {
    const res = await unblock({}, 'admin')
    expect(res.statusCode).toBe(403)
    expect(prismaMock.company.update).not.toHaveBeenCalled()
  })

  it('until no passado ou além de 90 dias → 400 com a faixa válida', async () => {
    for (const until of [shiftDay(-1), shiftDay(91)]) {
      const res = await unblock({ until })
      expect(res.statusCode, until).toBe(400)
      expect(res.json().code).toBe('UNBLOCK_UNTIL_OUT_OF_RANGE')
      expect(res.json().message).toMatch(/^Escolha uma data entre \d{2}\/\d{2}\/\d{4} e /)
    }
    expect(prismaMock.company.update).not.toHaveBeenCalled()
  })

  it('until fora do formato → 400', async () => {
    const res = await unblock({ until: '31/12/2026' })
    expect(res.statusCode).toBe(400)
  })

  it('liberar com until grava a data e o evento com o autor, e manda o e-mail', async () => {
    const until = shiftDay(90)
    const res = await unblock({ until })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    const data = prismaMock.company.update.mock.calls[0][0].data
    expect(data.accessBlockedAt).toBeNull()
    expect(data.accessBlockReason).toBeNull()
    expect(dateToIsoDay(data.blockExemptUntil)).toBe(until)
    expect(prismaMock.billingEvent.create).toHaveBeenCalledWith({
      data: {
        type: 'ACCESS_UNBLOCKED',
        companyId: COMPANY_A,
        actorId: 'super-1',
        payload: { previousReason: 'OVERDUE', until },
      },
    })
    // Um e-mail por destinatário
    expect(sendMock).toHaveBeenCalledTimes(2)
    expect(sendMock.mock.calls[0][0].subject).toMatch(/^Acesso ao Addere liberado até /)
    expect(res.json().emailSent).toBe(true)
  })

  it('liberar hoje também vale (o limite de baixo é inclusivo)', async () => {
    const res = await unblock({ until: shiftDay(0) })
    expect(res.statusCode).toBe(200)
  })

  it('falha no envio não desfaz a liberação: emailSent false', async () => {
    sendMock.mockResolvedValue(false)
    const res = await unblock({ until: shiftDay(7) })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.company.update).toHaveBeenCalledTimes(1)
    expect(res.json().emailSent).toBe(false)
  })

  it('liberar sem until uma empresa OVERDUE → limpa o bloqueio e apaga a liberação', async () => {
    const res = await unblock({})
    expect(res.statusCode).toBe(200)
    expect(prismaMock.company.update.mock.calls[0][0].data).toEqual({
      accessBlockedAt: null,
      accessBlockReason: null,
      blockExemptUntil: null,
    })
    expect(prismaMock.billingEvent.create.mock.calls[0][0].data.payload).toEqual({
      previousReason: 'OVERDUE',
      until: null,
    })
    // Sem data, nenhum e-mail a enviar
    expect(sendMock).not.toHaveBeenCalled()
    expect(res.json().emailSent).toBeNull()
  })

  it('liberar um MANUAL gravado no mock (reservado, gravado à mão) → limpa', async () => {
    prismaMock.company.findUnique.mockResolvedValue(
      companyState({
        accessBlockedAt: new Date('2026-10-01T12:00:00Z'),
        accessBlockReason: 'MANUAL',
      })
    )
    const res = await unblock({})
    expect(res.statusCode).toBe(200)
    expect(prismaMock.company.update.mock.calls[0][0].data).toMatchObject({
      accessBlockedAt: null,
      accessBlockReason: null,
    })
    expect(prismaMock.billingEvent.create.mock.calls[0][0].data.payload.previousReason).toBe(
      'MANUAL'
    )
  })

  it('empresa liberada e sem until → 409 "Nada a liberar"', async () => {
    prismaMock.company.findUnique.mockResolvedValue(companyState())
    const res = await unblock({})
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('NOTHING_TO_UNBLOCK')
    expect(prismaMock.company.update).not.toHaveBeenCalled()
  })

  it('empresa liberada com until → funciona (liberação antecipada)', async () => {
    prismaMock.company.findUnique.mockResolvedValue(companyState())
    const res = await unblock({ until: shiftDay(10) })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.billingEvent.create.mock.calls[0][0].data.payload.previousReason).toBeNull()
  })

  it('cliente inexistente → 404', async () => {
    prismaMock.company.findUnique.mockResolvedValue(null)
    const res = await unblock({ until: shiftDay(1) })
    expect(res.statusCode).toBe(404)
  })

  it('nenhum caminho grava MANUAL', async () => {
    await unblock({ until: shiftDay(5) })
    expect(JSON.stringify(prismaMock.company.update.mock.calls)).not.toContain('MANUAL')
  })
})

describe('ficha do cliente: o cartão "Acesso"', () => {
  it('devolve block com o aviso pendente', async () => {
    prismaMock.company.findUnique.mockResolvedValue(companyState())
    prismaMock.invoice.findFirst.mockResolvedValue({
      id: INV,
      number: 12,
      competence: new Date('2026-09-01T00:00:00Z'),
      dueDate: new Date('2026-10-10T00:00:00Z'),
    })
    prismaMock.billingEvent.findUnique.mockResolvedValue({
      createdAt: new Date('2026-10-11T12:00:00Z'),
      payload: { invoiceId: INV, plannedBlockYmd: '20261025' },
    })
    const res = await app.inject({
      method: 'GET',
      url: `/admin/billing/clients/${COMPANY_A}`,
      headers: auth('super'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().block).toEqual({
      companyActive: true,
      blockedAt: null,
      reason: null,
      exemptUntil: null,
      pendingNotice: {
        invoiceId: INV,
        invoiceNumber: 12,
        sentAt: '2026-10-11T12:00:00.000Z',
        plannedBlockDate: '2026-10-25',
      },
    })
    expect(prismaMock.billingEvent.findUnique.mock.calls[0][0].where).toEqual({
      dedupeKey: `invoice:${INV}:suspension-notice`,
    })
  })

  it('bloqueada por atraso e liberação vencida: reason OVERDUE e exemptUntil nulo', async () => {
    prismaMock.company.findUnique.mockResolvedValue(
      companyState({ ...OVERDUE, blockExemptUntil: ymdToDate(addDaysYmd(todayYmd(), -1)) })
    )
    const res = await app.inject({
      method: 'GET',
      url: `/admin/billing/clients/${COMPANY_A}`,
      headers: auth('super'),
    })
    expect(res.json().block).toMatchObject({
      reason: 'OVERDUE',
      blockedAt: '2026-10-25T12:00:00.000Z',
      exemptUntil: null,
    })
    expect(res.json().status).toBe('BLOCKED')
  })

  it('liberação vigente aparece', async () => {
    const until = addDaysYmd(todayYmd(), 3)
    prismaMock.company.findUnique.mockResolvedValue(
      companyState({ blockExemptUntil: ymdToDate(until) })
    )
    const res = await app.inject({
      method: 'GET',
      url: `/admin/billing/clients/${COMPANY_A}`,
      headers: auth('super'),
    })
    expect(res.json().block.exemptUntil).toBe(shiftDay(3))
  })
})

describe('lista de clientes: a situação usa o acesso', () => {
  it('BLOCKED para empresa bloqueada por atraso e para empresa inativa', async () => {
    prismaMock.company.findMany.mockResolvedValue([
      companyState({ ...OVERDUE }),
      companyState({ id: COMPANY_B, active: false }),
      companyState({ id: 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3' }),
    ])
    const res = await app.inject({
      method: 'GET',
      url: '/admin/billing/clients',
      headers: auth('super'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().map((c: { status: string }) => c.status)).toEqual([
      'BLOCKED',
      'BLOCKED',
      'NO_CONTRACT',
    ])
    // O select traz o acesso, mas a resposta não expõe os campos crus
    expect(prismaMock.company.findMany.mock.calls[0][0].select).toMatchObject({
      active: true,
      accessBlockedAt: true,
      accessBlockReason: true,
    })
    expect(res.json()[0]).not.toHaveProperty('accessBlockedAt')
  })
})
