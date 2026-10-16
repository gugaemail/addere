// Quem vê o documento pendente para aceitar e quem vê só para leitura (plano
// 014, decisão 10). Só o administrador indicado aceita; os outros ADMINs da
// empresa leem o texto com "Aguardando o aceite de {nome}". Puro, testado em
// __tests__/contract-acceptance.test.ts.
import type { ContractDocumentKind, DesignatedAdminRef } from '@addere/types'

export type PendingDocumentMode = 'accept' | 'readonly' | 'designee-invalid'

export function pendingDocumentMode(
  userId: string | null | undefined,
  designatedAdmin: DesignatedAdminRef | null | undefined
): PendingDocumentMode {
  if (!designatedAdmin || !designatedAdmin.valid) return 'designee-invalid'
  return designatedAdmin.id === userId ? 'accept' : 'readonly'
}

const KIND_WORD: Record<ContractDocumentKind, string> = {
  CONTRACT: 'Contrato',
  AMENDMENT: 'Aditivo',
}

/** O texto da faixa do painel enquanto houver documento pendente */
export function pendingBannerText(
  kind: ContractDocumentKind,
  mode: PendingDocumentMode,
  designatedAdminName: string | null | undefined
): string {
  if (mode === 'accept') return `${KIND_WORD[kind]} aguardando seu aceite.`
  if (mode === 'readonly') {
    return `${KIND_WORD[kind]} aguardando o aceite de ${designatedAdminName ?? 'administrador indicado'}.`
  }
  return 'O administrador indicado não está mais ativo. Fale com a Addere para indicar outro.'
}
