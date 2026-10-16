import { prisma } from '@addere/db'
import type { CompanyContractDto } from '@addere/types'
import { conflict, notFound, unprocessable } from '../../lib/errors'
import { changedFields, recordBillingEvent } from './billing-events'
import type { ContractDraftData } from './billing.schema'
import { CONTRACT_WITH_TERMS, toContractDto } from './clients.service'

// Contrato em rascunho (plano 013). Antes do aceite nada começa: sem limite,
// sem cobrança e sem mudança na Inteligência. Este arquivo NUNCA lê nem escreve
// a chave da Inteligência da empresa: o tipo "Com Inteligência" só passa a
// ligar alguma coisa no aceite (plano 014).

const CONTRACT_KEYS = ['graceMonths', 'dueDay', 'overdueBlockDays'] as const
const TERMS_MONEY_KEYS = ['packagePrice', 'extraSeatPrice'] as const
const TERMS_KEYS = [
  'packageId',
  'licenseType',
  'includedSeats',
  'extraSeats',
  ...TERMS_MONEY_KEYS,
  'reason',
] as const

/**
 * Cria ou altera o rascunho do contrato da empresa. Só o DRAFT é editável: o
 * plano 014 troca a recusa de PENDING_ACCEPTANCE por "cancela o documento
 * enviado e volta para DRAFT" (decisão padrão 11).
 *
 * Dois SUPERADMIN criando o mesmo contrato ao mesmo tempo esbarram no
 * companyId @unique (P2002 → 409 pelo handler global): quem perdeu recarrega.
 */
export async function saveContractDraft(
  companyId: string,
  input: ContractDraftData,
  actorId: string
): Promise<CompanyContractDto> {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id: companyId }, select: { id: true } })
    if (!company) throw notFound('Cliente não encontrado')

    const pkg = await tx.licensePackage.findUnique({ where: { id: input.packageId } })
    if (!pkg) throw notFound('Pacote não encontrado')
    if (!pkg.active) {
      throw unprocessable('Pacote desativado: escolha outro', undefined, 'PACKAGE_INACTIVE')
    }

    // Pacote de quantidade fixa: a quantidade vem dele, e a do corpo é ignorada
    const includedSeats = pkg.seats ?? input.includedSeats
    if (includedSeats === undefined) {
      throw unprocessable(
        'Informe a quantidade de licenças do pacote',
        undefined,
        'INCLUDED_SEATS_REQUIRED'
      )
    }

    const contractData = {
      graceMonths: input.graceMonths,
      dueDay: input.dueDay,
      overdueBlockDays: input.overdueBlockDays,
    }
    const termsData = {
      packageId: pkg.id,
      licenseType: input.licenseType,
      includedSeats,
      extraSeats: input.extraSeats,
      packagePrice: input.packagePrice,
      extraSeatPrice: input.extraSeatPrice,
      reason: input.reason,
    }

    const existing = await tx.companyContract.findUnique({
      where: { companyId },
      include: { terms: { where: { status: 'PROPOSED' }, orderBy: { version: 'desc' } } },
    })

    let created: boolean
    let termsVersion: number
    let fields: string[]

    if (!existing) {
      const contract = await tx.companyContract.create({
        data: { companyId, status: 'DRAFT', ...contractData },
      })
      termsVersion = 1
      await tx.contractTerms.create({
        data: {
          contractId: contract.id,
          version: termsVersion,
          status: 'PROPOSED',
          origin: 'CONTRACT',
          createdById: actorId,
          ...termsData,
        },
      })
      created = true
      fields = [
        ...changedFields(null, contractData, CONTRACT_KEYS),
        ...changedFields(null, termsData, TERMS_KEYS, TERMS_MONEY_KEYS),
      ]
    } else {
      if (existing.status !== 'DRAFT') {
        throw conflict('Este contrato já saiu do rascunho', 'CONTRACT_NOT_DRAFT')
      }
      created = false

      const contractFields = changedFields(existing, contractData, CONTRACT_KEYS)
      if (contractFields.length > 0) {
        await tx.companyContract.update({ where: { id: existing.id }, data: contractData })
      }

      // O PROPOSED do rascunho é editado no lugar, sem versão nova
      const proposed = existing.terms[0] ?? null
      let termsFields: string[]
      if (proposed) {
        termsVersion = proposed.version
        termsFields = changedFields(proposed, termsData, TERMS_KEYS, TERMS_MONEY_KEYS)
        if (termsFields.length > 0) {
          await tx.contractTerms.update({ where: { id: proposed.id }, data: termsData })
        }
      } else {
        // Rascunho sem PROPOSED (as propostas foram descartadas): próxima versão.
        // findFirst, não aggregate: a versão vem da linha mais alta
        const last = await tx.contractTerms.findFirst({
          where: { contractId: existing.id },
          orderBy: { version: 'desc' },
          select: { version: true },
        })
        termsVersion = (last?.version ?? 0) + 1
        await tx.contractTerms.create({
          data: {
            contractId: existing.id,
            version: termsVersion,
            status: 'PROPOSED',
            origin: 'CONTRACT',
            createdById: actorId,
            ...termsData,
          },
        })
        termsFields = changedFields(null, termsData, TERMS_KEYS, TERMS_MONEY_KEYS)
      }
      fields = [...contractFields, ...termsFields]
    }

    if (created || fields.length > 0) {
      await recordBillingEvent(tx, {
        type: created ? 'CONTRACT_DRAFT_CREATED' : 'CONTRACT_DRAFT_UPDATED',
        companyId,
        actorId,
        fields,
        ref: { termsVersion },
      })
    }

    const saved = await tx.companyContract.findUnique({
      where: { companyId },
      include: CONTRACT_WITH_TERMS,
    })
    if (!saved) throw notFound('Contrato não encontrado')
    return toContractDto(saved)
  })
}
