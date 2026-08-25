import { by, element, waitFor } from 'detox'
import { launchFreshApp, loginAs } from '../helpers/auth'
import { goOffline, goOnline } from '../helpers/network'

// Visita offline (E13, Android — molde do order-offline-sync): o check-in e o
// resultado entram na fila sem rede e sincronizam ao reconectar. O briefing
// vem do cache (pré-buscado quando o plano abriu online).
describe('Visita offline com sync posterior', () => {
  beforeAll(async () => {
    await launchFreshApp()
    await loginAs('rep')
  })

  it('faz check-in e registra resultado sem rede; sincroniza ao voltar', async () => {
    // Abre o plano ONLINE primeiro (pré-busca briefings das paradas)
    await waitFor(element(by.id('screen-hoje')))
      .toBeVisible()
      .withTimeout(10000)
    await element(by.id('card-plano-do-dia')).tap()
    // Build debug: a primeira navegação carrega o módulo da rota pelo Metro
    await waitFor(element(by.id('plan-item-1')))
      .toBeVisible()
      .withTimeout(15000)

    await goOffline()

    // Check-in offline: entra na fila (SyncPill aparece) e a tela abre normal
    await element(by.id('btn-cheguei-1')).tap()
    await waitFor(element(by.id('screen-visita')))
      .toExist()
      .withTimeout(5000)
    await waitFor(element(by.id('sync-pill')))
      .toBeVisible()
      .withTimeout(3000)

    // "Antes de entrar" continua renderizando do snapshot (offline)
    await waitFor(element(by.id('before-enter')))
      .toBeVisible()
      .withTimeout(3000)

    await element(by.id('resultado-RESCHEDULED')).tap()
    await element(by.id('btn-concluir-visita')).tap()
    await waitFor(element(by.id('screen-rota')))
      .toExist()
      .withTimeout(5000)

    await goOnline()

    // Fila esvazia: a SyncPill some quando visit + visitResult sincronizam
    await waitFor(element(by.id('sync-pill')))
      .not.toBeVisible()
      .withTimeout(15000)
  })
})
