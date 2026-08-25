import { by, device, element, waitFor } from 'detox'

// Timeouts generosos: em build debug o app carrega o bundle do Metro e a API
// pode estar fria (Render) — 5s costuma ser pouco para o primeiro login.
const HOME_TIMEOUT = 20000
const ONBOARDING_STEPS = 3

// A home depende da flag da empresa: com `intelligenceEnabled` o app abre na
// aba Hoje (E12/E13); sem a flag, no dashboard legado.
const HOME_IDS = ['screen-hoje', 'screen-home'] as const
export type HomeId = (typeof HOME_IDS)[number]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Lança o app do zero, sem sessão nem storage de execuções anteriores.
// `delete: true` reinstala o app (limpa AsyncStorage) e, no iOS, o keychain
// (SecureStore) precisa ser limpo à parte — senão a sessão sobrevive ao relaunch.
export async function launchFreshApp() {
  if (device.getPlatform() === 'ios') {
    await device.clearKeychain()
  }
  // `location: 'inuse'` já concede o GPS do check-in de visita (E13): sem isso o
  // "Cheguei" abre o prompt do sistema e trava os toques seguintes.
  await device.launchApp({
    newInstance: true,
    delete: true,
    permissions: { location: 'inuse' },
  })
}

// Espera a home que existir e devolve qual apareceu. Faz polling curto nas duas
// em vez de esperar o timeout inteiro na primeira — senão a suíte paga 20s toda
// vez que a Inteligência está desligada.
export async function waitForHome(timeout = HOME_TIMEOUT): Promise<HomeId> {
  const deadline = Date.now() + timeout
  let lastError: unknown
  while (Date.now() < deadline) {
    for (const id of HOME_IDS) {
      try {
        await waitFor(element(by.id(id)))
          .toBeVisible()
          .withTimeout(500)
        return id
      } catch (error) {
        lastError = error
      }
    }
  }
  throw new Error(
    `Nenhuma home visível após ${timeout}ms (esperado ${HOME_IDS.join(' ou ')}): ${String(lastError)}`
  )
}

// Ao enviar o formulário de login o iOS oferece salvar a senha no keychain
// ("Salvar Senha?"). O diálogo é um remote view do sistema hospedado numa UIView
// de tela cheia dentro da janela do app: o Detox não consegue tocá-lo (nem por
// `by.label`) e todo toque seguinte falha com "View is not hittable at its
// visible point". Relançar o app descarta o diálogo — e a sessão sobrevive,
// porque o token fica no SecureStore/keychain (só `delete: true` limparia).
async function dismissSavePasswordPrompt() {
  if (device.getPlatform() !== 'ios') return
  // Mandar para o background não resolve (o diálogo volta com o app), então
  // relançamos: o token já está no SecureStore/keychain e sobrevive ao restart.
  // A pausa dá tempo do `login()` terminar de gravar antes de matar o processo.
  await sleep(2000)
  await device.launchApp({ newInstance: true, permissions: { location: 'inuse' } })
  await sleep(800)
}

// Toque com retry: em build debug a janela pode estar em transição logo após o
// relaunch.
async function tapWithRetry(testID: string, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await element(by.id(testID)).tap()
      return
    } catch (error) {
      if (attempt === attempts) throw error
      await sleep(600)
    }
  }
}

// Após o primeiro login o app mostra o onboarding (3 telas) antes da home.
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
    // Deixa o fade do Modal terminar antes do primeiro toque
    if (i === 0) await sleep(600)
    await tapWithRetry('btn-onboarding-next')
  }
  // A Modal some com fade — sem esperar, o próximo tap cai nela e se perde
  await waitFor(element(by.id('screen-onboarding')))
    .not.toExist()
    .withTimeout(5000)
}

export async function loginAs(role: 'rep' | 'manager'): Promise<HomeId> {
  const credentials = {
    rep: { email: 'rep@addere.test', password: 'test1234' },
    manager: { email: 'manager@addere.test', password: 'test1234' },
  }
  await element(by.id('input-email')).typeText(credentials[role].email)
  await element(by.id('input-password')).typeText(credentials[role].password)
  await element(by.id('btn-login')).tap()

  // Espera o login concluir (onboarding no 1º acesso, home nas vezes seguintes)
  // — só olhando a tela, sem tocar, porque o diálogo do iOS pode estar por cima.
  await waitFor(element(by.id('btn-onboarding-next')))
    .toBeVisible()
    .withTimeout(HOME_TIMEOUT)
    .catch(() => waitForHome())
  await dismissSavePasswordPrompt()

  // Depois do login a home carrega atrás do onboarding com Skeletons pulsando
  // (Animated.loop) e, em build debug, o LogBox — a main queue nunca fica ociosa
  // e a sincronização do Detox estoura o timeout. Os fluxos seguem via polling do waitFor.
  await device.disableSynchronization()
  await dismissOnboardingIfShown()
  return waitForHome()
}
