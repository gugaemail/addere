'use client'

import type { ContractDocumentDto } from '@addere/types'
import { ContractMarkdown } from './ContractMarkdown'

// O texto congelado do documento (plano 014): renderedBody, o mesmo sobre o
// qual o SHA-256 foi calculado. A renderização passa por ContractMarkdown
// (renderContractMarkdown, que escapa todo HTML).
export function ContractDocumentView({ doc }: { doc: Pick<ContractDocumentDto, 'renderedBody'> }) {
  return <ContractMarkdown markdown={doc.renderedBody} />
}
