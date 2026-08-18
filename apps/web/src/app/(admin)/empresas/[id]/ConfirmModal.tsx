'use client'

import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

interface ConfirmModalProps {
  title: string
  description: string
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmModal({
  title,
  description,
  confirmLabel = 'Confirmar',
  destructive = true,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <Modal isOpen onClose={onClose} title={title} className="max-w-sm">
      <div className="flex items-start gap-3">
        <div className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-danger/10 mt-0.5">
          <AlertTriangle className="w-4 h-4 text-danger" strokeWidth={2} />
        </div>
        <p className="text-sm text-[var(--text-muted)]">{description}</p>
      </div>

      <div className="flex gap-2 justify-end pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>
          Manter
        </Button>
        <Button
          type="button"
          variant={destructive ? 'danger' : 'primary'}
          onClick={() => { onConfirm(); onClose() }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
