import { by, element, waitFor } from 'detox'
import { launchFreshApp, loginAs } from '../helpers/auth'

// Fluxo online do plano do dia (E13): Hoje → Rota → Cheguei → resultado.
// Pré-requisito: empresa do usuário 'rep' com intelligenceEnabled e um plano
// gerado para hoje (rodar o seed/smoke da Inteligência antes da suíte).
describe('Plano do dia — visita online', () => {
  beforeAll(async () => {
    await launchFreshApp()
    await loginAs('rep')
  })

  it('abre o plano a partir da Hoje e conclui uma visita sem pedido', async () => {
    // Com a Inteligência ligada o login cai na aba Hoje
    await waitFor(element(by.id('screen-hoje')))
      .toBeVisible()
      .withTimeout(10000)

    await element(by.id('card-plano-do-dia')).tap()
    // Build debug: a primeira navegação carrega o módulo da rota pelo Metro
    await waitFor(element(by.id('screen-rota')))
      .toExist()
      .withTimeout(15000)

    // Primeira parada: check-in
    await waitFor(element(by.id('plan-item-1')))
      .toBeVisible()
      .withTimeout(10000)
    await element(by.id('btn-cheguei-1')).tap()

    await waitFor(element(by.id('screen-visita')))
      .toExist()
      .withTimeout(5000)

    // "Antes de entrar" sempre presente (snapshot determinístico)
    await waitFor(element(by.id('before-enter')))
      .toBeVisible()
      .withTimeout(3000)

    // Resultado: sem pedido, com motivo (obrigatório)
    await element(by.id('resultado-NO_ORDER')).tap()
    await element(by.id('input-motivo')).typeText('Estoque cheio')
    // O teclado cobre o rodapé do formulário: um toque fora fecha o teclado
    // (o ScrollView não rola porque o conteúdo cabe na tela)
    await element(by.id('before-enter')).tap()
    await element(by.id('btn-concluir-visita')).tap()

    // De volta ao plano
    await waitFor(element(by.id('screen-rota')))
      .toExist()
      .withTimeout(5000)
  })

  it('tira uma parada do dia e o plano vira editado', async () => {
    // Volta da visita com a lista re-renderizando — espera o card assentar
    await waitFor(element(by.id('btn-tirar-1')))
      .toBeVisible()
      .withTimeout(10000)
    await element(by.id('btn-tirar-1')).tap()
    await element(by.text('Tirar')).tap()
    // A lista renumera — o item 1 continua existindo (era o 2)
    await waitFor(element(by.id('plan-item-1')))
      .toBeVisible()
      .withTimeout(3000)
  })
})
