import { by, element, waitFor } from 'detox'
import { launchFreshApp, loginAs } from '../helpers/auth'
import { fillOrderWizard, goToPedidos } from '../helpers/navigation'

describe('Pedido online', () => {
  beforeAll(async () => {
    await launchFreshApp()
    await loginAs('rep')
  })

  it('cria pedido pelo wizard de 3 passos e confirma sincronização', async () => {
    // O FAB "Novo pedido" fica na aba Pedidos (login cai na Dashboard)
    await goToPedidos()
    await element(by.id('btn-novo-pedido')).tap()

    await fillOrderWizard()

    // Feedback imediato: alerta nativo de sucesso (pedido enviado direto à API)
    await waitFor(element(by.text('Pedido criado')))
      .toBeVisible()
      .withTimeout(10000)
    await element(by.text('OK')).tap()

    // De volta à lista de pedidos: nada ficou na fila offline
    await waitFor(element(by.id('sync-status-ok')))
      .toBeVisible()
      .withTimeout(5000)
  })
})
