import type {
  Order,
  OrderItem,
  Product,
  Customer,
  Branch,
  User,
  Transportadora,
  CondPag,
} from '@prisma/client'
import { unprocessable } from '../../lib/errors'
import { formatDateDDMMYYYY } from './utils'

export type OrderWithRelations = Order & {
  branch: Branch
  customer: Customer
  user: User
  transportadora: Transportadora | null
  condPag: CondPag | null
  items: (OrderItem & { product: Product })[]
}

/**
 * Monta o payload de gravação de pedido no Protheus.
 * Único builder — usado pelo envio real E pelo dry-run (test-order); antes o
 * dry-run tinha uma cópia divergente que omitia C6_TES e os campos C6_X*.
 */
export function buildOrderPayload(order: OrderWithRelations) {
  if (!order.branch.idProtheus) throw unprocessable('Filial sem código Protheus configurado')
  if (!order.customer.protheusCode) throw unprocessable('Cliente sem código Protheus configurado')
  if (!order.user.idVendProt)
    throw unprocessable('Vendedor sem código Protheus configurado (idVendProt)')

  const emissaoStr = formatDateDDMMYYYY(order.emissao ?? new Date())

  const itens = order.items.map((item) => {
    if (!item.product.protheusCode)
      throw unprocessable(`Produto "${item.product.name}" sem código Protheus configurado`)

    const discount = Number(item.discount)
    const qty = Number(item.quantity)
    const unitPrice = Number(item.unitPrice)
    const valdesc = Number(((unitPrice * qty * discount) / 100).toFixed(2))

    return {
      C6_FILIAL: order.branch.idProtheus,
      C6_PRODUTO: item.product.protheusCode,
      C6_QTDVEN: String(qty),
      C6_PRCVEN: String(unitPrice),
      C6_PRUNIT: String(unitPrice),
      C6_VALDESC: String(valdesc),
      ...(order.customer.tes ? { C6_TES: order.customer.tes } : {}),
      C6_XLARGUR: item.largura != null ? String(Number(item.largura)) : '0',
      C6_XEXPESS: item.espessura != null ? String(Number(item.espessura)) : '0',
      C6_XENCOLH: item.encolhimento ?? '',
      C6_XCRAV: item.xcrav ?? '',
      C6_XTARA: item.tara != null ? String(Number(item.tara)) : '0',
    }
  })

  const loja = order.customer.loja ?? '01'
  return {
    PEDIDO: [
      {
        C5_FILIAL: order.branch.idProtheus,
        C5_CLIENTE: order.customer.protheusCode,
        C5_CLIENT: order.customer.protheusCode,
        C5_LOJA: loja,
        C5_LOJACLI: loja,
        C5_XIDPED: order.id,
        C5_EMISSAO: emissaoStr,
        C5_VEND1: order.user.idVendProt,
        C5_DESCONT: '0',
        C5_TRANSP: order.transportadora?.protheusCode ?? '',
        C5_MENNOTA: order.mennota ?? '',
        C5_XOBS: order.notes ?? '',
        C5_CONDPAG: order.condPag?.protheusCode ?? '',
        ITENS: itens,
      },
    ],
  }
}
