// Navega para a aba Pedidos (onde fica o FAB "Novo pedido") e aguarda o FAB.
// O login cai na Dashboard, então todo fluxo de pedido precisa passar por aqui.
export async function goToPedidos() {
  await element(by.id('tab-pedidos')).tap()
  await waitFor(element(by.id('btn-novo-pedido')))
    .toBeVisible()
    .withTimeout(3000)
}
