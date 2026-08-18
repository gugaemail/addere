import { prisma } from '@addere/db'
import { unprocessable } from '../../lib/errors'
import { logProtheusCall } from './protheus-logger'
import { fetchPaginated } from './paginated-fetch'
import { upsertChunked } from './upsert-chunked'
import { getCredentials, toStr } from './utils'

type RefData = { protheusCode: string; nome: string }

interface RefSyncConfig {
  operation: string
  endpointKey: 'apiTransp' | 'apiCondPag'
  listKey: string
  codeField: string
  nameField: string
  upsert: (
    companyId: string,
    r: RefData
  ) => ReturnType<typeof prisma.transportadora.upsert> | ReturnType<typeof prisma.condPag.upsert>
}

// Transportadoras e condições de pagamento seguem exatamente o mesmo fluxo —
// antes eram duas funções gêmeas de ~95 linhas cada
async function syncReference(companyId: string, cfg: RefSyncConfig) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })

  const url = company[cfg.endpointKey]
  if (!url) throw unprocessable(`URL ${cfg.endpointKey} não configurada`)

  const creds = getCredentials(company)
  const t0 = Date.now()

  try {
    const { records, totalRecords, totalFetched } = await fetchPaginated<RefData>({
      companyId,
      url,
      creds,
      listKey: cfg.listKey,
      mapRecord: (raw) => {
        const protheusCode = toStr(raw[cfg.codeField])
        if (!protheusCode) return null
        return { protheusCode, nome: toStr(raw[cfg.nameField], protheusCode) }
      },
    })

    const { synced, errors } = await upsertChunked(
      records,
      (r) => cfg.upsert(companyId, r),
      (r) => r.protheusCode
    )

    await logProtheusCall({
      companyId,
      operation: cfg.operation,
      endpointKey: cfg.endpointKey,
      success: true,
      durationMs: Date.now() - t0,
      recordsSynced: synced,
      totalRecords: totalRecords || totalFetched,
    })

    return { synced, total: totalRecords || totalFetched, errors }
  } catch (err: unknown) {
    const e = err as { response?: { status?: number }; message?: string }
    await logProtheusCall({
      companyId,
      operation: cfg.operation,
      endpointKey: cfg.endpointKey,
      success: false,
      httpStatus: e.response?.status,
      durationMs: Date.now() - t0,
      errorMessage: e.message,
    })
    throw err
  }
}

export function syncTransportadoras(companyId: string) {
  return syncReference(companyId, {
    operation: 'syncTransportadoras',
    endpointKey: 'apiTransp',
    listKey: 'Transportadoras',
    codeField: 'A4_COD',
    nameField: 'A4_NOME',
    upsert: (cid, r) =>
      prisma.transportadora.upsert({
        where: { companyId_protheusCode: { companyId: cid, protheusCode: r.protheusCode } },
        update: { nome: r.nome },
        create: { companyId: cid, protheusCode: r.protheusCode, nome: r.nome },
      }),
  })
}

export function syncCondPags(companyId: string) {
  return syncReference(companyId, {
    operation: 'syncCondPags',
    endpointKey: 'apiCondPag',
    listKey: 'condpag',
    codeField: 'E4_CODIGO',
    nameField: 'E4_DESCRI',
    upsert: (cid, r) =>
      prisma.condPag.upsert({
        where: { companyId_protheusCode: { companyId: cid, protheusCode: r.protheusCode } },
        update: { nome: r.nome },
        create: { companyId: cid, protheusCode: r.protheusCode, nome: r.nome },
      }),
  })
}
