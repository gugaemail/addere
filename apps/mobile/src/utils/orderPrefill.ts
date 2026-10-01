// Ponte da Visita (E13) para o pedido: o mix sugerido pelo motor viaja na
// navegação como lista de códigos do Protheus e vira carrinho aqui.
//
// Sem isto o botão "Iniciar pedido com esse mix" abria o formulário em branco —
// o vendedor tinha que achar o cliente e cada produto de novo, na frente dele.
import type { Product } from '@addere/types'
import { cartItemFromProduct, type CartItem } from '../components/order-form/types'

/** Lê o parâmetro `mix` da navegação: códigos separados por vírgula. */
export function parseMixParam(raw: string | string[] | undefined): string[] {
  const text = Array.isArray(raw) ? raw.join(',') : (raw ?? '')
  const codes = text
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean)
  // O motor pode sugerir o mesmo código por dois caminhos (usual e cross-sell);
  // duplicar viraria duas linhas iguais no carrinho.
  return [...new Set(codes)]
}

export interface MixCart {
  cart: CartItem[]
  /** Códigos sugeridos que não existem no catálogo — o vendedor precisa saber. */
  missing: string[]
}

/**
 * Casa os códigos do mix com o catálogo pelo `protheusCode`, preservando a
 * ordem do motor (o primeiro item é o de maior peso).
 *
 * Produto fora do catálogo não vira item silenciosamente: ele sai em `missing`
 * para a tela avisar. O catálogo do app pode estar sem um produto que o
 * histórico de vendas tem — inativado no Protheus, ou ainda não sincronizado.
 */
export function cartFromMix(codes: string[], products: Product[]): MixCart {
  const byCode = new Map<string, Product>()
  for (const product of products) {
    if (product.protheusCode) byCode.set(product.protheusCode, product)
  }

  const cart: CartItem[] = []
  const missing: string[] = []
  for (const code of codes) {
    const product = byCode.get(code)
    if (product) cart.push(cartItemFromProduct(product))
    else missing.push(code)
  }
  return { cart, missing }
}
