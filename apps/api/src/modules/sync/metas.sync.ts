import { prisma } from '@addere/db'
import { protheusPost } from './protheus.client'
import { unprocessable } from '../../lib/errors'
import { logProtheusCall } from './protheus-logger'
import { getCredentials, toStr } from './utils'

export async function fetchMetaVendedor(userId: string, companyId: string) {
  const [user, company] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { idVendProt: true } }),
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
  ])

  if (!user.idVendProt) throw unprocessable('Usuário sem código de vendedor Protheus (idVendProt)')
  if (!company.apiMetaVend) throw unprocessable('URL apiMetaVend não configurada')

  const creds = getCredentials(company)
  const now = new Date()
  const anomes = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const t0 = Date.now()

  try {
    const rawResponse = await protheusPost(companyId, company.apiMetaVend, { CODVEND: user.idVendProt, ANOMES: anomes }, creds) as Record<string, unknown>

    await logProtheusCall({
      companyId,
      operation:   'fetchMeta',
      endpointKey: 'apiMetaVend',
      success:     true,
      durationMs:  Date.now() - t0,
    })

    return {
      periodo: toStr(rawResponse['periodo']),
      vendido: toStr(rawResponse['vendido']),
      meta:    toStr(rawResponse['meta']),
    }
  } catch (err: unknown) {
    const e = err as { response?: { status?: number }; message?: string }
    await logProtheusCall({
      companyId,
      operation:    'fetchMeta',
      endpointKey:  'apiMetaVend',
      success:      false,
      httpStatus:   e.response?.status,
      durationMs:   Date.now() - t0,
      errorMessage: e.message,
    })
    throw err
  }
}
