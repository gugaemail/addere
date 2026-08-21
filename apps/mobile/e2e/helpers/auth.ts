import { by, device, element, waitFor } from 'detox'

// Timeouts generosos: em build debug o app carrega o bundle do Metro e a API
// pode estar fria (Render) — 5s costuma ser pouco para o primeiro login.
const HOME_TIMEOUT = 20000
const ONBOARDING_STEPS = 3

// Lança o app do zero, sem sessão nem storage de execuções anteriores.
// `delete: true` reinstala o app (limpa AsyncStorage) e, no iOS, o keychain
// (SecureStore) precisa ser limpo à parte — senão a sessão sobrevive ao relaunch.
export async function launchFreshApp() {
  if (device.getPlatform() === 'ios') {
    await device.clearKeychain()
  }
  await device.launchApp({ newInstance: true, delete: true })
}

// Após o primeiro login o app mostra o onboarding (3 telas) antes da Dashboard.
// Avança até o fim se ele estiver visível; segue em frente se não estiver.
export async function dismissOnboardingIfShown() {
  for (let i = 0; i < ONBOARDING_STEPS; i++) {
    try {
      await waitFor(element(by.id('btn-onboarding-next')))
        .toBeVisible()
        .withTimeout(i === 0 ? HOME_TIMEOUT : 3000)
    } catch {
      return
    }
    await element(by.id('btn-onboarding-next')).tap()
  }
  // A Modal some com fade — sem esperar, o próximo tap cai nela e se perde
  await waitFor(element(by.id('screen-onboarding')))
    .not.toExist()
    .withTimeout(5000)
}

export async function loginAs(role: 'rep' | 'manager') {
  const credentials = {
    rep: { email: 'rep@addere.test', password: 'test1234' },
    manager: { email: 'manager@addere.test', password: 'test1234' },
  }
  await element(by.id('input-email')).typeText(credentials[role].email)
  await element(by.id('input-password')).typeText(credentials[role].password)
  await element(by.id('btn-login')).tap()
  // Após o login a Dashboard carrega atrás do onboarding com Skeletons pulsando
  // (Animated.loop) e, em build debug, o LogBox — a main queue nunca fica ociosa
  // e a sincronização do Detox estoura o timeout. Os fluxos seguem via polling do waitFor.
  await device.disableSynchronization()
  await dismissOnboardingIfShown()
  await waitFor(element(by.id('screen-home')))
    .toBeVisible()
    .withTimeout(HOME_TIMEOUT)
}
