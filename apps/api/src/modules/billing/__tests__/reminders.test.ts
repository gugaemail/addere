// Lembretes do faturamento (plano 016, passo 7; D11): a janela do vencimento
// em datas de São Paulo, um envio só por dedupeKey e o lembrete do documento
// pendente depois de 72 h, para o administrador indicado.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Prisma } from '@prisma/client'

const { sendMock, envMock, captureMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  captureMock: vi.fn(),
  envMock: {
    RESEND_API_KEY: 're_test' as string | undefined,
    NODE_ENV: 'test',
    WEB_URL: 'https://painel.test',
  },
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock }
  },
}))
vi.mock('../../../lib/env', () => ({ env: envMock }))
vi.mock('../../../lib/sentry', () => ({ captureError: captureMock }))
vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { sendDueReminders, sendPendingDocumentReminders } from '../jobs/reminders'

const date = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`)
const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: '5.22.0' })

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    number: 124,
    companyId: 'company-1',
    competence: date('2026-10-01'),
    dueDate: date('2026-11-10'),
    total: new Prisma.Decimal('2139.80'),
    company: { name: 'Distribuidora Exemplo' },
    items: [
      {
        description: 'Pacote 20 — Com Inteligência (20 licenças)',
        amount: new Prisma.Decimal('2139.80'),
      },
    ],
    ...overrides,
  }
}

const ADMIN = {
  id: 'admin-1',
  name: 'Ana',
  email: 'ana@cliente.test',
  role: 'ADMIN',
  active: true,
  companyId: 'company-1',
}

function document(designatedAdmin: object | null, overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    kind: 'CONTRACT',
    companyId: 'company-1',
    contract: { designatedAdmin },
    ...overrides,
  }
}

beforeEach(() => {
  resetPrismaMock()
  sendMock.mockReset()
  sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
  captureMock.mockReset()
  envMock.RESEND_API_KEY = 're_test'
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('sendDueReminders', () => {
  it('janela [hoje, hoje + N] em São Paulo, só OPEN e com total > 0', async () => {
    prismaMock.billingSettings.findUnique.mockResolvedValue({ dueReminderDays: 5 })
    // 22h de 06/11 em São Paulo (07/11 01h UTC): hoje ainda é 06/11
    await sendDueReminders(new Date('2026-11-07T01:00:00Z'))
    expect(prismaMock.invoice.findMany.mock.calls[0][0].where).toEqual({
      status: 'OPEN',
      total: { gt: 0 },
      dueDate: { gte: date('2026-11-06'), lte: date('2026-11-11') },
    })
  })

  it('sem a linha de regras, usa o padrão de 3 dias', async () => {
    await sendDueReminders(new Date('2026-11-07T15:00:00Z'))
    expect(prismaMock.invoice.findMany.mock.calls[0][0].where.dueDate).toEqual({
      gte: date('2026-11-07'),
      lte: date('2026-11-10'),
    })
  })

  it('envia para o contato de cobrança e os ADMINs, com o dedupeKey da fatura', async () => {
    prismaMock.invoice.findMany.mockResolvedValue([invoice()])
    prismaMock.clientProfile.findUnique.mockResolvedValue({
      billingEmail: 'financeiro@cliente.test',
    })
    prismaMock.user.findMany.mockResolvedValue([{ email: 'ana@cliente.test' }])
    const summary = await sendDueReminders(new Date('2026-11-07T15:00:00Z'))
    expect(summary).toEqual({ sent: 1, duplicate: 0, skipped: 0, failed: 0 })
    const reservation = prismaMock.billingEvent.create.mock.calls[0][0].data
    expect(reservation).toMatchObject({
      type: 'INVOICE_DUE_REMINDER_SENT',
      dedupeKey: 'invoice:inv-1:due-reminder',
      actorId: null,
      payload: { invoiceId: 'inv-1', invoiceNumber: 124 },
    })
    const [payload, options] = sendMock.mock.calls[0]
    expect(options).toEqual({ idempotencyKey: 'invoice:inv-1:due-reminder' })
    expect(payload.to).toEqual(['financeiro@cliente.test', 'ana@cliente.test'])
    expect(payload.subject).toBe('Fatura do Addere vence em 10/11/2026')
  })

  it('segundo tick: P2002 na reserva, nenhum send', async () => {
    prismaMock.invoice.findMany.mockResolvedValue([invoice()])
    prismaMock.user.findMany.mockResolvedValue([{ email: 'ana@cliente.test' }])
    prismaMock.billingEvent.create.mockRejectedValue(p2002())
    const summary = await sendDueReminders(new Date('2026-11-08T15:00:00Z'))
    expect(summary).toEqual({ sent: 0, duplicate: 1, skipped: 0, failed: 0 })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('sem RESEND_API_KEY: skipped, sem reserva, e um aviso só por chamada', async () => {
    envMock.RESEND_API_KEY = undefined
    prismaMock.invoice.findMany.mockResolvedValue([invoice(), invoice({ id: 'inv-2' })])
    prismaMock.user.findMany.mockResolvedValue([{ email: 'ana@cliente.test' }])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const summary = await sendDueReminders(new Date('2026-11-07T15:00:00Z'))
    expect(summary.skipped).toBe(2)
    expect(prismaMock.billingEvent.create).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('erro de banco numa fatura vai ao Sentry e não para as outras', async () => {
    prismaMock.invoice.findMany.mockResolvedValue([invoice(), invoice({ id: 'inv-2' })])
    prismaMock.user.findMany.mockResolvedValue([{ email: 'ana@cliente.test' }])
    prismaMock.billingEvent.create
      .mockRejectedValueOnce(new Error('falha'))
      .mockResolvedValueOnce({})
    const summary = await sendDueReminders(new Date('2026-11-07T15:00:00Z'))
    expect(summary).toEqual({ sent: 1, duplicate: 0, skipped: 0, failed: 1 })
    expect(captureMock).toHaveBeenCalledTimes(1)
  })
})

describe('sendPendingDocumentReminders', () => {
  it('só documentos SENT há 72 h ou mais', async () => {
    const now = new Date('2026-11-10T12:00:00Z')
    await sendPendingDocumentReminders(now)
    expect(prismaMock.contractDocument.findMany.mock.calls[0][0].where).toEqual({
      status: 'SENT',
      sentAt: { lte: new Date('2026-11-07T12:00:00Z') },
    })
  })

  it('vai para o administrador indicado, com o dedupeKey do documento', async () => {
    prismaMock.contractDocument.findMany.mockResolvedValue([document(ADMIN)])
    const summary = await sendPendingDocumentReminders(new Date('2026-11-10T12:00:00Z'))
    expect(summary.sent).toBe(1)
    expect(prismaMock.billingEvent.create.mock.calls[0][0].data).toMatchObject({
      type: 'DOCUMENT_PENDING_REMINDER_SENT',
      dedupeKey: 'document:doc-1:pending-reminder',
      payload: { documentId: 'doc-1', documentKind: 'CONTRACT' },
    })
    const [payload] = sendMock.mock.calls[0]
    expect(payload.to).toEqual(['ana@cliente.test'])
    expect(payload.subject).toBe(
      'Lembrete: Contrato de Licença de Uso do Addere aguardando seu aceite'
    )
    expect(payload.html).toContain('https://painel.test/contrato/doc-1')
  })

  it('empresa sem ADMIN ativo indicado: skipped, sem reserva', async () => {
    prismaMock.contractDocument.findMany.mockResolvedValue([
      document(null, { id: 'doc-1' }),
      document({ ...ADMIN, active: false }, { id: 'doc-2' }),
      document({ ...ADMIN, role: 'SALESPERSON' }, { id: 'doc-3' }),
    ])
    const summary = await sendPendingDocumentReminders(new Date('2026-11-10T12:00:00Z'))
    expect(summary).toEqual({ sent: 0, duplicate: 0, skipped: 3, failed: 0 })
    expect(prismaMock.billingEvent.create).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })
})
