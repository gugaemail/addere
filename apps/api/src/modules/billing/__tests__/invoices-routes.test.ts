// Rotas de faturas (plano 016, passo 8): só o SUPERADMIN opera; fatura paga
// é imutável em todas as rotas que mexem em valor (D4); cancelada não muda; o
// recálculo nunca apaga item manual; total negativo não é gravado; a avulsa
// respeita D3; e o ADMIN do cliente lê as próprias faturas sem os campos
// internos.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'

const { tickMock } = vi.hoisted(() => ({ tickMock: vi.fn() }))

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())
vi.mock('../jobs/billing-scheduler', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../jobs/billing-scheduler')>()),
  tickBillingScheduler: tickMock,
}))

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { buildApp } from '../../../app'
import {
  addMonthsYm,
  competenceAt,
  competenceStart,
  dateToIsoDay,
  todaySaoPaulo,
  ymToIso,
} from '../competence'
import { addDaysYmd, dateToYmdUtc, ymdToDate } from '../../intelligence/engine/business-days'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const INV = 'f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6'
const ITEM_AUTO = 'a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7'
const ITEM_MANUAL = 'b8b8b8b8-b8b8-4b8b-8b8b-b8b8b8b8b8b8'

const dec = (v: string) => new Prisma.Decimal(v)
const date = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`)
const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: '5.22.0' })

// Hoje em São Paulo e os vizinhos, pelo mesmo relógio da API
const today = () => todaySaoPaulo(new Date())
const shiftDay = (days: number) => dateToIsoDay(ymdToDate(addDaysYmd(dateToYmdUtc(today()), days)))
const currentYm = () => competenceAt(new Date())

function item(o: Record<string, unknown> = {}) {
  return {
    id: ITEM_AUTO,
    kind: 'PACKAGE',
    description: 'Pacote 20 — Com Inteligência (20 licenças)',
    quantity: 1,
    unitPrice: dec('1990.00'),
    amount: dec('1990.00'),
    manual: false,
    createdById: null,
    createdAt: new Date('2026-11-01T03:30:00Z'),
    invoiceId: INV,
    ...o,
  }
}

function invoiceRow(o: Record<string, unknown> = {}) {
  return {
    id: INV,
    number: 124,
    companyId: COMPANY_A,
    competence: date('2026-10-01'),
    dueDate: date('2026-11-10'),
    status: 'OPEN',
    origin: 'JOB',
    termsId: 'terms-1',
    total: dec('1990.00'),
    paidAt: null,
    paidAmount: null,
    paymentMethod: null,
    paymentNote: null,
    paidById: null,
    paidByName: null,
    nfNumber: null,
    notes: null,
    cancelledAt: null,
    cancelledById: null,
    cancelledByName: null,
    cancelReason: null,
    createdById: null,
    createdAt: new Date('2026-11-01T03:30:00Z'),
    updatedAt: new Date('2026-11-01T03:30:00Z'),
    company: { name: 'Distribuidora Exemplo' },
    items: [item()],
    ...o,
  }
}

function contractRow(packagePrice = '1990.00', firstBilledCompetence = date('2026-08-01')) {
  return {
    id: 'contract-1',
    companyId: COMPANY_A,
    status: 'ACTIVE',
    firstBilledCompetence,
    endsAt: null,
    dueDay: 10,
    terms: [
      {
        id: 'terms-2',
        status: 'EFFECTIVE',
        effectiveFrom: new Date('2026-07-15T15:00:00Z'),
        version: 1,
        licenseType: 'INTELLIGENCE',
        includedSeats: 20,
        extraSeats: 0,
        packagePrice: dec(packagePrice),
        extraSeatPrice: dec('49.90'),
        package: { name: 'Pacote 20' },
      },
    ],
  }
}

let app: FastifyInstance
let tokens: Record<string, string>

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  tokens = {
    super: app.jwt.sign({ sub: 'super-1', email: 's@a.com', role: 'SUPERADMIN' }),
    adminA: app.jwt.sign({ sub: 'admin-a', email: 'a@a.com', role: 'ADMIN', companyId: COMPANY_A }),
    salesA: app.jwt.sign({
      sub: 'sales-a',
      email: 'v@a.com',
      role: 'SALESPERSON',
      companyId: COMPANY_A,
    }),
  }
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  resetPrismaMock()
  tickMock.mockReset()
  // O authenticate lê `active`; a baixa e o cancelamento leem o nome
  prismaMock.user.findUnique.mockResolvedValue({ active: true, name: 'Super Addere' })
  prismaMock.invoice.updateMany.mockResolvedValue({ count: 1 })
})

const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` })

type Inject = { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; url: string; payload?: object }

const MUTATIONS: Inject[] = [
  { method: 'POST', url: `/admin/billing/invoices/${INV}/recalculate` },
  {
    method: 'POST',
    url: `/admin/billing/invoices/${INV}/pay`,
    payload: { paidAt: '2026-11-01', amount: '1990.00', method: 'PIX' },
  },
  { method: 'POST', url: `/admin/billing/invoices/${INV}/cancel`, payload: { reason: 'Engano' } },
  {
    method: 'POST',
    url: `/admin/billing/invoices/${INV}/items`,
    payload: { kind: 'ADJUSTMENT', description: 'Ajuste de setembro', amount: '0.10' },
  },
  { method: 'DELETE', url: `/admin/billing/invoices/${INV}/items/${ITEM_MANUAL}` },
]

function call(req: Inject, who = 'super') {
  return app.inject({ ...req, headers: auth(who) })
}

function expectNoValueWrite() {
  expect(prismaMock.invoice.updateMany).not.toHaveBeenCalled()
  expect(prismaMock.invoice.update).not.toHaveBeenCalled()
  expect(prismaMock.invoiceItem.create).not.toHaveBeenCalled()
  expect(prismaMock.invoiceItem.createMany).not.toHaveBeenCalled()
  expect(prismaMock.invoiceItem.deleteMany).not.toHaveBeenCalled()
}

describe('acesso', () => {
  const ALL: Inject[] = [
    { method: 'GET', url: '/admin/billing/invoices' },
    { method: 'GET', url: `/admin/billing/invoices/${INV}` },
    { method: 'POST', url: '/admin/billing/invoices', payload: {} },
    ...MUTATIONS,
    { method: 'PATCH', url: `/admin/billing/invoices/${INV}`, payload: { nfNumber: '1043' } },
    { method: 'POST', url: '/admin/billing/jobs/run' },
  ]

  it('ADMIN e vendedor levam 403 em todas as rotas de /admin/billing/invoices e no jobs/run', async () => {
    for (const who of ['adminA', 'salesA']) {
      for (const req of ALL) {
        const res = await call(req, who)
        expect(res.statusCode, `${who} ${req.method} ${req.url}`).toBe(403)
      }
    }
    expect(prismaMock.invoice.findMany).not.toHaveBeenCalled()
    expect(tickMock).not.toHaveBeenCalled()
  })

  it('SUPERADMIN lista', async () => {
    const res = await call({ method: 'GET', url: '/admin/billing/invoices' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ items: [], total: 0, page: 1, pageSize: 50 })
  })
})

describe('lista e filtros', () => {
  it('status=OVERDUE: em aberto com vencimento antes de hoje (São Paulo)', async () => {
    await call({ method: 'GET', url: '/admin/billing/invoices?status=OVERDUE' })
    const args = prismaMock.invoice.findMany.mock.calls[0][0]
    expect(args.where).toEqual({ status: 'OPEN', dueDate: { lt: today() } })
    expect(args.orderBy).toEqual([{ dueDate: 'desc' }, { number: 'desc' }])
  })

  it('status=OPEN: em aberto e a vencer (vencimento >= hoje)', async () => {
    await call({ method: 'GET', url: '/admin/billing/invoices?status=OPEN' })
    expect(prismaMock.invoice.findMany.mock.calls[0][0].where).toEqual({
      status: 'OPEN',
      dueDate: { gte: today() },
    })
  })

  it('competência, cliente e página', async () => {
    await call({
      method: 'GET',
      url: `/admin/billing/invoices?status=PAID&competence=2026-10&companyId=${COMPANY_A}&page=2&pageSize=10`,
    })
    const args = prismaMock.invoice.findMany.mock.calls[0][0]
    expect(args.where).toEqual({
      status: 'PAID',
      competence: date('2026-10-01'),
      companyId: COMPANY_A,
    })
    expect(args).toMatchObject({ skip: 10, take: 10 })
  })

  it('pageSize acima de 100: 400', async () => {
    const res = await call({ method: 'GET', url: '/admin/billing/invoices?pageSize=500' })
    expect(res.statusCode).toBe(400)
  })

  it('o DTO leva datas de calendário em YYYY-MM-DD, competência em YYYY-MM e a vencida derivada', async () => {
    prismaMock.invoice.findMany.mockResolvedValue([
      invoiceRow({ dueDate: date('2026-01-10'), competence: date('2025-12-01') }),
    ])
    prismaMock.invoice.count.mockResolvedValue(1)
    const res = await call({ method: 'GET', url: '/admin/billing/invoices' })
    const [dto] = res.json().items
    expect(dto).toMatchObject({
      number: 124,
      competence: '2025-12',
      dueDate: '2026-01-10',
      status: 'OPEN',
      displayStatus: 'OVERDUE',
      total: '1990.00',
      companyName: 'Distribuidora Exemplo',
    })
    expect(dto.items[0]).toMatchObject({ unitPrice: '1990.00', amount: '1990.00', manual: false })
  })
})

describe('fatura paga é imutável (D4)', () => {
  beforeEach(() => {
    prismaMock.invoice.findUnique.mockResolvedValue(
      invoiceRow({ status: 'PAID', paidAt: date('2026-11-05'), paidAmount: dec('1990.00') })
    )
  })

  it('recalcular, dar baixa, cancelar, lançar e remover item: 409 INVOICE_PAID_IMMUTABLE, sem escrita', async () => {
    for (const req of MUTATIONS) {
      const res = await call(req)
      expect(res.statusCode, `${req.method} ${req.url}`).toBe(409)
      expect(res.json().code).toBe('INVOICE_PAID_IMMUTABLE')
    }
    expectNoValueWrite()
    expect(prismaMock.billingEvent.create).not.toHaveBeenCalled()
  })

  it('NF e observação mudam (PATCH 200), e o data só leva esses campos', async () => {
    const res = await call({
      method: 'PATCH',
      url: `/admin/billing/invoices/${INV}`,
      payload: { nfNumber: '1043' },
    })
    expect(res.statusCode).toBe(200)
    const args = prismaMock.invoice.updateMany.mock.calls[0][0]
    expect(args.where).toEqual({ id: INV, status: { in: ['OPEN', 'PAID'] } })
    expect(args.data).toEqual({ nfNumber: '1043' })
    expect(prismaMock.billingEvent.create.mock.calls[0][0].data).toMatchObject({
      type: 'INVOICE_UPDATED',
      payload: { fields: ['nfNumber'] },
    })
  })
})

describe('fatura cancelada', () => {
  beforeEach(() => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoiceRow({ status: 'CANCELLED' }))
  })

  it('as mesmas rotas e o PATCH: 409 INVOICE_CANCELLED', async () => {
    for (const req of [
      ...MUTATIONS,
      { method: 'PATCH' as const, url: `/admin/billing/invoices/${INV}`, payload: { notes: 'x' } },
    ]) {
      const res = await call(req)
      expect(res.statusCode, `${req.method} ${req.url}`).toBe(409)
      expect(res.json().code).toBe('INVOICE_CANCELLED')
    }
    expectNoValueWrite()
  })

  it('mudou no meio (o updateMany não acha OPEN): relê e lança o código do status atual', async () => {
    prismaMock.invoice.findUnique
      .mockResolvedValueOnce(invoiceRow()) // a leitura antes da transação
      .mockResolvedValueOnce({ status: 'PAID' }) // a releitura depois do updateMany
    prismaMock.invoice.updateMany.mockResolvedValue({ count: 0 })
    const res = await call(MUTATIONS[3])
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('INVOICE_PAID_IMMUTABLE')
    expect(prismaMock.invoiceItem.create).not.toHaveBeenCalled()
  })
})

describe('recálculo', () => {
  it('apaga só os automáticos, recria pelos termos da competência e preserva o manual', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(
      invoiceRow({
        total: dec('1890.00'),
        items: [
          item(),
          item({ id: ITEM_MANUAL, kind: 'DISCOUNT', amount: dec('-100.00'), manual: true }),
        ],
      })
    )
    prismaMock.companyContract.findUnique.mockResolvedValue(contractRow('2200.00'))
    prismaMock.invoiceItem.findMany.mockResolvedValue([{ amount: dec('-100.00') }])

    const res = await call(MUTATIONS[0])
    expect(res.statusCode).toBe(200)
    expect(prismaMock.invoiceItem.findMany.mock.calls[0][0].where).toEqual({
      invoiceId: INV,
      manual: true,
    })
    // O deleteMany nunca recebe filtro que alcance item manual
    expect(prismaMock.invoiceItem.deleteMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.invoiceItem.deleteMany.mock.calls[0][0]).toEqual({
      where: { invoiceId: INV, manual: false },
    })
    const created = prismaMock.invoiceItem.createMany.mock.calls[0][0].data
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({ kind: 'PACKAGE', manual: false, invoiceId: INV })
    expect(created[0].amount.toFixed(2)).toBe('2200.00')
    const update = prismaMock.invoice.update.mock.calls[0][0]
    expect(update.data.total.toFixed(2)).toBe('2100.00')
    expect(update.data).not.toHaveProperty('dueDate')
    expect(prismaMock.billingEvent.create.mock.calls[0][0].data.type).toBe('INVOICE_RECALCULATED')
  })

  it('competência que não é mais cobrável fica sem itens automáticos', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoiceRow())
    prismaMock.companyContract.findUnique.mockResolvedValue(
      contractRow('2200.00', date('2026-12-01'))
    )
    prismaMock.invoiceItem.findMany.mockResolvedValue([])
    const res = await call(MUTATIONS[0])
    expect(res.statusCode).toBe(200)
    expect(prismaMock.invoiceItem.createMany).not.toHaveBeenCalled()
    expect(prismaMock.invoice.update.mock.calls[0][0].data.total.toFixed(2)).toBe('0.00')
  })

  it('total negativo: 422 e nada apagado', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoiceRow())
    prismaMock.companyContract.findUnique.mockResolvedValue(contractRow('100.00'))
    prismaMock.invoiceItem.findMany.mockResolvedValue([{ amount: dec('-500.00') }])
    const res = await call(MUTATIONS[0])
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('INVOICE_NEGATIVE_TOTAL')
    expect(prismaMock.invoiceItem.deleteMany).not.toHaveBeenCalled()
  })
})

describe('baixa (D5)', () => {
  const pay = (payload: object) =>
    call({ method: 'POST', url: `/admin/billing/invoices/${INV}/pay`, payload })

  it('grava data, valor, forma, quem deu a baixa e o evento', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoiceRow())
    const res = await pay({ paidAt: shiftDay(0), amount: '1990.10', method: 'PIX', note: 'Juros' })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.invoice.updateMany.mock.calls[0][0].where).toEqual({
      id: INV,
      status: 'OPEN',
    })
    const data = prismaMock.invoice.update.mock.calls[0][0].data
    expect(data).toMatchObject({
      status: 'PAID',
      paymentMethod: 'PIX',
      paymentNote: 'Juros',
      paidById: 'super-1',
      paidByName: 'Super Addere',
    })
    expect(dateToIsoDay(data.paidAt)).toBe(shiftDay(0))
    expect(data.paidAmount.toFixed(2)).toBe('1990.10')
    const event = prismaMock.billingEvent.create.mock.calls[0][0].data
    expect(event).toMatchObject({ type: 'INVOICE_PAID', actorId: 'super-1' })
    expect(JSON.stringify(event)).not.toContain('1990.10')
  })

  it('pagamento com data de amanhã: 422 PAID_AT_IN_FUTURE', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoiceRow())
    const res = await pay({ paidAt: shiftDay(1), amount: '1990.00', method: 'PIX' })
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('PAID_AT_IN_FUTURE')
    expect(prismaMock.invoice.update).not.toHaveBeenCalled()
  })

  it('forma de pagamento fora da lista: 400', async () => {
    const res = await pay({ paidAt: shiftDay(0), amount: '1990.00', method: 'CHEQUE' })
    expect(res.statusCode).toBe(400)
  })
})

describe('itens manuais', () => {
  const addItem = (payload: object) =>
    call({ method: 'POST', url: `/admin/billing/invoices/${INV}/items`, payload })

  it('desconto chega positivo e é gravado negativo, com o total refeito', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoiceRow())
    prismaMock.invoiceItem.findMany.mockResolvedValue([{ amount: dec('1990.00') }])
    prismaMock.invoiceItem.create.mockResolvedValue({ id: ITEM_MANUAL })
    const res = await addItem({
      kind: 'DISCOUNT',
      description: 'Crédito por indisponibilidade',
      amount: '100',
    })
    expect(res.statusCode).toBe(201)
    const created = prismaMock.invoiceItem.create.mock.calls[0][0].data
    expect(created).toMatchObject({ kind: 'DISCOUNT', manual: true, createdById: 'super-1' })
    expect(created.amount.toFixed(2)).toBe('-100.00')
    expect(prismaMock.invoice.update.mock.calls[0][0].data.total.toFixed(2)).toBe('1890.00')
  })

  it('desconto maior que o total: 422 INVOICE_NEGATIVE_TOTAL e nada gravado', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoiceRow())
    prismaMock.invoiceItem.findMany.mockResolvedValue([{ amount: dec('1990.00') }])
    const res = await addItem({
      kind: 'DISCOUNT',
      description: 'Desconto grande',
      amount: '2000.00',
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('INVOICE_NEGATIVE_TOTAL')
    expect(prismaMock.invoiceItem.create).not.toHaveBeenCalled()
    expect(prismaMock.invoice.update).not.toHaveBeenCalled()
  })

  it('desconto com sinal ou valor zero: 400', async () => {
    expect(
      (await addItem({ kind: 'DISCOUNT', description: 'Desconto', amount: '-10' })).statusCode
    ).toBe(400)
    expect(
      (await addItem({ kind: 'ADJUSTMENT', description: 'Ajuste', amount: '0.00' })).statusCode
    ).toBe(400)
  })

  it('ajuste negativo devolve', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoiceRow())
    prismaMock.invoiceItem.findMany.mockResolvedValue([{ amount: dec('1990.00') }])
    prismaMock.invoiceItem.create.mockResolvedValue({ id: ITEM_MANUAL })
    await addItem({ kind: 'ADJUSTMENT', description: 'Diferença de setembro', amount: '-0.10' })
    expect(prismaMock.invoiceItem.create.mock.calls[0][0].data.amount.toFixed(2)).toBe('-0.10')
  })

  it('remover item automático: 409 INVOICE_ITEM_NOT_MANUAL', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoiceRow())
    prismaMock.invoiceItem.findMany.mockResolvedValue([
      { id: ITEM_AUTO, amount: dec('1990.00'), manual: false },
    ])
    const res = await call({
      method: 'DELETE',
      url: `/admin/billing/invoices/${INV}/items/${ITEM_AUTO}`,
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('INVOICE_ITEM_NOT_MANUAL')
    expect(prismaMock.invoiceItem.deleteMany).not.toHaveBeenCalled()
  })

  it('remover item manual (D9): só ele, e o total refeito', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoiceRow())
    prismaMock.invoiceItem.findMany.mockResolvedValue([
      { id: ITEM_AUTO, amount: dec('1990.00'), manual: false },
      { id: ITEM_MANUAL, amount: dec('-100.00'), manual: true },
    ])
    const res = await call(MUTATIONS[4])
    expect(res.statusCode).toBe(200)
    expect(prismaMock.invoiceItem.deleteMany.mock.calls[0][0]).toEqual({
      where: { id: ITEM_MANUAL, invoiceId: INV, manual: true },
    })
    expect(prismaMock.invoice.update.mock.calls[0][0].data.total.toFixed(2)).toBe('1990.00')
  })
})

describe('cancelar (D1)', () => {
  it('OPEN → CANCELLED com motivo e quem cancelou', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoiceRow())
    const res = await call(MUTATIONS[2])
    expect(res.statusCode).toBe(200)
    expect(prismaMock.invoice.update.mock.calls[0][0].data).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'Engano',
      cancelledById: 'super-1',
      cancelledByName: 'Super Addere',
    })
  })
})

describe('fatura avulsa (D3)', () => {
  const previousIso = () => ymToIso(addMonthsYm(currentYm(), -1))
  const create = (payload: object) =>
    call({ method: 'POST', url: '/admin/billing/invoices', payload })
  const base = () => ({
    companyId: COMPANY_A,
    competence: previousIso(),
    dueDate: shiftDay(5),
    useContractTerms: false,
    items: [
      { kind: 'ADJUSTMENT', description: 'Licença de uso — mês anterior', amount: '1990.00' },
    ],
  })

  beforeEach(() => {
    prismaMock.company.findUnique.mockResolvedValue({ id: COMPANY_A })
    prismaMock.invoice.create.mockResolvedValue({ id: INV, number: 125 })
  })

  it('competência do mês corrente: 422 COMPETENCE_NOT_PAST', async () => {
    const res = await create({ ...base(), competence: ymToIso(currentYm()) })
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('COMPETENCE_NOT_PAST')
    expect(prismaMock.invoice.create).not.toHaveBeenCalled()
  })

  it('competência ocupada: 409 INVOICE_ALREADY_EXISTS com o número', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue({ id: 'inv-old', number: 7 })
    const res = await create(base())
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({
      code: 'INVOICE_ALREADY_EXISTS',
      details: { invoiceId: 'inv-old', number: 7 },
    })
    expect(prismaMock.invoice.create).not.toHaveBeenCalled()
  })

  it('vencimento ontem: 422 DUE_DATE_IN_PAST', async () => {
    const res = await create({ ...base(), dueDate: shiftDay(-1) })
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('DUE_DATE_IN_PAST')
  })

  it('pacote do contrato antes da primeira competência cobrada: 422 COMPETENCE_NOT_BILLABLE', async () => {
    prismaMock.companyContract.findUnique.mockResolvedValue(
      contractRow('1990.00', competenceStart(currentYm()))
    )
    const res = await create({ ...base(), useContractTerms: true, items: [] })
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('COMPETENCE_NOT_BILLABLE')
  })

  it('P2002 no create: 409 INVOICE_ALREADY_EXISTS, não o "Registro duplicado" genérico', async () => {
    prismaMock.invoice.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'inv-race', number: 126 })
    prismaMock.invoice.create.mockRejectedValue(p2002())
    const res = await create(base())
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('INVOICE_ALREADY_EXISTS')
    expect(res.json().message).not.toBe('Registro duplicado')
  })

  it('sem item e sem o pacote do contrato: 400', async () => {
    const res = await create({ ...base(), items: [] })
    expect(res.statusCode).toBe(400)
  })

  it('com o pacote do contrato: itens automáticos, os manuais, origin MANUAL e quem criou', async () => {
    prismaMock.companyContract.findUnique.mockResolvedValue(contractRow('1990.00'))
    prismaMock.invoice.findUnique.mockResolvedValueOnce(null).mockResolvedValue(invoiceRow())
    const res = await create({
      ...base(),
      useContractTerms: true,
      items: [{ kind: 'DISCOUNT', description: 'Crédito por indisponibilidade', amount: '10.00' }],
      notes: 'Mês anterior ao sistema',
    })
    expect(res.statusCode).toBe(201)
    const data = prismaMock.invoice.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      origin: 'MANUAL',
      status: 'OPEN',
      createdById: 'super-1',
      termsId: 'terms-2',
      notes: 'Mês anterior ao sistema',
    })
    expect(data.items.create.map((i: { kind: string }) => i.kind)).toEqual(['PACKAGE', 'DISCOUNT'])
    expect(data.total.toFixed(2)).toBe('1980.00')
    expect(prismaMock.billingEvent.create.mock.calls[0][0].data.type).toBe('INVOICE_CREATED')
  })
})

describe('GET /billing/me/invoices (ADMIN do cliente)', () => {
  it('busca pelo companyId do token e não devolve os campos internos', async () => {
    prismaMock.invoice.findMany.mockResolvedValue([
      invoiceRow({
        status: 'PAID',
        paidAt: date('2026-11-08'),
        paidAmount: dec('1990.00'),
        paymentNote: 'pago via Pix',
        paidByName: 'Super Addere',
        notes: 'observação interna',
        nfNumber: '1043',
      }),
    ])
    const res = await call({ method: 'GET', url: '/billing/me/invoices' }, 'adminA')
    expect(res.statusCode).toBe(200)
    expect(prismaMock.invoice.findMany.mock.calls[0][0].where).toEqual({ companyId: COMPANY_A })
    const [dto] = res.json()
    expect(dto).toMatchObject({
      number: 124,
      competence: '2026-10',
      dueDate: '2026-11-10',
      displayStatus: 'PAID',
      paidAt: '2026-11-08',
      nfNumber: '1043',
    })
    for (const key of ['notes', 'cancelReason', 'paidByName', 'paymentNote', 'cancelledByName']) {
      expect(dto).not.toHaveProperty(key)
    }
    expect(res.body).not.toContain('observação interna')
  })

  it('vendedor e SUPERADMIN: 403', async () => {
    for (const who of ['salesA', 'super']) {
      const res = await call({ method: 'GET', url: '/billing/me/invoices' }, who)
      expect(res.statusCode).toBe(403)
    }
    expect(prismaMock.invoice.findMany).not.toHaveBeenCalled()
  })
})

describe('POST /admin/billing/jobs/run', () => {
  it('roda o tick agora e devolve o resumo', async () => {
    const summary = {
      invoices: { competence: '2026-10', created: 2, existing: 1, skipped: 0, failed: 0 },
      contractsEnded: 0,
      dueReminders: { sent: 0, duplicate: 0, skipped: 0, failed: 0 },
      documentReminders: { sent: 0, duplicate: 0, skipped: 0, failed: 0 },
      errors: [],
    }
    tickMock.mockResolvedValue(summary)
    const res = await call({ method: 'POST', url: '/admin/billing/jobs/run' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual(summary)
    expect(tickMock).toHaveBeenCalledTimes(1)
  })
})

// ─── Plano 017: a baixa e o cancelamento liberam na mesma transação ─────────

describe('baixa e cancelamento liberam o bloqueio por atraso (plano 017)', () => {
  const INV_2 = 'e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5'
  const pay = () =>
    call({
      method: 'POST',
      url: `/admin/billing/invoices/${INV}/pay`,
      payload: { paidAt: shiftDay(0), amount: '1990.00', method: 'PIX' },
    })
  const blockedCompany = (reason: 'OVERDUE' | 'MANUAL' | null = 'OVERDUE') => ({
    accessBlockedAt: new Date('2026-10-25T12:00:00Z'),
    accessBlockReason: reason,
    blockExemptUntil: null,
  })

  // Conta o que aconteceu DENTRO da chamada de $transaction da baixa
  let insideTx: { paid: number; companyWrites: number } | null
  beforeEach(() => {
    insideTx = null
    prismaMock.invoice.findUnique.mockResolvedValue(invoiceRow())
    prismaMock.billingSettings.findUnique.mockResolvedValue({ autoBlockEnabled: true })
    prismaMock.company.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
      const result = await fn(prismaMock)
      insideTx = {
        paid: prismaMock.invoice.update.mock.calls.length,
        companyWrites: prismaMock.company.updateMany.mock.calls.length,
      }
      return result
    })
  })

  it('baixa de empresa OVERDUE: libera dentro da mesma $transaction que marca PAID', async () => {
    prismaMock.company.findUnique.mockResolvedValue(blockedCompany())
    // Depois do PAID, a transação não acha mais fatura em aberto vencida
    prismaMock.invoice.findMany.mockResolvedValue([])
    const res = await pay()
    expect(res.statusCode).toBe(200)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(insideTx).toEqual({ paid: 1, companyWrites: 1 })
    expect(prismaMock.company.updateMany.mock.calls[0][0]).toEqual({
      where: {
        id: COMPANY_A,
        accessBlockedAt: { not: null },
        OR: [{ accessBlockReason: 'OVERDUE' }, { accessBlockReason: null }],
      },
      data: { accessBlockedAt: null, accessBlockReason: null },
    })
    const unblocked = prismaMock.billingEvent.create.mock.calls
      .map((c: Array<{ data: { type: string } }>) => c[0].data)
      .find((d: { type: string }) => d.type === 'ACCESS_UNBLOCKED')
    expect(unblocked).toEqual({
      type: 'ACCESS_UNBLOCKED',
      companyId: COMPANY_A,
      actorId: 'super-1',
      payload: { cause: 'PAYMENT', previousReason: 'OVERDUE' },
    })
  })

  it('com outra fatura ainda qualificando, continua bloqueada', async () => {
    prismaMock.company.findUnique.mockResolvedValue(blockedCompany())
    prismaMock.invoice.findMany.mockResolvedValue([{ id: INV_2, status: 'OPEN' }])
    // Aviso da outra fatura enviado há 20 dias, com a data prevista há 5
    prismaMock.billingEvent.findMany.mockResolvedValue([
      {
        dedupeKey: `invoice:${INV_2}:suspension-notice`,
        createdAt: new Date(Date.now() - 20 * 86_400_000),
        payload: { plannedBlockYmd: addDaysYmd(dateToYmdUtc(today()), -5) },
      },
    ])
    const res = await pay()
    expect(res.statusCode).toBe(200)
    expect(insideTx).toEqual({ paid: 1, companyWrites: 0 })
    expect(prismaMock.company.updateMany).not.toHaveBeenCalled()
  })

  it('MANUAL gravado no mock (reservado) → continua bloqueada', async () => {
    prismaMock.company.findUnique.mockResolvedValue(blockedCompany('MANUAL'))
    const res = await pay()
    expect(res.statusCode).toBe(200)
    expect(prismaMock.company.updateMany).not.toHaveBeenCalled()
  })

  it('cancelar a fatura de empresa OVERDUE libera, com a causa INVOICE_CANCELLED', async () => {
    prismaMock.company.findUnique.mockResolvedValue(blockedCompany())
    const res = await call(MUTATIONS[2])
    expect(res.statusCode).toBe(200)
    expect(insideTx).toEqual({ paid: 1, companyWrites: 1 })
    const unblocked = prismaMock.billingEvent.create.mock.calls
      .map((c: Array<{ data: { type: string; payload: unknown } }>) => c[0].data)
      .find((d: { type: string }) => d.type === 'ACCESS_UNBLOCKED')
    expect(unblocked.payload).toEqual({ cause: 'INVOICE_CANCELLED', previousReason: 'OVERDUE' })
  })
})
