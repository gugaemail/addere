import { prisma } from '@addere/db'
import type { SyncSchedule } from '@addere/types'
import { DEFAULT_SYNC_SCHEDULE } from '@addere/types'
import { unprocessable } from '../../lib/errors'
import { logProtheusCall } from './protheus-logger'
import { fetchPaginated } from './paginated-fetch'
import { upsertChunked } from './upsert-chunked'
import { getCredentials, parseProtheusDate, buildPhone, toStr } from './utils'

type CustomerData = {
  protheusCode:  string
  loja:          string
  name:          string
  document:      string | null
  email:         string | null
  phone:         string | null
  address:       string | null
  municipio:     string | null
  bairro:        string | null
  cep:           string | null
  uf:            string | null
  ultcom:        Date | null
  vendorCode:    string | null
  msblql:        string | null
  transpPadrao:  string | null
  condPagPadrao: string | null
  tes:           string | null
  xcodemp:       string | null
}

// Lista de campos declarada uma única vez — usada em update e create do upsert
function customerFields(c: CustomerData) {
  return {
    name:          c.name,
    document:      c.document,
    email:         c.email,
    phone:         c.phone,
    address:       c.address,
    municipio:     c.municipio,
    bairro:        c.bairro,
    cep:           c.cep,
    uf:            c.uf,
    ultcom:        c.ultcom,
    vendorCode:    c.vendorCode,
    msblql:        c.msblql,
    transpPadrao:  c.transpPadrao,
    condPagPadrao: c.condPagPadrao,
    tes:           c.tes,
    xcodemp:       c.xcodemp,
    // Protheus marca bloqueio em A1_MSBLQL='1'
    active:        c.msblql !== '1',
  }
}

export async function syncCustomers(companyId: string, operationLabel = 'syncCustomers') {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })

  if (!company.apiCliente) throw unprocessable('URL apiCliente não configurada')

  const creds    = getCredentials(company)
  const schedule = (company.syncSchedule as SyncSchedule | null) ?? DEFAULT_SYNC_SCHEDULE
  const INTERV   = schedule.customers.interv ?? 0
  const t0 = Date.now()

  try {
    const { records, totalRecords, totalFetched } = await fetchPaginated<CustomerData>({
      companyId,
      url:       company.apiCliente,
      creds,
      listKey:   'clientes',
      bodyExtra: { INTERV },
      mapRecord: (raw) => {
        const protheusCode = toStr(raw['A1_COD'])
        if (!protheusCode) return null

        return {
          protheusCode,
          loja:          toStr(raw['A1_LOJA'], '01'),
          name:          toStr(raw['A1_NOME'], protheusCode),
          document:      toStr(raw['A1_CGC'])    || null,
          email:         toStr(raw['A1_EMAIL'])  || null,
          phone:         buildPhone(toStr(raw['A1_DDD']), toStr(raw['A1_TEL'])),
          address:       toStr(raw['A1_END'])    || null,
          municipio:     toStr(raw['A1_MUN'])    || null,
          bairro:        toStr(raw['A1_BAIRRO']) || null,
          cep:           toStr(raw['A1_CEP'])    || null,
          uf:            toStr(raw['A1_EST'])    || null,
          ultcom:        parseProtheusDate(raw['A1_ULTCOM']),
          vendorCode:    toStr(raw['A1_VEND'])    || null,
          msblql:        toStr(raw['A1_MSBLQL'])  || null,
          transpPadrao:  toStr(raw['A1_TRANSP'])  || null,
          condPagPadrao: toStr(raw['A1_COND'])    || null,
          tes:           toStr(raw['A1_TES'])     || null,
          xcodemp:       toStr(raw['A1_XCODEMP']) || null,
        }
      },
    })

    // Deduplica por document: o Protheus retorna o mesmo CNPJ em múltiplas lojas
    // (A1_LOJA='01', '02'...). A constraint @@unique([companyId, document]) aceita apenas um
    // registro por CNPJ — mantemos a primeira ocorrência (geralmente loja='01').
    const seenDocuments = new Set<string>()
    const deduped = records.filter((c) => {
      if (!c.document) return true
      if (seenDocuments.has(c.document)) return false
      seenDocuments.add(c.document)
      return true
    })

    const { synced, errors } = await upsertChunked(
      deduped,
      (c) => prisma.customer.upsert({
        where: { companyId_loja_protheusCode: { companyId, loja: c.loja, protheusCode: c.protheusCode } },
        update: customerFields(c),
        create: { companyId, protheusCode: c.protheusCode, loja: c.loja, ...customerFields(c) },
      }),
      (c) => `${c.protheusCode}/${c.loja}`
    )

    await logProtheusCall({
      companyId,
      operation:     operationLabel,
      endpointKey:   'apiCliente',
      success:       true,
      durationMs:    Date.now() - t0,
      recordsSynced: synced,
      totalRecords:  totalRecords || totalFetched,
    })

    return { synced, total: totalRecords || totalFetched, errors }
  } catch (err: unknown) {
    const e = err as { response?: { status?: number }; message?: string }
    await logProtheusCall({
      companyId,
      operation:    operationLabel,
      endpointKey:  'apiCliente',
      success:      false,
      httpStatus:   e.response?.status,
      durationMs:   Date.now() - t0,
      errorMessage: e.message,
    })
    throw err
  }
}
