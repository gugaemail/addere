// Captura de metas por vendedor via apiMetaVend (E4) — GoalSnapshot append-only.
// Pendência E0-3 com o consultor: aceitar ANOMES anterior e CODVEND de terceiros;
// por isso cada chamada é isolada e os erros não derrubam a captura dos demais.

import { prisma } from '@addere/db'
import type { Company } from '@prisma/client'
import { protheusPost } from '../../sync/protheus.client'
import { logProtheusCall } from '../../sync/protheus-logger'
import { getCredentials, toStr } from '../../sync/utils'

/** Parseia números da meta em formatos BR ("1.234,56"), US ("1234.56") ou numéricos. */
export function parseMetaNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const s = String(raw).trim().replace(/[R$\s]/g, '')
  if (!s) return null
  const normalized =
    s.includes(',') && (!s.includes('.') || s.lastIndexOf('.') < s.lastIndexOf(','))
      ? s.replace(/\./g, '').replace(',', '.') // BR: 1.234,56
      : s.replace(/,/g, '') // US: 1,234.56 ou simples
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

/** ANOMES (YYYYMM) do mês atual e do anterior no fuso de São Paulo. */
export function goalPeriods(ref: Date = new Date()): [string, string] {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(ref)
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  const previous = month === 1 ? `${year - 1}12` : `${year}${String(month - 1).padStart(2, '0')}`
  return [`${year}${String(month).padStart(2, '0')}`, previous]
}

export interface GoalsCaptureResult {
  captured: number
  errors: string[]
}

export async function captureGoals(company: Company): Promise<GoalsCaptureResult> {
  if (!company.apiMetaVend) {
    return { captured: 0, errors: ['apiMetaVend não configurada — captura de metas pulada'] }
  }

  const sellers = await prisma.user.findMany({
    where: { companyId: company.id, active: true, idVendProt: { not: null } },
    select: { idVendProt: true },
  })
  if (sellers.length === 0) return { captured: 0, errors: [] }

  const creds = getCredentials(company)
  const periods = goalPeriods()
  let captured = 0
  const errors: string[] = []

  for (const seller of sellers) {
    const codVend = seller.idVendProt as string
    for (const anomes of periods) {
      const t0 = Date.now()
      try {
        const raw = (await protheusPost(
          company.id,
          company.apiMetaVend as string,
          { CODVEND: codVend, ANOMES: anomes },
          creds
        )) as Record<string, unknown>

        await prisma.goalSnapshot.create({
          data: {
            companyId: company.id,
            vendorCode: codVend,
            period: toStr(raw['periodo']) || anomes,
            goalAmount: parseMetaNumber(raw['meta']),
            soldAmount: parseMetaNumber(raw['vendido']),
          },
        })
        captured++

        await logProtheusCall({
          companyId: company.id,
          operation: 'intel:goals',
          endpointKey: 'apiMetaVend',
          success: true,
          durationMs: Date.now() - t0,
        })
      } catch (err) {
        errors.push(`${codVend}/${anomes}: ${(err as Error).message.slice(0, 120)}`)
        await logProtheusCall({
          companyId: company.id,
          operation: 'intel:goals',
          endpointKey: 'apiMetaVend',
          success: false,
          durationMs: Date.now() - t0,
          errorMessage: (err as Error).message,
        }).catch(() => undefined)
      }
    }
  }

  return { captured, errors }
}
