// Log de erro do Prisma (A7 do e2e de 18/10/2026): o P2002 que o código trata
// onde espera não sai como `prisma:error`; todo o resto continua saindo. Sem
// mock do @addere/db: é a função que o cliente de verdade registra no $on.
// Nenhuma consulta roda aqui, então nenhuma conexão é aberta.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { logPrismaError } from '@addere/db'

const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

afterEach(() => {
  errorSpy.mockClear()
})

describe('logPrismaError', () => {
  it('descarta a violação de unicidade (a reserva de e-mail com dedupeKey, por exemplo)', () => {
    logPrismaError({
      message:
        '\nInvalid `prisma.billingEvent.create()` invocation in\nC:\\api\\src\\modules\\billing\\billing-mailer.ts:162:31\n\n→ 162 await prisma.billingEvent.create(\nUnique constraint failed on the fields: (`dedupeKey`)',
    })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it.each([
    [
      'deadlock',
      'Error occurred during query execution: … code: "40P01", message: "deadlock detected"',
    ],
    [
      'estouro de Decimal',
      'Error occurred during query execution: … code: "22003", numeric field overflow',
    ],
    ['chave estrangeira', 'Foreign key constraint failed on the field: `companyId`'],
    ['banco fora', "Can't reach database server at `localhost:5432`"],
  ])('continua logando o resto: %s', (_label, message) => {
    logPrismaError({ message })
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0][0]).toBe(`prisma:error ${message}`)
  })
})
