'use client'

import { useId } from 'react'
import { Info } from 'lucide-react'

interface InfoTipProps {
  /** O que o número quer dizer — uma ou duas frases curtas. */
  text: string
  /** Nome do que é explicado, para o leitor de tela ("O que significa Receita base"). */
  label: string
}

// Ícone (i) com uma explicação curta. O balão abre com o mouse, com o foco do
// teclado ou com o toque, e se posiciona pelo card em volta — que precisa ser
// `relative`: ocupa a largura dele logo abaixo, então não vaza da tela na
// última coluna. O texto chega ao leitor de tela pelo aria-describedby.
export function InfoTip({ text, label }: InfoTipProps) {
  const id = useId()
  return (
    <span className="group/info inline-flex">
      <button
        type="button"
        aria-label={`O que significa ${label}`}
        aria-describedby={id}
        className="inline-flex rounded-full text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <Info size={14} strokeWidth={1.5} aria-hidden />
      </button>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none invisible absolute inset-x-0 top-full z-20 mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-normal normal-case leading-relaxed tracking-normal text-[var(--text-secondary)] opacity-0 shadow-modal transition-opacity group-hover/info:visible group-hover/info:opacity-100 group-focus-within/info:visible group-focus-within/info:opacity-100"
      >
        {text}
      </span>
    </span>
  )
}
