import { by, device, element, expect, waitFor } from 'detox'
import { launchFreshApp, loginAs } from '../helpers/auth'
import { fillOrderWizard, goToPedidos } from '../helpers/navigation'
import { adbShell, goOffline, goOnline } from '../helpers/network'

describe('Reenvio manual de pedido com erro', () => {
  beforeAll(async () => {
    await launchFreshApp()
    await loginAs('rep')
  })

  it('exibe botão de reenvio e permite retry manual após falha de sync', async () => {
    // Criar pedido offline
    await goOffline()

    await goToPedidos()

    await element(by.id('btn-novo-pedido')).tap()
    await fillOrderWizard()

    await waitFor(element(by.text('Pedido salvo offline')))
      .toBeVisible()
      .withTimeout(3000)
    await element(by.text('OK')).tap()

    // Navegar para pendentes
    await element(by.id('sync-status-pending')).tap()

    await waitFor(element(by.id('queue-item-0')))
      .toBeVisible()
      .withTimeout(3000)
    await expect(element(by.id('queue-count-badge'))).toHaveText('1')

    // Voltar online com rota /orders bloqueada para forçar erro no sync
    await device.setURLBlacklist(['.*/orders.*'])
    if (device.getPlatform() === 'android') {
      adbShell('svc wifi enable')
      adbShell('svc data enable')
    }
    await new Promise<void>((r) => setTimeout(r, 3000))

    // Aguardar estado de erro
    await waitFor(element(by.id('sync-status-error')))
      .toBeVisible()
      .withTimeout(10000)

    // Acessar tela de pendentes e verificar botão Reenviar
    await element(by.id('sync-status-error')).tap()

    // Liberar API completamente
    await device.setURLBlacklist([])

    // Tap no botão "Reenviar" do primeiro item com erro
    await waitFor(element(by.text('Reenviar')))
      .toBeVisible()
      .withTimeout(3000)
    await element(by.text('Reenviar')).tap()

    // Aguardar sync completar
    await waitFor(element(by.id('sync-status-ok')))
      .toBeVisible()
      .withTimeout(10000)

    await waitFor(element(by.id('empty-queue-message')))
      .toBeVisible()
      .withTimeout(5000)
  })
})
