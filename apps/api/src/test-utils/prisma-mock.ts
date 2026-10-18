// Mock do @addere/db para testes (primeiro vi.mock do prisma no repo — E3).
//
// Uso no teste (o factory precisa ser async por causa do hoisting do vi.mock):
//   vi.mock('@addere/db', async () =>
//     (await import('../../test-utils/prisma-mock')).mockDb()
//   )
//
// Qualquer prisma.<model>.<método> vira um vi.fn() sob demanda, com default
// seguro pelo nome do método (findMany → [], findFirst/findUnique → null…).
// Configure retornos com prismaMock.<model>.<método>.mockResolvedValue(...)
// e limpe entre testes com resetPrismaMock().

import { vi } from 'vitest'

type MockFn = ReturnType<typeof vi.fn>

const fns = new Map<string, MockFn>()
const models = new Map<string, object>()

function defaultImpl(method: string): (...args: unknown[]) => Promise<unknown> {
  if (method === 'findMany' || method === 'groupBy') return async () => []
  if (method === 'findFirst' || method === 'findUnique') return async () => null
  if (method === 'count') return async () => 0
  if (method === 'createMany' || method === 'updateMany' || method === 'deleteMany')
    return async () => ({ count: 0 })
  return async () => ({})
}

function getFn(model: string, method: string): MockFn {
  const key = `${model}.${method}`
  let fn = fns.get(key)
  if (!fn) {
    fn = vi.fn(defaultImpl(method))
    fns.set(key, fn)
  }
  return fn
}

function modelProxy(model: string): object {
  return new Proxy(
    {},
    {
      get: (_target, method) => (typeof method === 'string' ? getFn(model, method) : undefined),
    }
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prismaMock: any = new Proxy(
  {},
  {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined
      if (prop === '$transaction') return transactionFn
      if (prop === '$queryRaw') return queryRawFn
      if (prop === '$disconnect' || prop === '$connect') return async () => undefined
      let model = models.get(prop)
      if (!model) {
        model = modelProxy(prop)
        models.set(prop, model)
      }
      return model
    },
  }
)

const transactionFn = vi.fn(async (arg: unknown) =>
  Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prismaMock)
)
const queryRawFn = vi.fn(async () => [])

const WRITE_METHODS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
])

/**
 * As chamadas a prisma.<model>.<método> na ordem em que aconteceram, como
 * 'model.método' com os argumentos. Com `writesOnly`, só as escritas: serve
 * para provar que a trava é a primeira escrita da transação.
 */
export function prismaCallLog(opts: { writesOnly?: boolean } = {}): Array<{
  call: string
  args: unknown[]
}> {
  const log: Array<{ call: string; args: unknown[]; order: number }> = []
  for (const [key, fn] of fns) {
    if (opts.writesOnly && !WRITE_METHODS.has(key.split('.')[1])) continue
    fn.mock.calls.forEach((args, i) => {
      log.push({ call: key, args, order: fn.mock.invocationCallOrder[i] })
    })
  }
  return log.sort((a, b) => a.order - b.order).map(({ call, args }) => ({ call, args }))
}

export function resetPrismaMock(): void {
  for (const [key, fn] of fns) {
    fn.mockReset()
    fn.mockImplementation(defaultImpl(key.split('.')[1]))
  }
  transactionFn.mockClear()
  queryRawFn.mockClear()
}

// Módulo @addere/db completo (a API também importa DEFAULT_PERMISSIONS_BY_ROLE)
export function mockDb() {
  return {
    prisma: prismaMock,
    DEFAULT_PERMISSIONS_BY_ROLE: {
      SUPERADMIN: [],
      ADMIN: ['intel.admin'],
      SALESPERSON: [],
    },
    PERMISSIONS: [],
  }
}
