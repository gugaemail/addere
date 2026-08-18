import type { OrderItemDetail, Product } from '@addere/types'

// Item do carrinho — modelo único usado pelo wizard de novo pedido
// e pela tela de edição (antes cada tela tinha um shape próprio).
export interface CartItem {
  productId:     string
  productName:   string
  productUnit:   string
  quantity:      number
  unitPrice:     number
  discount:      number
  descricao?:    string
  largura?:      number
  espessura?:    number
  encolhimento?: string
  xcrav?:        '1' | '2'
  tara?:         number
}

// Cria um item de carrinho a partir de um produto do catálogo
export function cartItemFromProduct(product: Product): CartItem {
  return {
    productId:   product.id,
    productName: product.name,
    productUnit: product.unit,
    quantity:    1,
    unitPrice:   Number(product.price),
    discount:    0,
    descricao:   product.name,
  }
}

// Converte um item vindo da API (pedido existente) para o modelo do carrinho
export function cartItemFromOrderItem(item: OrderItemDetail): CartItem {
  return {
    productId:    item.product.id,
    productName:  item.product.name,
    productUnit:  item.product.unit,
    quantity:     Number(item.quantity),
    unitPrice:    Number(item.unitPrice),
    discount:     Number(item.discount),
    descricao:    item.descricao ?? item.product.name,
    largura:      item.largura != null ? Number(item.largura) : undefined,
    espessura:    item.espessura != null ? Number(item.espessura) : undefined,
    encolhimento: item.encolhimento ?? undefined,
    xcrav:        item.xcrav === '1' || item.xcrav === '2' ? item.xcrav : undefined,
    tara:         item.tara != null ? Number(item.tara) : undefined,
  }
}

// Soma o total do carrinho aplicando desconto percentual por item
export function cartTotal(cart: CartItem[]): number {
  return cart.reduce(
    (sum, i) => sum + i.unitPrice * i.quantity * (1 - i.discount / 100),
    0,
  )
}

// Converte o carrinho para o payload de criação/atualização de pedido
export function cartToOrderItems(cart: CartItem[]) {
  return cart.map((i) => ({
    productId:    i.productId,
    quantity:     i.quantity,
    discount:     i.discount,
    unitPrice:    i.unitPrice,
    descricao:    i.descricao,
    largura:      i.largura,
    espessura:    i.espessura,
    encolhimento: i.encolhimento,
    xcrav:        i.xcrav,
    tara:         i.tara,
  }))
}
