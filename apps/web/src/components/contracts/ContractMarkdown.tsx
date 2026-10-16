'use client'

import { useMemo } from 'react'
import { renderContractMarkdown } from '@addere/types'
import { cn } from '@/lib/utils'

// Texto do contrato renderizado (plano 014). É o único lugar do painel com
// dangerouslySetInnerHTML, e a entrada é SEMPRE a saída de
// renderContractMarkdown: ele escapa todo HTML (& < > " ') antes de qualquer
// marcação e só gera h1 a h3, p, ul, ol, li, hr e strong, sem id, class nem
// atributo além do start da lista numerada. Texto do cadastro não vira HTML.
export function ContractMarkdown({
  markdown,
  className,
}: {
  markdown: string
  className?: string
}) {
  const html = useMemo(() => renderContractMarkdown(markdown), [markdown])
  return (
    <div className={cn('contract-doc', className)} dangerouslySetInnerHTML={{ __html: html }} />
  )
}
