'use client'

import { AlertTriangle } from 'lucide-react'
import type { SeatUsage } from '@addere/types'
import { cn } from '@/lib/utils'
import { overLimitMessage, seatMeterTone, seatPercent, type SeatMeterTone } from '@/lib/seats'

// Medidor de licenças (plano 015): no /plano do ADMIN e na aba Licenças da
// ficha do cliente. A barra é a de inteligencia/resultado; a cor vem de
// seatMeterTone (marca, alerta a partir de 90 %, perigo no limite).

const FILL: Record<SeatMeterTone, string> = {
  brand: 'bg-brand',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

export function SeatMeter({ seats }: { seats: SeatUsage }) {
  if (!seats.enforced || seats.limit === null) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        {seats.used} {seats.used === 1 ? 'licença' : 'licenças'} em uso · sem limite
      </p>
    )
  }

  const pct = seatPercent(seats)
  const tone = seatMeterTone(seats)
  const status = seats.overLimit
    ? 'acima do limite'
    : `${seats.available} ${seats.available === 1 ? 'livre' : 'livres'}`

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-[var(--text-primary)]">
        {seats.used} de {seats.limit} em uso · {status}
      </p>
      <div className="flex items-center gap-3">
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-[var(--border)]"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Licenças em uso sobre o limite do contrato"
        >
          <div
            className={cn('h-full rounded-full', FILL[tone])}
            style={{ width: `${Math.max(0, Math.min(pct, 100))}%` }}
          />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">{pct} %</span>
      </div>
      {seats.overLimit && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-[var(--text-secondary)]">
          <AlertTriangle
            size={16}
            strokeWidth={1.5}
            className="mt-0.5 shrink-0 text-warning"
            aria-hidden
          />
          {overLimitMessage(seats)}
        </p>
      )}
    </div>
  )
}
