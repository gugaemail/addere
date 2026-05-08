import { loginAs } from '../helpers/auth'

describe('Pedido online', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true })
    await loginAs('rep')
  })

  it('cria pedido e confirma sincronização', async () => {
    await element(by.id('btn-novo-pedido')).tap()
    await element(by.id('input-busca-cliente')).typeText('Cliente Teste')
    await element(by.id('resultado-cliente-0')).tap()
    await element(by.id('btn-adicionar-produto')).tap()
    await element(by.id('produto-0')).tap()
    await element(by.id('btn-confirmar-pedido')).tap()

    // Verificar feedback imediato
    await waitFor(element(by.id('toast-pedido-enviado')))
      .toBeVisible()
      .withTimeout(5000)

    // Verificar que NÃO aparece na fila de pendentes
    await element(by.id('sync-status-bar')).tap()
    await expect(element(by.id('empty-queue-message'))).toBeVisible()
  })
})
