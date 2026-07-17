// Mock do Sentry para evitar que AsyncExpiringMap.startCleanup() crie setIntervals
// que impedem o worker do Jest de encerrar corretamente
jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  init: jest.fn(),
  withScope: jest.fn((cb: (scope: unknown) => void) => cb({})),
  getCurrentHub: jest.fn(() => ({ getClient: jest.fn() })),
}))
