import { loginAs } from '../helpers/auth'
import { goToPedidos } from '../helpers/navigation'

describe('Pedido online', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true })
    await loginAs('rep')
  })

  it('cria pedido pelo wizard de 3 passos e confirma sincronização', async () => {
    // O FAB "Novo pedido" fica na aba Pedidos (login cai na Dashboard)
    await goToPedidos()
    await element(by.id('btn-novo-pedido')).tap()

    // Passo 1 — cliente e filial
    await element(by.id('input-busca-cliente')).typeText('Cliente Teste')
    await waitFor(element(by.id('resultado-cliente-0')))
      .toBeVisible()
      .withTimeout(5000)
    await element(by.id('resultado-cliente-0')).tap()
    await waitFor(element(by.id('btn-adicionar-produto-0')))
      .toBeVisible()
      .withTimeout(5000)
    await element(by.id('btn-adicionar-produto-0')).tap()

    // Passo 2 — produtos
    await waitFor(element(by.id('produto-0')))
      .toBeVisible()
      .withTimeout(5000)
    await element(by.id('produto-0')).tap()
    await element(by.id('btn-proximo-step')).tap()

    // Passo 3 — confirmação
    await element(by.id('btn-confirmar-pedido')).tap()

    // Feedback imediato: alerta nativo de sucesso (pedido enviado direto à API)
    await waitFor(element(by.label('Pedido criado')))
      .toBeVisible()
      .withTimeout(10000)
    await element(by.label('OK')).tap()

    // De volta à lista de pedidos: nada ficou na fila offline
    await waitFor(element(by.id('sync-status-ok')))
      .toBeVisible()
      .withTimeout(5000)
  })
})
