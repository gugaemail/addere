// Corpus do self-check (plano 012): o critério de qualquer regra nova.
// MUST_FAIL tem um texto por furo conhecido, escrito como o modelo escreveria.
// MUST_PASS tem respostas boas — regra que derrubar uma delas não entra, porque
// texto bom em só-motor também é defeito (o Hoje passou meses assim).
// Ao achar um texto real que escapou ou caiu sem motivo, acrescente aqui.
import { describe, it, expect } from 'vitest'
import { customerFacingViolations, selfCheck, type SelfCheckFacts } from '../self-check'

// Carteira: C1 atrasado, C2 bloqueado, C3 novo, cada um com os seus números
const portfolio: SelfCheckFacts = {
  customers: [
    { pseudonym: 'C1', status: 'LATE', numbers: [28, 41, 1500, 10] },
    { pseudonym: 'C2', status: 'BLOCKED', numbers: [1, 900, 35] },
    { pseudonym: 'C3', status: 'NEW', numbers: [2, 600] },
  ],
  numbers: [3, 12000, 4500], // contagem e meta
  freshnessLine: null,
  products: [
    { productCode: 'PA0001', productDesc: 'Café torrado 500g' },
    { productCode: 'PA0002', productDesc: 'Açúcar refinado 1kg' },
  ],
}

// Briefing: um cliente só, bloqueado
const blockedBriefing: SelfCheckFacts = {
  customers: [{ pseudonym: 'C1', status: 'BLOCKED' }],
  numbers: [28, 41, 1, 900, 35],
  freshnessLine: null,
}

// Briefing: um cliente só, novo
const newBriefing: SelfCheckFacts = {
  customers: [{ pseudonym: 'C1', status: 'NEW' }],
  numbers: [2, 600],
  freshnessLine: null,
}

// [rótulo, texto, fatos, trecho da violação esperada] — reprovar pelo motivo certo
const MUST_FAIL: Array<[string, string, SelfCheckFacts, string]> = [
  ['número certo no cliente errado', 'C3 está 41 dias sem comprar.', portfolio, 'número de outro cliente em C3'],
  ['número por extenso fora dos fatos', 'C1 tem sete pedidos parados.', portfolio, 'número fora dos fatos: 7'],
  ['produto inventado (código)', 'Leve o PA0099 para C1.', portfolio, 'produto fora dos fatos: PA0099'],
  [
    'pronome escapa da regra do bloqueado',
    'C1 está com título vencido. Ofereça a linha nova a ele.',
    blockedBriefing,
    'ação de venda para bloqueado C1',
  ],
  ['bloqueado: reposição', 'Aproveite a visita para a reposição de C2.', portfolio, 'bloqueado C2'],
  ['bloqueado: lançamento', 'Mostre o lançamento do mês para C2.', portfolio, 'bloqueado C2'],
  ['bloqueado: promoções (acento depois do ç)', 'Apresente as promoções da semana a C2.', portfolio, 'bloqueado C2'],
  ['bloqueado: montar o pedido', 'Com C2, vale montar o pedido de sempre.', portfolio, 'bloqueado C2'],
  ['bloqueado: novidades', 'Leve novidades para C2.', portfolio, 'bloqueado C2'],
  ['novo: costuma comprar', 'C3 costuma comprar todo mês.', portfolio, 'cliente novo C3'],
  ['novo: ciclo de N dias', 'Ele tem ciclo de 2 dias.', newBriefing, 'cliente novo C1'],
  ['pseudônimo em caixa baixa', 'Comece por c1 hoje.', portfolio, 'pseudônimo malformado: c1'],
  ['dupla negação é ordem de venda', 'Não deixe de oferecer o lançamento a C2.', portfolio, 'bloqueado C2'],
  ['negação em outro trecho não desarma', 'Não visite à tarde, ofereça o mix a C2.', portfolio, 'bloqueado C2'],
  ['bloqueio citado em outro trecho não desarma', 'C2 está bloqueado, mas ofereça o mix novo.', portfolio, 'bloqueado C2'],
  // A janela do fato só é liberada como janela: "há 12 meses" é afirmação
  ['"há 12 meses" continua cobrado', 'C1 não compra há 12 meses.', portfolio, 'número fora dos fatos: 12'],
  [
    'medida do produto trocada (eval 15/10)',
    'O PVC Esticável Dom. 280x030 saiu do mix de C1.',
    {
      ...portfolio,
      products: [{ productCode: 'PA0003', productDesc: 'PVC ESTICAVEL DOM. 280 X 300' }],
    },
    'número fora dos fatos: 30',
  ],
]

const MUST_PASS: Array<[string, string, SelfCheckFacts]> = [
  [
    'leitura da carteira com números de cada um no lugar certo',
    'C1 está 41 dias sem comprar, contra um ciclo de 28 dias — ticket de R$ 1.500. ' +
      'C2 tem 1 título de R$ 900 vencido há 35 dias: resolva a pendência antes de qualquer conversa.',
    portfolio,
  ],
  ['meta e contagem são globais', 'Faltam R$ 4.500 para a meta de R$ 12.000; 3 clientes pedem atenção.', portfolio],
  ['descrição de produto com gramatura', 'Ofereça a C1 o Café torrado 500g, que saiu do mix.', portfolio],
  ['código de produto conhecido', 'C1 parou de levar o PA0002.', portfolio],
  [
    'unidade não é código',
    'C1 levava caixas de 10KG.',
    { ...portfolio, numbers: [...portfolio.numbers, 10] },
  ],
  ['bloqueado: resolver pendência', 'C2 está bloqueado: cobre o título de R$ 900 antes de visitar.', portfolio],
  ['bloqueado em briefing: só pendência', 'Título de R$ 900 vencido há 35 dias. Resolva com o financeiro antes de entrar.', blockedBriefing],
  ['novo sem certeza de ciclo', 'C3 fez 2 pedidos; ainda é cedo para falar em ciclo.', portfolio],
  ['cidade com número no nome', 'Comece por Três Corações e siga para Sete Lagoas com C1.', portfolio],
  ['número por extenso que está nos fatos', 'São três clientes para hoje, começando por C1.', portfolio],
  ['venda para quem não está bloqueado', 'Ofereça a reposição do Açúcar refinado 1kg a C1.', portfolio],
  // Eval de 14/10: as reprovações do bloqueado eram o modelo dizendo NÃO vender
  [
    'bloqueado: "não ofereça nada" (eval 14/10)',
    'Não ofereça nada nesta visita — o foco é negociar a quitação do título vencido.',
    blockedBriefing,
  ],
  [
    'bloqueado: "sem oferecer produto" (eval 14/10)',
    'Trate a pendência financeira com C1 antes de qualquer conversa comercial, sem oferecer produto.',
    blockedBriefing,
  ],
  [
    'bloqueado: "não dá pra avançar em vendas" (eval 14/10)',
    'Enquanto o título estiver em aberto, não dá pra avançar em vendas com esse cliente.',
    blockedBriefing,
  ],
  [
    'bloqueado: "trava qualquer novo pedido" (eval 14/10)',
    'É um cliente de ticket alto, mas o bloqueio trava qualquer novo pedido até a pendência ser resolvida.',
    blockedBriefing,
  ],
  [
    'bloqueado: "trava qualquer venda nova" (eval 14/10)',
    'Enquanto o título estiver em aberto o cliente fica bloqueado e isso trava qualquer venda nova.',
    blockedBriefing,
  ],
  ['janela do orders12m: "nesses 12 meses" (eval 15/10)', 'C3 fez só 2 pedidos nesses 12 meses.', portfolio],
  [
    'descrição reescrita sem acento, caixa e espaço (eval 15/10)',
    'O PVC Esticável Dom. 280x300 saiu do mix de C1.',
    {
      ...portfolio,
      products: [{ productCode: 'PA0003', productDesc: 'PVC ESTICAVEL DOM. 280 X 300' }],
    },
  ],
  // Eval de 14/10: 9 das 21 reprovações eram a janela do orders12m
  ['janela do orders12m', 'C1 fez 10 pedidos nos últimos 12 meses.', portfolio],
  ['janela do orders12m, sem "últimos"', 'C3 tem 2 pedidos em 12 meses — histórico curto.', portfolio],
]

describe('corpus do self-check — tem de reprovar', () => {
  it.each(MUST_FAIL)('%s', (_label, text, facts, expected) => {
    const result = selfCheck(text, facts)
    expect(result.ok, `deveria reprovar: "${text}"`).toBe(false)
    expect(result.violations.some((v) => v.includes(expected)), result.violations.join(' | ')).toBe(
      true
    )
  })
})

describe('corpus do self-check — tem de passar', () => {
  it.each(MUST_PASS)('%s', (_label, text, facts) => {
    const result = selfCheck(text, facts)
    expect(result.violations, `deveria passar: "${text}"`).toEqual([])
  })
})

describe('mensagem para o cliente (customerFacingViolations)', () => {
  it.each([
    ['rótulo de status', 'Oi! Vi aqui que você está LATE no ciclo. Vamos conversar?'],
    ['segmento RFM', 'Oi! Você saiu do grupo CHAMPION. Posso passar aí?'],
    ['termo interno', 'Oi! Seu ticket médio caiu bastante. Posso ajudar?'],
    ['título vencido', 'Oi! Tem um título vencido aqui. Consegue ver?'],
    ['sem pergunta no fim', 'Oi! Faz 41 dias desde o último pedido. Passo aí amanhã.'],
    ['longa demais', `Oi! ${'Tudo certo por aí. '.repeat(25)}Posso passar?`],
    ['cliente em terceira pessoa (eval 15/10)', 'E aí! Reparei que o C1 cortou o PVC do último pedido. Rolou algo?'],
    ['ticket sem "médio" (eval 15/10)', 'Oi, C1! Vi que o ticket caiu bastante. Rolou algum problema?'],
  ])('reprova: %s', (_label, text) => {
    expect(customerFacingViolations(text)).toHaveLength(1)
  })

  it.each([
    'Oi, Padaria! Faz 41 dias desde o último pedido de café. Quer que eu separe o de sempre?',
    'Olá! Notei que o açúcar saiu dos últimos pedidos. Ficou alguma dúvida de preço? 🙂',
    'Oi, C1! Notei que o PVC saiu do seu último pedido. Rolou algum problema? Me fala.',
  ])('aprova: %s', (text) => {
    expect(customerFacingViolations(text)).toEqual([])
  })
})
