import { by, element, waitFor } from 'detox'

// Navega para a aba Pedidos (onde fica o FAB "Novo pedido") e aguarda o FAB.
// O login cai na Dashboard, então todo fluxo de pedido precisa passar por aqui.
export async function goToPedidos() {
  await waitFor(element(by.id('tab-pedidos')))
    .toBeVisible()
    .withTimeout(10000)
  await element(by.id('tab-pedidos')).tap()
  await waitFor(element(by.id('btn-novo-pedido')))
    .toBeVisible()
    .withTimeout(10000)
}

const STEP_TIMEOUT = 10000

// Percorre o wizard de novo pedido (cliente → filial → produto → confirmação) e toca
// em "Confirmar". Cada passo espera o elemento aparecer: a sincronização do Detox fica
// desligada após o login (ver helpers/auth.ts), então nada é aguardado implicitamente.
export async function fillOrderWizard(customerName = 'Cliente Teste') {
  await waitFor(element(by.id('input-busca-cliente')))
    .toBeVisible()
    .withTimeout(STEP_TIMEOUT)
  await element(by.id('input-busca-cliente')).typeText(customerName)
  // Espera o resultado da busca (debounce) — não o item 0 da lista anterior
  await waitFor(element(by.id('resultado-cliente-0').withDescendant(by.text(customerName))))
    .toBeVisible()
    .withTimeout(STEP_TIMEOUT)
  await element(by.id('resultado-cliente-0')).tap()

  await waitFor(element(by.id('btn-adicionar-produto-0')))
    .toBeVisible()
    .withTimeout(STEP_TIMEOUT)
  await element(by.id('btn-adicionar-produto-0')).tap()

  await waitFor(element(by.id('produto-0')))
    .toBeVisible()
    .withTimeout(STEP_TIMEOUT)
  await element(by.id('produto-0')).tap()
  await element(by.id('btn-proximo-step')).tap()

  // O resumo é um ScrollView e o botão fica abaixo da dobra
  await waitFor(element(by.id('scroll-confirmacao')))
    .toBeVisible()
    .withTimeout(STEP_TIMEOUT)
  await element(by.id('scroll-confirmacao')).scrollTo('bottom')
  await waitFor(element(by.id('btn-confirmar-pedido')))
    .toBeVisible()
    .withTimeout(STEP_TIMEOUT)
  await element(by.id('btn-confirmar-pedido')).tap()
}
