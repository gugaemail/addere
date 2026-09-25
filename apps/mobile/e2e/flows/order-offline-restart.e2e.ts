import { by, device, element, expect, waitFor } from 'detox'
import { launchFreshApp, loginAs } from '../helpers/auth'
import { fillOrderWizard, goToPedidos } from '../helpers/navigation'
import { goOffline, goOnline } from '../helpers/network'

describe('Persistência da fila após reinício do app', () => {
  beforeAll(async () => {
    await launchFreshApp()
    await loginAs('rep')
  })

  it('mantém pedido na fila após app ser morto e reaberto', async () => {
    // Criar pedido offline
    await goOffline()

    await goToPedidos()

    await element(by.id('btn-novo-pedido')).tap()
    await fillOrderWizard()

    await waitFor(element(by.text('Pedido salvo offline')))
      .toBeVisible()
      .withTimeout(3000)
    await element(by.text('OK')).tap()

    // Verificar que fila tem 1 item antes do restart
    await element(by.id('sync-status-pending')).tap()
    await waitFor(element(by.id('queue-item-0')))
      .toBeVisible()
      .withTimeout(3000)
    await expect(element(by.id('queue-count-badge'))).toHaveText('1')

    // Matar e reusar o app sem nova instância (preserva AsyncStorage)
    await device.sendToHome()
    await device.terminateApp()
    await device.launchApp() // sem newInstance: true para preservar storage

    // Autenticar novamente (tokens persistidos via SecureStore)
    // Se sessão não persistir, fazer login manual
    try {
      await waitFor(element(by.id('sync-status-pending')))
        .toBeVisible()
        .withTimeout(5000)
    } catch {
      await loginAs('rep')
      await element(by.id('sync-status-pending')).tap()
    }

    // Verificar que a fila sobreviveu ao reinício
    await waitFor(element(by.id('queue-item-0')))
      .toBeVisible()
      .withTimeout(5000)
    await expect(element(by.id('queue-count-badge'))).toHaveText('1')

    // Voltar online e aguardar sync automático
    await goOnline()

    await waitFor(element(by.id('sync-status-syncing')))
      .toBeVisible()
      .withTimeout(5000)
    await waitFor(element(by.id('sync-status-ok')))
      .toBeVisible()
      .withTimeout(15000)

    // Fila deve estar vazia
    await waitFor(element(by.id('empty-queue-message')))
      .toBeVisible()
      .withTimeout(5000)
  })
})
