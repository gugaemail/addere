import { api } from '../lib/api'
import { env } from '../config/env'
import type { PilotEventInput } from '@addere/types'

type TrackableEvent =
  | { type: 'ORDER_STARTED' }
  | { type: 'ORDER_COMPLETED'; metadata: {
      durationMs: number
      itemCount: number
      totalValue: number
      wasOffline: boolean
    }}
  | { type: 'ORDER_SYNCED'; metadata: {
      queuedDurationMs: number
    }}
  | { type: 'ORDER_SYNC_FAILED'; metadata: {
      attempts: number
      lastError: string
    }}
  | { type: 'SESSION_STARTED' }
  | { type: 'CATALOG_LOADED'; metadata: {
      fromCache: boolean
      itemCount: number
    }}

class PilotTracker {
  private queue: PilotEventInput[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private orderStartedAt: number | null = null

  startOrderTimer() {
    this.orderStartedAt = Date.now()
  }

  getOrderDuration(): number {
    if (!this.orderStartedAt) return 0
    return Date.now() - this.orderStartedAt
  }

  track(event: TrackableEvent) {
    if (env.appEnv === 'development') return

    const input: PilotEventInput = {
      type: event.type,
      occurredAt: new Date().toISOString(),
      ...('metadata' in event ? { metadata: event.metadata as Record<string, unknown> } : {}),
    }

    this.queue.push(input)

    if (event.type === 'ORDER_SYNCED' || event.type === 'ORDER_SYNC_FAILED') {
      this.flush()
    }
  }

  async flush() {
    if (this.queue.length === 0) return
    const batch = [...this.queue]
    this.queue = []

    try {
      await api.post('/pilot/events', { events: batch })
    } catch {
      // Tracking nunca pode quebrar o app — recoloca na fila
      this.queue = [...batch, ...this.queue]
    }
  }

  startAutoFlush() {
    this.flushTimer = setInterval(() => this.flush(), 60_000)
  }

  stopAutoFlush() {
    if (this.flushTimer) clearInterval(this.flushTimer)
    this.flush()
  }
}

export const pilotTracker = new PilotTracker()
