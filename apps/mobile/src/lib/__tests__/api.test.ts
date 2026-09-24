// Axios sem `timeout` usa o padrão 0 — espera para sempre. Sem isto, uma
// conexão que cai no meio deixa a tela girando e nunca vira erro tratável.
// O axios real não carrega no ambiente do jest-expo (o adapter fetch conflita
// com o polyfill de streams), então o mock devolve a config em `defaults`,
// do mesmo jeito que o axios de verdade — é ela que este teste verifica.
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: (config: Record<string, unknown>) => ({
      defaults: config,
      interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    }),
  },
}))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}))
jest.mock('../../config/env', () => ({ env: { apiUrl: 'http://api.test' } }))

import { api, ORDER_SYNC_TIMEOUT_MS } from '../api'

describe('cliente HTTP', () => {
  it('é criado com timeout — nunca espera infinita', () => {
    expect(api.defaults.timeout).toBeGreaterThan(0)
  })

  it('o envio do pedido ao Protheus tem folga maior que o padrão', () => {
    // POST /orders/:id/sync fala com o ERP na mesma request e não é idempotente:
    // cortar antes de o servidor desistir duplicaria o pedido no reenvio.
    expect(ORDER_SYNC_TIMEOUT_MS).toBeGreaterThan(api.defaults.timeout as number)
  })
})
