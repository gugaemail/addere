// Resolve os valores dos placeholders com dados do tenant (E3/E4).
// Usado pela prévia/reconciliação (admin) e pelo sync dos contratos.

import { prisma } from '@addere/db'
import type { Company } from '@prisma/client'
import type { QueryContract } from './contracts'
import { formatDateYmdSaoPaulo, type PlaceholderValues } from './placeholders'
import type { DateWindow } from '../sync/windows'

export async function buildPlaceholderValues(
  company: Company,
  contract: QueryContract,
  window: DateWindow
): Promise<{ values: PlaceholderValues; errors: string[] }> {
  const errors: string[] = []
  const values: PlaceholderValues = {
    dataIni: window.dataIni,
    dataFim: window.dataFim,
    hoje: formatDateYmdSaoPaulo(new Date()),
  }

  const needed = [...contract.requiredPlaceholders, ...contract.optionalPlaceholders]

  if (needed.includes('FILIAL')) {
    const branches = await prisma.branch.findMany({
      where: { companyId: company.id, active: true, idProtheus: { not: null } },
      select: { idProtheus: true },
    })
    values.branches = branches
      .map((b) => b.idProtheus)
      .filter((code): code is string => Boolean(code))
    if (values.branches.length === 0) {
      errors.push('Nenhuma filial ativa com código Protheus cadastrado')
    }
  }

  if (needed.includes('VENDEDOR')) {
    const seller = await prisma.user.findFirst({
      where: { companyId: company.id, active: true, idVendProt: { not: null } },
      select: { idVendProt: true },
    })
    if (seller?.idVendProt) values.vendedor = seller.idVendProt
    else errors.push('Nenhum vendedor ativo com código Protheus para {{VENDEDOR}}')
  }

  if (needed.includes('PRODUTO')) {
    const product = await prisma.product.findFirst({
      where: { companyId: company.id, active: true, protheusCode: { not: null } },
      select: { protheusCode: true },
    })
    if (product?.protheusCode) values.produto = product.protheusCode
    else errors.push('Nenhum produto ativo com código Protheus para {{PRODUTO}}')
  }

  return { values, errors }
}
