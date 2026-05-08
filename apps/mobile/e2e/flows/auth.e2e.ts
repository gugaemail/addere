import { loginAs } from '../helpers/auth'

describe('Autenticação', () => {
  beforeEach(async () => {
    await device.launchApp({ newInstance: true })
  })

  it('login com credenciais válidas', async () => {
    await loginAs('rep')
    await expect(element(by.id('screen-home'))).toBeVisible()
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
    await waitFor(element(by.id('screen-home')))
      .toBeVisible()
      .withTimeout(5000)
  })
})
