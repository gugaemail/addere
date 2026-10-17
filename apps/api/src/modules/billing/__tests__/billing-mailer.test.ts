// Envio com deduplicação (plano 016, passo 4). O lembrete não pode sair duas
// vezes: a reserva do dedupeKey vem antes do envio, e só um envio que não
// aconteceu a libera. O resend 4.x devolve { data, error } em vez de lançar.
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
import {
  billingRecipients,
  documentPendingReminderEmail,
  dueReminderEmail,
  escapeHtml,
  sendBillingEmailOnce,
} from '../billing-mailer'

const KEY = 'invoice:inv-1:due-reminder'

const input = (overrides: Partial<Parameters<typeof sendBillingEmailOnce>[0]> = {}) => ({
  companyId: 'company-1',
  dedupeKey: KEY,
  eventType: 'INVOICE_DUE_REMINDER_SENT' as const,
  payload: { invoiceId: 'inv-1' },
  to: ['financeiro@cliente.test'],
  subject: 'Fatura do Addere vence em 10/11/2026',
  html: '<p>oi</p>',
  ...overrides,
})

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: '5.22.0' })

beforeEach(() => {
  resetPrismaMock()
  sendMock.mockReset()
  captureMock.mockReset()
  envMock.RESEND_API_KEY = 're_test'
})

describe('sendBillingEmailOnce', () => {
  it("sem RESEND_API_KEY: 'skipped' e nenhuma reserva gravada", async () => {
    envMock.RESEND_API_KEY = undefined
    await expect(sendBillingEmailOnce(input())).resolves.toBe('skipped')
    expect(prismaMock.billingEvent.create).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it("sem destinatário: 'skipped' e nenhuma reserva gravada", async () => {
    await expect(sendBillingEmailOnce(input({ to: ['', '  '] }))).resolves.toBe('skipped')
    expect(prismaMock.billingEvent.create).not.toHaveBeenCalled()
  })

  it("P2002 na reserva: 'duplicate' e o send não é chamado", async () => {
    prismaMock.billingEvent.create.mockRejectedValue(p2002())
    await expect(sendBillingEmailOnce(input())).resolves.toBe('duplicate')
    expect(sendMock).not.toHaveBeenCalled()
    expect(prismaMock.billingEvent.deleteMany).not.toHaveBeenCalled()
  })

  it('a reserva vem antes do envio, com o dedupeKey e autor null', async () => {
    const order: string[] = []
    prismaMock.billingEvent.create.mockImplementation(async () => {
      order.push('reserve')
      return {}
    })
    sendMock.mockImplementation(async () => {
      order.push('send')
      return { data: { id: 'email-1' }, error: null }
    })
    await sendBillingEmailOnce(input())
    expect(order).toEqual(['reserve', 'send'])
    expect(prismaMock.billingEvent.create.mock.calls[0][0].data).toEqual({
      type: 'INVOICE_DUE_REMINDER_SENT',
      companyId: 'company-1',
      actorId: null,
      payload: { invoiceId: 'inv-1' },
      dedupeKey: KEY,
    })
  })

  it("send devolve { error }: 'failed', libera a reserva e vai ao Sentry", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'financeiro@cliente.test inválido' },
    })
    await expect(sendBillingEmailOnce(input())).resolves.toBe('failed')
    expect(prismaMock.billingEvent.deleteMany).toHaveBeenCalledWith({ where: { dedupeKey: KEY } })
    expect(captureMock).toHaveBeenCalledTimes(1)
    // Nada de endereço no Sentry
    expect(JSON.stringify(captureMock.mock.calls)).not.toContain('financeiro@cliente.test')
  })

  it("send lança: o mesmo ('failed', reserva liberada, Sentry)", async () => {
    sendMock.mockRejectedValue(new Error('ECONNRESET'))
    await expect(sendBillingEmailOnce(input())).resolves.toBe('failed')
    expect(prismaMock.billingEvent.deleteMany).toHaveBeenCalledWith({ where: { dedupeKey: KEY } })
    expect(captureMock).toHaveBeenCalledTimes(1)
  })

  it("sucesso: 'sent', com idempotencyKey igual ao dedupeKey e sem liberar a reserva", async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    await expect(
      sendBillingEmailOnce(input({ to: ['Financeiro@Cliente.test', 'ana@cliente.test'] }))
    ).resolves.toBe('sent')
    expect(sendMock).toHaveBeenCalledTimes(1)
    const [payload, options] = sendMock.mock.calls[0]
    expect(options).toEqual({ idempotencyKey: KEY })
    expect(payload).toMatchObject({
      from: 'Addere <noreply@addere.com.br>',
      to: ['financeiro@cliente.test', 'ana@cliente.test'],
      subject: 'Fatura do Addere vence em 10/11/2026',
    })
    expect(prismaMock.billingEvent.deleteMany).not.toHaveBeenCalled()
  })

  it('replyTo: o e-mail da Addere das regras; sem ele, o contato da Addere', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    prismaMock.billingSettings.findUnique.mockResolvedValueOnce({
      notifyEmail: 'cobranca@addere.test',
    })
    await sendBillingEmailOnce(input())
    expect(sendMock.mock.calls[0][0].replyTo).toBe('cobranca@addere.test')

    await sendBillingEmailOnce(input())
    expect(sendMock.mock.calls[1][0].replyTo).toBe('contato@addere.com.br')
  })

  it('erro de banco na reserva (não P2002) é lançado, sem envio', async () => {
    prismaMock.billingEvent.create.mockRejectedValue(
      Object.assign(new Error('db'), { code: 'P1001' })
    )
    await expect(sendBillingEmailOnce(input())).rejects.toThrow('db')
    expect(sendMock).not.toHaveBeenCalled()
  })
})

describe('escapeHtml', () => {
  it("'<b>&\"' vira texto", () => {
    expect(escapeHtml('<b>&"')).toBe('&lt;b&gt;&amp;&quot;')
  })
})

describe('billingRecipients', () => {
  it('junta o contato de cobrança e os ADMINs ativos, em minúsculas e sem repetir', async () => {
    prismaMock.clientProfile.findUnique.mockResolvedValue({
      billingEmail: ' Financeiro@Cliente.test ',
    })
    prismaMock.user.findMany.mockResolvedValue([
      { email: 'financeiro@cliente.test' },
      { email: 'Ana@Cliente.test' },
      { email: 'ana@cliente.test' },
    ])
    await expect(billingRecipients('company-1')).resolves.toEqual([
      'financeiro@cliente.test',
      'ana@cliente.test',
    ])
    expect(prismaMock.user.findMany.mock.calls[0][0].where).toEqual({
      companyId: 'company-1',
      role: 'ADMIN',
      active: true,
    })
  })

  it('sem cadastro comercial: só os ADMINs', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ email: 'ana@cliente.test' }])
    await expect(billingRecipients('company-1')).resolves.toEqual(['ana@cliente.test'])
  })
})

describe('modelos', () => {
  it('lembrete de vencimento: assunto, número, competência por extenso, valor, itens e link', () => {
    const { subject, html } = dueReminderEmail('Distribuidora <Norte>', {
      number: 124,
      competence: new Date('2026-10-01T00:00:00.000Z'),
      dueDate: new Date('2026-11-10T00:00:00.000Z'),
      total: '2139.80',
      items: [
        { description: 'Pacote 20 — Com Inteligência (20 licenças)', amount: '1990.00' },
        { description: 'Ajuste <script>', amount: '149.80' },
      ],
    })
    expect(subject).toBe('Fatura do Addere vence em 10/11/2026')
    expect(html).toContain('000124')
    expect(html).toContain('outubro de 2026')
    expect(html).toContain('R$ 2.139,80')
    expect(html).toContain('R$ 1.990,00')
    expect(html).toContain('https://painel.test/plano')
    expect(html).toContain('Distribuidora &lt;Norte&gt;')
    expect(html).not.toContain('<script>')
  })

  it('documento pendente: assunto conforme o tipo e o link do envio do 014', () => {
    const c = documentPendingReminderEmail({ id: 'doc-1', kind: 'CONTRACT' }, 'Ana')
    expect(c.subject).toBe('Lembrete: Contrato de Licença de Uso do Addere aguardando seu aceite')
    expect(c.html).toContain('https://painel.test/contrato/doc-1')
    const a = documentPendingReminderEmail({ id: 'doc-2', kind: 'AMENDMENT' }, 'Ana')
    expect(a.subject).toBe(
      'Lembrete: Aditivo ao Contrato de Licença de Uso do Addere aguardando seu aceite'
    )
  })
})
