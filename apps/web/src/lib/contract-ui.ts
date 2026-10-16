// Contrato de licença de uso (plano 014) — rótulos e formatação das telas.
// Puro; as telas não têm teste de render.
import type {
  ContractDocumentKind,
  ContractDocumentStatus,
  ContractTemplateStatus,
  TemplateIssueType,
} from '@addere/types'
import type { BadgeVariant } from './billing-ui'

export const DOCUMENT_KIND_SHORT: Record<ContractDocumentKind, string> = {
  CONTRACT: 'Contrato',
  AMENDMENT: 'Aditivo',
}

export const TEMPLATE_STATUS_LABELS: Record<ContractTemplateStatus, string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Arquivado',
}

export const TEMPLATE_STATUS_BADGE: Record<ContractTemplateStatus, BadgeVariant> = {
  DRAFT: 'warning',
  PUBLISHED: 'success',
  ARCHIVED: 'neutral',
}

export const DOCUMENT_STATUS_LABELS: Record<ContractDocumentStatus, string> = {
  SENT: 'Aguardando aceite',
  ACCEPTED: 'Aceito',
  CANCELLED: 'Cancelado',
}

export const DOCUMENT_STATUS_BADGE: Record<ContractDocumentStatus, BadgeVariant> = {
  SENT: 'info',
  ACCEPTED: 'success',
  CANCELLED: 'neutral',
}

export const TEMPLATE_ISSUE_LABELS: Record<TemplateIssueType, string> = {
  EMPTY: 'texto vazio',
  UNKNOWN_FIELD: 'campo desconhecido',
  FIELD_NOT_ALLOWED_FOR_KIND: 'campo que só existe no aditivo',
  REVIEW_MARKER: 'marca de revisão',
  MALFORMED_PLACEHOLDER: 'chaves soltas',
}

let brasilia: Intl.DateTimeFormat | null = null
let brasiliaSeconds: Intl.DateTimeFormat | null = null

/** Instante ISO → 'DD/MM/AAAA HH:MM' no horário de Brasília */
export function formatDateTimeBrasilia(iso: string, withSeconds = false): string {
  if (withSeconds) {
    brasiliaSeconds ??= new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    return brasiliaSeconds.format(new Date(iso))
  }
  brasilia ??= new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return brasilia.format(new Date(iso))
}
