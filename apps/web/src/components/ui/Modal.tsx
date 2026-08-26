'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  // ReactNode para permitir títulos com ícone/badge (ex.: modal de diagnóstico)
  title: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  // Fecha com ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* max-h + rolagem interna: formulário mais alto que a janela deixava o
          botão de salvar fora de alcance, sem rolagem nenhuma que o trouxesse */}
      <div
        className={cn(
          'relative z-10 flex max-h-[90vh] w-full max-w-md flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-xl',
          className
        )}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors"
          >
            <X size={16} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">{children}</div>
      </div>
    </div>
  )
}
