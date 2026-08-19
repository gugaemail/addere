import { by, element, expect, waitFor } from 'detox'
import { launchFreshApp, loginAs } from '../helpers/auth'
import { fillOrderWizard, goToPedidos } from '../helpers/navigation'
import { goOffline, goOnline } from '../helpers/network'

describe('Pedido offline com sync posterior', () => {
  beforeAll(async () => {
    await launchFreshApp()
    await loginAs('rep')
  })

  it('enfileira pedido offline e sincroniza ao reconectar', async () => {
    await goOffline()

    // Verificar SyncStatusBar mostra offline
    await waitFor(element(by.id('sync-status-offline')))
      .toBeVisible()
      .withTimeout(3000)

    // Criar pedido normalmente
    await goToPedidos()
    await element(by.id('btn-novo-pedido')).tap()
    await fillOrderWizard()

    // Verificar alerta nativo "salvo offline"
    await waitFor(element(by.text('Pedido salvo offline')))
      .toBeVisible()
      .withTimeout(3000)
    await element(by.text('OK')).tap()

    // Verificar na fila de pendentes
    await element(by.id('sync-status-pending')).tap()
    await expect(element(by.id('queue-item-0'))).toBeVisible()
    await expect(element(by.id('queue-count-badge'))).toHaveText('1')

    // Voltar online
    await goOnline()

    // Aguardar sync automático
    await waitFor(element(by.id('sync-status-syncing')))
      .toBeVisible()
      .withTimeout(5000)
    await waitFor(element(by.id('sync-status-ok')))
      .toBeVisible()
      .withTimeout(10000)

    // Verificar fila vazia
    await expect(element(by.id('empty-queue-message'))).toBeVisible()
  })

  it('usa cache do catálogo quando offline', async () => {
    await goOffline()
    await goToPedidos()
    await element(by.id('btn-novo-pedido')).tap()

    // Catálogo deve carregar do cache
    await waitFor(element(by.id('produto-lista')))
      .toBeVisible()
      .withTimeout(3000)
    await expect(element(by.id('cache-badge'))).toBeVisible()

    await goOnline()
  })
})
