import { loginAs } from '../helpers/auth'
import { goOffline, goOnline } from '../helpers/network'

describe('Reenvio manual de pedido com erro', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true })
    await loginAs('rep')
  })

  it('exibe botão de reenvio e permite retry manual após falha de sync', async () => {
    // Criar pedido offline
    await goOffline()

    await element(by.id('btn-novo-pedido')).tap()
    await element(by.id('input-busca-cliente')).typeText('Cliente Teste')
    await element(by.id('resultado-cliente-0')).tap()
    await element(by.id('btn-adicionar-produto-0')).tap()
    await element(by.id('produto-0')).tap()
    await element(by.id('btn-proximo-step')).tap()
    await element(by.id('btn-confirmar-pedido')).tap()

    await waitFor(element(by.label('Pedido salvo offline')))
      .toBeVisible()
      .withTimeout(3000)
    await element(by.label('OK')).tap()

    // Navegar para pendentes
    await element(by.id('sync-status-pending')).tap()

    await waitFor(element(by.id('queue-item-0')))
      .toBeVisible()
      .withTimeout(3000)
    await expect(element(by.id('queue-count-badge'))).toHaveText('1')

    // Voltar online com rota /orders bloqueada para forçar erro no sync
    await device.setURLBlacklist(['.*/orders.*'])
    if (device.getPlatform() === 'android') {
      await device.execOnDevice('adb shell svc wifi enable')
      await device.execOnDevice('adb shell svc data enable')
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
