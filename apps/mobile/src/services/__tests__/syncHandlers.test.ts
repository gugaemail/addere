import { api } from '../../lib/api'
import {
  syncHandlers,
  isValidOrderPayload,
  isValidVisitPayload,
  isValidVisitResultPayload,
  isValidFeedbackPayload,
  isValidPlanPatchPayload,
  isValidMessageSentPayload,
} from '../syncHandlers'

jest.mock('../../lib/api', () => ({
  api: { post: jest.fn().mockResolvedValue({}), patch: jest.fn().mockResolvedValue({}) },
}))

const mockedApi = api as jest.Mocked<typeof api>

describe('validadores da fila (payload malformado = falha permanente)', () => {
  it('order', () => {
    expect(isValidOrderPayload({ customerId: 'c', branchId: 'b', items: [{}] })).toBe(true)
    expect(isValidOrderPayload({ customerId: 'c', branchId: 'b', items: [] })).toBe(false)
    expect(isValidOrderPayload(null)).toBe(false)
  })

  it('visit', () => {
    expect(
      isValidVisitPayload({ clientId: 'id', customerCode: 'A', loja: '01', arrivedAt: '2026-08-23T10:00:00Z' })
    ).toBe(true)
    expect(isValidVisitPayload({ clientId: 'id' })).toBe(false)
  })

  it('visitResult / feedback / planPatch / messageSent', () => {
    expect(isValidVisitResultPayload({ clientId: 'id', result: 'ORDER' })).toBe(true)
    expect(isValidVisitResultPayload({})).toBe(false)
    expect(isValidFeedbackPayload({ targetType: 'PLAN', targetId: 'x', rating: 1 })).toBe(true)
    expect(isValidFeedbackPayload({ targetType: 'PLAN', targetId: 'x', rating: 0 })).toBe(false)
    expect(isValidPlanPatchPayload({ planId: 'p', ops: [{ op: 'remove', itemId: 'i' }] })).toBe(true)
    expect(isValidPlanPatchPayload({ planId: 'p', ops: [] })).toBe(false)
    expect(isValidMessageSentPayload({ messageId: 'm' })).toBe(true)
    expect(isValidMessageSentPayload({})).toBe(false)
  })
})

describe('endpoints por tipo', () => {
  beforeEach(() => jest.clearAllMocks())

  it('visit → POST /intel/app/visits (idempotente por clientId)', async () => {
    const payload = { clientId: 'id', customerCode: 'A', loja: '01', arrivedAt: 'x' }
    await syncHandlers.visit.send(payload)
    expect(mockedApi.post).toHaveBeenCalledWith('/intel/app/visits', payload)
  })

  it('visitResult → PATCH /intel/app/visits/:clientId sem o clientId no body', async () => {
    await syncHandlers.visitResult.send({ clientId: 'abc', result: 'ORDER' })
    expect(mockedApi.patch).toHaveBeenCalledWith('/intel/app/visits/abc', { result: 'ORDER' })
  })

  it('planPatch → PATCH /intel/app/plans/:id/items', async () => {
    await syncHandlers.planPatch.send({ planId: 'p1', ops: [{ op: 'remove', itemId: 'i' }] })
    expect(mockedApi.patch).toHaveBeenCalledWith('/intel/app/plans/p1/items', {
      ops: [{ op: 'remove', itemId: 'i' }],
    })
  })

  it('messageSent → POST /intel/app/messages/:id/sent', async () => {
    await syncHandlers.messageSent.send({ messageId: 'm1' })
    expect(mockedApi.post).toHaveBeenCalledWith('/intel/app/messages/m1/sent', {})
  })

  it('só o pedido pode reportar payload ao Sentry (LGPD)', () => {
    expect(syncHandlers.order.reportPayload).toBe(true)
    for (const type of ['visit', 'visitResult', 'feedback', 'planPatch', 'messageSent'] as const) {
      expect(syncHandlers[type].reportPayload).toBe(false)
    }
  })
})
