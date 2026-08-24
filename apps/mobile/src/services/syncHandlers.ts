// Despacho da fila offline por tipo (E12). Cada handler diz como validar o
// payload, para onde enviar e o que invalidar no cache após o sync.
// Pedido continua sendo o único tipo cujo conteúdo pode ir ao Sentry —
// os tipos da Inteligência carregam dados de cliente (LGPD) e nunca sobem.
import { api } from '../lib/api'
import type { CreateOrderInput } from '@addere/types'
import type { SyncItemType } from '../types/sync'

export interface SyncHandler {
  /** Rejeita payload malformado antes de gastar rede (falha permanente) */
  validate: (payload: unknown) => boolean
  /** Envia o payload — lança em erro de rede/HTTP para o retry do engine */
  send: (payload: unknown) => Promise<void>
  /** Query keys invalidadas após sync com sucesso */
  invalidates: string[][]
  /** Conteúdo pode ir ao Sentry em falha? (LGPD: só pedidos) */
  reportPayload: boolean
}

const isObject = (p: unknown): p is Record<string, unknown> =>
  typeof p === 'object' && p !== null

export function isValidOrderPayload(payload: unknown): payload is CreateOrderInput {
  const p = payload as CreateOrderInput
  return (
    isObject(payload) &&
    typeof p.customerId === 'string' &&
    typeof p.branchId === 'string' &&
    Array.isArray(p.items) &&
    p.items.length > 0
  )
}

export interface VisitPayload {
  clientId: string
  customerCode: string
  loja: string
  arrivedAt: string
  [key: string]: unknown
}

export function isValidVisitPayload(payload: unknown): payload is VisitPayload {
  const p = payload as VisitPayload
  return (
    isObject(payload) &&
    typeof p.clientId === 'string' &&
    typeof p.customerCode === 'string' &&
    typeof p.loja === 'string' &&
    typeof p.arrivedAt === 'string'
  )
}

export interface VisitResultPayload {
  clientId: string
  result?: string | null
  [key: string]: unknown
}

export function isValidVisitResultPayload(payload: unknown): payload is VisitResultPayload {
  const p = payload as VisitResultPayload
  return isObject(payload) && typeof p.clientId === 'string'
}

export function isValidFeedbackPayload(payload: unknown): boolean {
  const p = payload as { targetType?: unknown; targetId?: unknown; rating?: unknown }
  return (
    isObject(payload) &&
    typeof p.targetType === 'string' &&
    typeof p.targetId === 'string' &&
    (p.rating === 1 || p.rating === -1)
  )
}

export interface PlanPatchPayload {
  planId: string
  ops: unknown[]
  [key: string]: unknown
}

export function isValidPlanPatchPayload(payload: unknown): payload is PlanPatchPayload {
  const p = payload as PlanPatchPayload
  return isObject(payload) && typeof p.planId === 'string' && Array.isArray(p.ops) && p.ops.length > 0
}

export interface MessageSentPayload {
  messageId: string
}

export function isValidMessageSentPayload(payload: unknown): payload is MessageSentPayload {
  const p = payload as MessageSentPayload
  return isObject(payload) && typeof p.messageId === 'string'
}

export const syncHandlers: Record<SyncItemType, SyncHandler> = {
  order: {
    validate: isValidOrderPayload,
    send: async (payload) => {
      await api.post('/orders', payload)
    },
    invalidates: [['orders']],
    reportPayload: true,
  },
  visit: {
    validate: isValidVisitPayload,
    // Idempotente no servidor: upsert por clientId (E7)
    send: async (payload) => {
      await api.post('/intel/app/visits', payload)
    },
    invalidates: [['intel', 'plan'], ['intel', 'home']],
    reportPayload: false,
  },
  visitResult: {
    validate: isValidVisitResultPayload,
    send: async (payload) => {
      const { clientId, ...body } = payload as VisitResultPayload
      await api.patch(`/intel/app/visits/${clientId}`, body)
    },
    invalidates: [['intel', 'plan'], ['intel', 'home']],
    reportPayload: false,
  },
  feedback: {
    validate: isValidFeedbackPayload,
    send: async (payload) => {
      await api.post('/intel/app/feedback', payload)
    },
    invalidates: [],
    reportPayload: false,
  },
  planPatch: {
    validate: isValidPlanPatchPayload,
    // applyPlanOps é idempotente por construção (E7) — retry seguro
    send: async (payload) => {
      const { planId, ...body } = payload as PlanPatchPayload
      await api.patch(`/intel/app/plans/${planId}/items`, body)
    },
    invalidates: [['intel', 'plan'], ['intel', 'home']],
    reportPayload: false,
  },
  messageSent: {
    validate: isValidMessageSentPayload,
    send: async (payload) => {
      const { messageId } = payload as MessageSentPayload
      await api.post(`/intel/app/messages/${messageId}/sent`, {})
    },
    invalidates: [],
    reportPayload: false,
  },
}
