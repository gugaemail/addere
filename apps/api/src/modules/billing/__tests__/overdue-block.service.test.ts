// Aviso, lembrete, bloqueio e liberação no agendador (plano 017, passo 4).
// Um banco falso em memória sobre o prismaMock deixa rodar vários ticks
// seguidos: o aviso gravado num tick é o que o tick de 10 dias depois lê. O
// envio de e-mail é mockado (o billing-mailer tem os testes dele); o resto é
// o código de verdade.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'

const { captureMock, thenRecordMock, onceMock, recipientsMock } = vi.hoisted(() => ({
  captureMock: vi.fn(),
  thenRecordMock: vi.fn(),
  onceMock: vi.fn(),
  recipientsMock: vi.fn(),
}))

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())
vi.mock('../../../lib/sentry', () => ({ captureError: captureMock, initSentry: vi.fn() }))
vi.mock('../billing-mailer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../billing-mailer')>()),
  sendBillingEmailThenRecord: thenRecordMock,
  sendBillingEmailOnce: onceMock,
  billingRecipients: recipientsMock,
}))

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { buildApp } from '../../../app'
import {
  reconcileOverdueBlocks,
  sendSuspensionNotices,
  sendSuspensionReminders,
} from '../overdue-block.service'

const COMPANY = '11111111-1111-4111-8111-111111111111'
const ADMIN = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'
const INV = 'f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6'
const INV_2 = 'e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5'
const NOTICE_KEY = `invoice:${INV}:suspension-notice`

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`) // @db.Date
const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`) // 09:00 em São Paulo
const addDays = (iso: string, days: number) =>
  new Date(day(iso).getTime() + days * 86_400_000).toISOString().slice(0, 10)

// ─── Banco falso ─────────────────────────────────────────────────────────────

interface FakeEvent {
  type: string
  companyId: string | null
  actorId: string | null
  payload: Record<string, unknown>
  dedupeKey: string | null
  createdAt: Date
}

interface FakeInvoice {
  id: string
  number: number
  companyId: string
  status: 'OPEN' | 'PAID' | 'CANCELLED'
  competence: Date
  dueDate: Date
  total: Prisma.Decimal
}

let clock: Date
let events: FakeEvent[]
let invoices: FakeInvoice[]
let company: {
  id: string
  name: string
  active: boolean
  accessBlockedAt: Date | null
  accessBlockReason: 'OVERDUE' | 'MANUAL' | null
  blockExemptUntil: Date | null
}
let settings: { autoBlockEnabled: boolean; overdueBlockDays: number }
let contractOverdueBlockDays: number | null
let sendOutcome: 'sent' | 'failed' | 'duplicate'

const invoice = (o: Partial<FakeInvoice> = {}): FakeInvoice => ({
  id: INV,
  number: 12,
  companyId: COMPANY,
  status: 'OPEN',
  competence: day('2026-09-01'),
  dueDate: day('2026-10-10'),
  total: new Prisma.Decimal('1990.00'),
  ...o,
})

function invoiceView(i: FakeInvoice) {
  return {
    ...i,
    company: {
      name: company.name,
      contract: { overdueBlockDays: contractOverdueBlockDays },
      blockExemptUntil: company.blockExemptUntil,
    },
  }
}

type InvoiceWhere = {
  companyId?: string
  status?: string
  total?: { gt: number }
  dueDate?: { lt: Date }
}

function matchInvoice(i: FakeInvoice, where: InvoiceWhere): boolean {
  if (where.companyId && i.companyId !== where.companyId) return false
  if (where.status && i.status !== where.status) return false
  if (where.total && !i.total.gt(where.total.gt)) return false
  if (where.dueDate && !(i.dueDate < where.dueDate.lt)) return false
  return true
}

function installFakeDb() {
  prismaMock.invoice.findMany.mockImplementation(async (args: { where: InvoiceWhere }) =>
    invoices.filter((i) => matchInvoice(i, args.where)).map(invoiceView)
  )
  prismaMock.invoice.findFirst.mockImplementation(async (args: { where: InvoiceWhere }) => {
    const found = invoices
      .filter((i) => matchInvoice(i, args.where))
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    return found[0] ? invoiceView(found[0]) : null
  })
  prismaMock.billingEvent.findMany.mockImplementation(
    async (args: { where: { dedupeKey: { in: string[] } } }) =>
      events.filter((e) => e.dedupeKey && args.where.dedupeKey.in.includes(e.dedupeKey))
  )
  prismaMock.billingEvent.findUnique.mockImplementation(
    async (args: { where: { dedupeKey: string } }) =>
      events.find((e) => e.dedupeKey === args.where.dedupeKey) ?? null
  )
  prismaMock.billingEvent.create.mockImplementation(
    async (args: { data: Omit<FakeEvent, 'createdAt' | 'dedupeKey'> & { dedupeKey?: string } }) => {
      events.push({ dedupeKey: null, ...args.data, createdAt: clock })
      return {}
    }
  )
  prismaMock.billingSettings.findUnique.mockImplementation(async () => settings)
  prismaMock.company.findUnique.mockImplementation(async () => company)
  prismaMock.company.findMany.mockImplementation(async () => [{ id: COMPANY }])
  prismaMock.company.updateMany.mockImplementation(
    async (args: {
      where: { invoices?: { some: { id: { in: string[] } } } }
      data: { accessBlockedAt: Date | null; accessBlockReason: 'OVERDUE' | null }
    }) => {
      if (args.data.accessBlockReason === 'OVERDUE') {
        const ids = args.where.invoices?.some.id.in ?? []
        const stillOpen = invoices.some((i) => ids.includes(i.id) && i.status === 'OPEN')
        if (company.accessBlockedAt !== null || !stillOpen) return { count: 0 }
      } else {
        const overdueOrNull =
          company.accessBlockReason === 'OVERDUE' || company.accessBlockReason === null
        if (company.accessBlockedAt === null || !overdueOrNull) return { count: 0 }
      }
      company.accessBlockedAt = args.data.accessBlockedAt
      company.accessBlockReason = args.data.accessBlockReason
      return { count: 1 }
    }
  )
  // O envio que grava depois: grava o evento só quando "o Resend aceitou"
  thenRecordMock.mockImplementation(
    async (input: {
      to: string[]
      dedupeKey: string
      eventType: string
      companyId: string
      payload: Record<string, unknown>
    }) => {
      if (input.to.length === 0) return 'skipped'
      if (sendOutcome !== 'sent') return sendOutcome
      if (events.some((e) => e.dedupeKey === input.dedupeKey)) return 'duplicate'
      events.push({
        type: input.eventType,
        companyId: input.companyId,
        actorId: null,
        payload: input.payload,
        dedupeKey: input.dedupeKey,
        createdAt: clock,
      })
      return 'sent'
    }
  )
  onceMock.mockImplementation(
    async (input: { dedupeKey: string; eventType: string; payload: Record<string, unknown> }) => {
      if (events.some((e) => e.dedupeKey === input.dedupeKey)) return 'duplicate'
      events.push({
        type: input.eventType,
        companyId: COMPANY,
        actorId: null,
        payload: input.payload,
        dedupeKey: input.dedupeKey,
        createdAt: clock,
      })
      return 'sent'
    }
  )
}

async function tick(iso: string) {
  clock = at(iso)
  const notices = await sendSuspensionNotices(clock)
  const reminders = await sendSuspensionReminders(clock)
  const blocks = await reconcileOverdueBlocks(clock)
  return { notices, reminders, blocks }
}

const eventsOf = (type: string) => events.filter((e) => e.type === type)

beforeEach(() => {
  resetPrismaMock()
  captureMock.mockReset()
  thenRecordMock.mockReset()
  onceMock.mockReset()
  recipientsMock.mockReset()
  recipientsMock.mockResolvedValue(['financeiro@cliente.test'])
  events = []
  invoices = [invoice()]
  company = {
    id: COMPANY,
    name: 'Distribuidora Exemplo',
    active: true,
    accessBlockedAt: null,
    accessBlockReason: null,
    blockExemptUntil: null,
  }
  settings = { autoBlockEnabled: true, overdueBlockDays: 15 }
  contractOverdueBlockDays = null
  sendOutcome = 'sent'
  installFakeDb()
})

// ─── Aviso ───────────────────────────────────────────────────────────────────

describe('aviso de suspensão', () => {
  it('sai no dia seguinte ao vencimento, com a data prevista no corpo, e não sai de novo', async () => {
    await tick('2026-10-10') // vence hoje: nada
    expect(thenRecordMock).not.toHaveBeenCalled()

    const first = await tick('2026-10-11')
    expect(first.notices.sent).toBe(1)
    expect(thenRecordMock).toHaveBeenCalledTimes(1)
    const input = thenRecordMock.mock.calls[0][0]
    expect(input.dedupeKey).toBe(NOTICE_KEY)
    expect(input.idempotencyKey).toBe(`${NOTICE_KEY}:20261025`)
    expect(input.eventType).toBe('SUSPENSION_NOTICE_SENT')
    expect(input.payload).toEqual({
      invoiceId: INV,
      invoiceNumber: 12,
      plannedBlockYmd: '20261025',
      recipients: 1,
    })
    expect(JSON.stringify(input.payload)).not.toContain('@')
    expect(input.html).toContain('será suspenso em <strong>25/10/2026</strong>')
    expect(input.subject).toBe('Aviso de suspensão do Addere — fatura nº 000012')

    await tick('2026-10-11')
    await tick('2026-10-12')
    expect(thenRecordMock).toHaveBeenCalledTimes(1)
    expect(eventsOf('SUSPENSION_NOTICE_SENT')).toHaveLength(1)
  })

  it('o overdueBlockDays do contrato vale sobre o padrão global', async () => {
    contractOverdueBlockDays = 20
    await tick('2026-10-11')
    expect(eventsOf('SUSPENSION_NOTICE_SENT')[0].payload.plannedBlockYmd).toBe('20261030')
  })

  it('fatura zerada não gera aviso', async () => {
    invoices = [invoice({ total: new Prisma.Decimal('0.00') })]
    await tick('2026-10-20')
    expect(thenRecordMock).not.toHaveBeenCalled()
  })

  it("envio 'failed' → nenhum evento de aviso, e nenhum bloqueio depois", async () => {
    sendOutcome = 'failed'
    for (let d = 1; d <= 40; d++) await tick(addDays('2026-10-10', d))
    expect(eventsOf('SUSPENSION_NOTICE_SENT')).toHaveLength(0)
    expect(company.accessBlockedAt).toBeNull()
    expect(eventsOf('ACCESS_BLOCKED')).toHaveLength(0)
  })

  it('sem destinatário → nenhum aviso, captureError com o companyId', async () => {
    recipientsMock.mockResolvedValue([])
    const { notices } = await tick('2026-10-11')
    expect(notices.skipped).toBe(1)
    expect(eventsOf('SUSPENSION_NOTICE_SENT')).toHaveLength(0)
    expect(captureMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Aviso de suspensão sem destinatário' }),
      expect.objectContaining({ companyId: COMPANY, invoiceId: INV })
    )
  })

  it('sem destinatário: Sentry e histórico uma vez por fatura, não a cada tick', async () => {
    recipientsMock.mockResolvedValue([])
    // 60 dias de ticks, como o agendador de hora em hora faria
    for (let d = 1; d <= 60; d++) await tick(addDays('2026-10-10', d))
    const noRecipient = eventsOf('SUSPENSION_NOTICE_NO_RECIPIENT')
    expect(noRecipient).toHaveLength(1)
    expect(noRecipient[0]).toMatchObject({
      companyId: COMPANY,
      actorId: null,
      dedupeKey: `invoice:${INV}:suspension-notice-no-recipient`,
      payload: { fields: [], invoiceId: INV, invoiceNumber: 12 },
    })
    const warned = captureMock.mock.calls.filter(
      ([err]) => (err as Error).message === 'Aviso de suspensão sem destinatário'
    )
    expect(warned).toHaveLength(1)
    // Continua sem aviso gravado e, sem aviso, sem bloqueio
    expect(eventsOf('SUSPENSION_NOTICE_SENT')).toHaveLength(0)
    expect(company.accessBlockedAt).toBeNull()
  })

  it('sem destinatário com dois ticks ao mesmo tempo: o P2002 do segundo não vai ao Sentry', async () => {
    recipientsMock.mockResolvedValue([])
    prismaMock.billingEvent.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
      })
    )
    const { notices } = await tick('2026-10-11')
    expect(notices.failed).toBe(0)
    expect(captureMock).not.toHaveBeenCalled()
  })

  it('sem destinatário em duas faturas: um aviso de cada', async () => {
    recipientsMock.mockResolvedValue([])
    invoices = [invoice(), invoice({ id: INV_2, number: 13 })]
    await tick('2026-10-11')
    await tick('2026-10-12')
    expect(eventsOf('SUSPENSION_NOTICE_NO_RECIPIENT').map((e) => e.payload.invoiceId)).toEqual([
      INV,
      INV_2,
    ])
    expect(captureMock).toHaveBeenCalledTimes(2)
  })

  it("sendBillingEmailThenRecord devolvendo 'duplicate' → o tick segue sem erro", async () => {
    sendOutcome = 'duplicate'
    const { notices, blocks } = await tick('2026-10-11')
    expect(notices.duplicate).toBe(1)
    expect(blocks.failed).toBe(0)
  })

  it('empresa desativada não recebe aviso', async () => {
    prismaMock.invoice.findMany.mockImplementation(
      async (args: { where: InvoiceWhere & { company?: { active: boolean } } }) =>
        args.where.company?.active === true
          ? []
          : invoices.filter((i) => matchInvoice(i, args.where)).map(invoiceView)
    )
    await tick('2026-10-11')
    expect(thenRecordMock).not.toHaveBeenCalled()
  })
})

// ─── Lembrete ────────────────────────────────────────────────────────────────

describe('lembrete', () => {
  it('sai uma vez, 3 dias antes da data prevista, pelo envio com reserva do 016', async () => {
    await tick('2026-10-11') // aviso: 25/10
    await tick('2026-10-21') // 4 dias antes: nada
    expect(onceMock).not.toHaveBeenCalled()
    await tick('2026-10-22') // 3 dias antes
    expect(onceMock).toHaveBeenCalledTimes(1)
    const input = onceMock.mock.calls[0][0]
    expect(input.dedupeKey).toBe(`invoice:${INV}:suspension-reminder`)
    expect(input.eventType).toBe('SUSPENSION_REMINDER_SENT')
    expect(input.subject).toBe('Lembrete: o acesso ao Addere será suspenso em 25/10/2026')
    await tick('2026-10-23')
    expect(onceMock).toHaveBeenCalledTimes(1)
  })

  it('liberação que cobre a data prevista: sem lembrete', async () => {
    await tick('2026-10-11')
    company.blockExemptUntil = day('2026-10-30')
    await tick('2026-10-22')
    expect(onceMock).not.toHaveBeenCalled()
  })
})

// ─── Bloqueio ────────────────────────────────────────────────────────────────

describe('bloqueio por atraso', () => {
  it('com overdueBlockDays = 3: data = envio + 10; vencimento + 4 e envio + 9 não bloqueiam; envio + 10 bloqueia', async () => {
    contractOverdueBlockDays = 3
    await tick('2026-10-11') // dia seguinte ao vencimento: o aviso
    expect(eventsOf('SUSPENSION_NOTICE_SENT')[0].payload.plannedBlockYmd).toBe('20261021')

    await tick('2026-10-14') // vencimento + 4 (já passou de vencimento + 3)
    expect(company.accessBlockedAt).toBeNull()
    await tick('2026-10-20') // envio + 9
    expect(company.accessBlockedAt).toBeNull()

    const { blocks } = await tick('2026-10-21') // envio + 10
    expect(blocks.blocked).toBe(1)
    expect(company.accessBlockReason).toBe('OVERDUE')
    expect(company.accessBlockedAt).toEqual(at('2026-10-21'))
    const blocked = eventsOf('ACCESS_BLOCKED')
    expect(blocked).toHaveLength(1)
    expect(blocked[0]).toMatchObject({
      actorId: null,
      payload: { reason: 'OVERDUE', invoiceIds: [INV] },
    })
  })

  it('nenhum tick bloqueia empresa sem evento de aviso, com 60 dias de atraso', async () => {
    contractOverdueBlockDays = 3
    for (let d = 1; d <= 60; d++) {
      clock = at(addDays('2026-10-10', d))
      await reconcileOverdueBlocks(clock) // só o bloqueio: nenhum aviso é enviado
    }
    expect(company.accessBlockedAt).toBeNull()
    expect(
      prismaMock.company.updateMany.mock.calls.some(
        (c: Array<{ data: { accessBlockReason?: string } }>) =>
          c[0].data.accessBlockReason === 'OVERDUE'
      )
    ).toBe(false)
  })

  it('autoBlockEnabled = false → nunca bloqueia, e libera um OVERDUE existente', async () => {
    settings.autoBlockEnabled = false
    await tick('2026-10-11')
    for (let d = 15; d <= 40; d++) await tick(addDays('2026-10-10', d))
    expect(company.accessBlockedAt).toBeNull()

    company.accessBlockedAt = at('2026-10-25')
    company.accessBlockReason = 'OVERDUE'
    const { blocks } = await tick('2026-11-21')
    expect(blocks.unblocked).toBe(1)
    expect(company.accessBlockedAt).toBeNull()
    expect(eventsOf('ACCESS_UNBLOCKED')[0]).toMatchObject({
      actorId: null,
      payload: { cause: 'RULE', previousReason: 'OVERDUE' },
    })
  })

  it('accessBlockedAt gravado sem motivo e sem aviso → o tick libera, previousReason OVERDUE', async () => {
    company.accessBlockedAt = at('2026-10-01')
    company.accessBlockReason = null
    clock = at('2026-10-11')
    const blocks = await reconcileOverdueBlocks(clock)
    expect(blocks.unblocked).toBe(1)
    expect(company.accessBlockedAt).toBeNull()
    expect(eventsOf('ACCESS_UNBLOCKED')[0].payload).toEqual({
      cause: 'RULE',
      previousReason: 'OVERDUE',
    })
    const unblockWhere = prismaMock.company.updateMany.mock.calls[0][0].where
    expect(unblockWhere.OR).toEqual([{ accessBlockReason: 'OVERDUE' }, { accessBlockReason: null }])
  })

  it('MANUAL gravado no mock (reservado, como se gravado à mão) com a fatura paga → continua MANUAL', async () => {
    invoices = [invoice({ status: 'PAID' })]
    company.accessBlockedAt = at('2026-10-01')
    company.accessBlockReason = 'MANUAL'
    await tick('2026-10-30')
    expect(company.accessBlockReason).toBe('MANUAL')
    expect(company.accessBlockedAt).toEqual(at('2026-10-01'))
    expect(prismaMock.company.updateMany).not.toHaveBeenCalled()
  })

  it('blockExemptUntil = hoje → não bloqueia; no dia seguinte, bloqueia', async () => {
    await tick('2026-10-11') // aviso: 25/10
    company.blockExemptUntil = day('2026-10-25')
    await tick('2026-10-25')
    expect(company.accessBlockedAt).toBeNull()
    await tick('2026-10-26')
    expect(company.accessBlockReason).toBe('OVERDUE')
  })

  it('aviso com payload sem data prevista não conta como aviso', async () => {
    events.push({
      type: 'SUSPENSION_NOTICE_SENT',
      companyId: COMPANY,
      actorId: null,
      payload: { invoiceId: INV },
      dedupeKey: NOTICE_KEY,
      createdAt: at('2026-10-11'),
    })
    clock = at('2026-11-30')
    await reconcileOverdueBlocks(clock)
    expect(company.accessBlockedAt).toBeNull()
  })

  it('uma empresa que falha não impede as outras e vai ao Sentry', async () => {
    prismaMock.company.findMany.mockResolvedValue([{ id: 'quebrada' }, { id: COMPANY }])
    prismaMock.company.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
      if (args.where.id === 'quebrada') throw new Error('drift')
      return company
    })
    company.accessBlockedAt = at('2026-10-01')
    clock = at('2026-10-11')
    const blocks = await reconcileOverdueBlocks(clock)
    expect(blocks).toEqual({ blocked: 0, unblocked: 1, unchanged: 0, failed: 1 })
    expect(captureMock).toHaveBeenCalledWith(expect.any(Error), {
      module: 'billing',
      op: 'reconcile-block',
      companyId: 'quebrada',
    })
  })
})

// ─── GET /billing/me/overdue ─────────────────────────────────────────────────

describe('GET /billing/me/overdue', () => {
  let app: FastifyInstance
  let token: string

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
    token = app.jwt.sign({
      sub: ADMIN,
      email: 'ana@example.com',
      role: 'ADMIN',
      companyId: COMPANY,
    })
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    prismaMock.user.findUnique.mockImplementation(async () => ({ active: true, company }))
  })

  const get = () =>
    app.inject({
      method: 'GET',
      url: '/billing/me/overdue',
      headers: { authorization: `Bearer ${token}` },
    })

  it('com a empresa bloqueada → 200 com a fatura e a data', async () => {
    await tick('2026-10-11')
    await tick('2026-10-25')
    expect(company.accessBlockReason).toBe('OVERDUE')

    const res = await get()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      access: { blocked: true, reason: 'OVERDUE' },
      blockedAt: at('2026-10-25').toISOString(),
      invoice: { id: INV, number: 12, competence: '2026-09', dueDate: '2026-10-10' },
      plannedBlockDate: '2026-10-25',
    })
  })

  it('sem fatura vencida → invoice e data nulas', async () => {
    invoices = []
    const res = await get()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      access: { blocked: false, reason: null },
      blockedAt: null,
      invoice: null,
      plannedBlockDate: null,
    })
  })

  it('vendedor leva 403 (a guarda é a do ADMIN), não COMPANY_BLOCKED', async () => {
    const sales = app.jwt.sign({
      sub: 'sales-1',
      email: 'v@example.com',
      role: 'SALESPERSON',
      companyId: COMPANY,
    })
    const res = await app.inject({
      method: 'GET',
      url: '/billing/me/overdue',
      headers: { authorization: `Bearer ${sales}` },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBeUndefined()
  })

  it('duas faturas vencidas: a faixa mostra a mais antiga', async () => {
    invoices = [
      invoice({ id: INV_2, number: 13, competence: day('2026-10-01'), dueDate: day('2026-10-15') }),
      invoice(),
    ]
    const res = await get()
    expect(res.json().invoice.number).toBe(12)
  })
})
