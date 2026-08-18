import { prisma } from '@addere/db'
import { protheusPost } from './protheus.client'
import { notFound, unprocessable, badGateway } from '../../lib/errors'
import { logProtheusCall } from './protheus-logger'
import { getCredentials, toStr } from './utils'
import { buildOrderPayload } from './order-payload'

const orderSyncInclude = {
  branch:         true,
  customer:       true,
  user:           true,
  transportadora: true,
  condPag:        true,
  items: { include: { product: true } },
} as const

export async function syncOrderToProtheus(orderId: string, companyId: string) {
  // Atomic claim: garante que apenas uma requisição concorrente processa o pedido.
  // updateMany retorna count=0 se o pedido não estiver em PENDING, evitando race condition.
  const claimed = await prisma.order.updateMany({
    where: { id: orderId, companyId, status: 'PENDING' },
    data:  { status: 'SYNCED' },
  })

  if (claimed.count === 0) {
    const exists = await prisma.order.findFirst({ where: { id: orderId, companyId } })
    throw exists
      ? unprocessable('Apenas pedidos com status PENDING podem ser sincronizados')
      : notFound('Pedido não encontrado')
  }

  // Carrega detalhes do pedido e da empresa em paralelo agora que somos donos do lock
  const [order, company] = await Promise.all([
    prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderSyncInclude }),
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
  ])

  // Reverte o lock em caso de qualquer falha após o claim
  const revertToPending = () => prisma.order.update({ where: { id: orderId }, data: { status: 'PENDING' } })

  try {
    if (!company.apiPedido) throw unprocessable('URL apiPedido não configurada')

    const creds   = getCredentials(company)
    const payload = buildOrderPayload(order)

    const t0 = Date.now()
    const rawResponse = await protheusPost(companyId, company.apiPedido, payload, creds)
    const ms = Date.now() - t0

    // Protheus retorna array: [{ "Retorno": "100", "Mensagem": "...", "Pedido": "012283" }]
    const responseArray = Array.isArray(rawResponse) ? rawResponse as Record<string, unknown>[] : [rawResponse as Record<string, unknown>]
    const first = responseArray[0] ?? {}
    const retorno = toStr(first['Retorno'])

    if (retorno !== '100') {
      throw badGateway(toStr(first['Mensagem']) || 'Erro ao gravar pedido no Protheus')
    }

    const protheusOrderId = toStr(first['Pedido']) || null
    if (!protheusOrderId) throw badGateway('Pedido gravado no Protheus mas número do pedido não foi retornado')

    await prisma.order.update({
      where: { id: orderId },
      data: { protheusOrderId, syncedAt: new Date() },
    })

    await logProtheusCall({
      companyId,
      operation:     'syncOrder',
      endpointKey:   'apiPedido',
      success:       true,
      durationMs:    ms,
      recordsSynced: 1,
      metadata:      { orderId, protheusOrderId },
    })

    return { protheusOrderId, mensagem: toStr(first['Mensagem']) }
  } catch (err) {
    const e = err as { response?: { status?: number; data?: unknown }; message?: string }
    await logProtheusCall({
      companyId,
      operation:    'syncOrder',
      endpointKey:  'apiPedido',
      success:      false,
      httpStatus:   e.response?.status,
      errorMessage: e.message,
      // Resposta do ERP fica só no log interno — nunca em stdout nem em resposta HTTP
      metadata:     { orderId, protheusResponse: e.response?.data ?? null },
    })
    await revertToPending()
    throw err
  }
}

export async function consultOrderStatus(orderId: string, companyId: string) {
  const [order, company] = await Promise.all([
    prisma.order.findFirst({
      where: { id: orderId, companyId },
      include: { branch: true },
    }),
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
  ])

  if (!order) throw notFound('Pedido não encontrado')
  if (!order.protheusOrderId) throw unprocessable('Pedido ainda não foi sincronizado com o Protheus (sem número de pedido)')
  if (!company.apiConsPed) throw unprocessable('URL apiConsPed não configurada')
  if (!order.branch.idProtheus) throw unprocessable('Filial sem código Protheus configurado')

  const creds = getCredentials(company)
  const payload = { C5_FILIAL: order.branch.idProtheus, C5_NUM: order.protheusOrderId }
  const t0 = Date.now()

  try {
    const rawResponse = await protheusPost(companyId, company.apiConsPed, payload, creds) as Record<string, unknown>

    const codigo = toStr(rawResponse['codigo'])
    const status = toStr(rawResponse['status'])

    if (status) {
      await prisma.order.update({
        where: { id: orderId },
        data: { protheusStatus: status },
      })
    }

    await logProtheusCall({
      companyId,
      operation:   'consultOrder',
      endpointKey: 'apiConsPed',
      success:     true,
      durationMs:  Date.now() - t0,
      metadata:    { orderId, protheusOrderId: order.protheusOrderId },
    })

    return { protheusOrderId: order.protheusOrderId, codigo, status }
  } catch (err: unknown) {
    const e = err as { response?: { status?: number }; message?: string }
    await logProtheusCall({
      companyId,
      operation:    'consultOrder',
      endpointKey:  'apiConsPed',
      success:      false,
      httpStatus:   e.response?.status,
      durationMs:   Date.now() - t0,
      errorMessage: e.message,
      metadata:     { orderId },
    })
    throw err
  }
}

// Dry run: monta o payload e chama o Protheus sem alterar o status do pedido no banco.
// Útil para depuração — pode ser chamado em pedidos PENDING ou SYNCED.
// Usa o MESMO builder de payload do envio real (buildOrderPayload).
export async function testOrderSync(orderId: string, companyId: string) {
  const [order, company] = await Promise.all([
    prisma.order.findFirst({ where: { id: orderId, companyId }, include: orderSyncInclude }),
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
  ])

  if (!order) throw notFound('Pedido não encontrado')
  if (!company.apiPedido) throw unprocessable('URL apiPedido não configurada')

  const creds   = getCredentials(company)
  const payload = buildOrderPayload(order)

  const t0 = Date.now()
  try {
    const rawResponse = await protheusPost(companyId, company.apiPedido, payload, creds)
    const ms = Date.now() - t0

    await logProtheusCall({
      companyId,
      operation:   'testOrder',
      endpointKey: 'apiPedido',
      success:     true,
      durationMs:  ms,
      metadata:    { orderId },
    })

    return { ok: true, orderStatus: order.status, ms, payload, rawResponse }
  } catch (err: unknown) {
    const e = err as { response?: { status?: number }; message?: string }
    await logProtheusCall({
      companyId,
      operation:    'testOrder',
      endpointKey:  'apiPedido',
      success:      false,
      httpStatus:   e.response?.status,
      durationMs:   Date.now() - t0,
      errorMessage: e.message,
      metadata:     { orderId },
    })
    throw err
  }
}
