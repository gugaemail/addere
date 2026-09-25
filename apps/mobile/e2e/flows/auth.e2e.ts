import { by, device, element, waitFor } from 'detox'
import { launchFreshApp, loginAs, waitForHome } from '../helpers/auth'

describe('Autenticação', () => {
  beforeEach(async () => {
    await launchFreshApp()
  })

  it('login com credenciais válidas', async () => {
    // A home é `screen-hoje` ou `screen-home` conforme a flag da empresa
    await loginAs('rep')
  })

  it('rejeita credenciais inválidas', async () => {
    await element(by.id('input-email')).typeText('errado@teste.com')
    await element(by.id('input-password')).typeText('senhaerrada')
    await element(by.id('btn-login')).tap()
    await waitFor(element(by.id('error-login')))
      .toBeVisible()
      .withTimeout(3000)
  })

  it('persiste sessão após restart do app', async () => {
    await loginAs('rep')
    await device.reloadReactNative()
    await waitForHome(15000)
  })
})
