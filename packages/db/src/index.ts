import { PrismaClient, type Prisma } from '@prisma/client'

// Log de erro do Prisma em modo evento, para descartar UMA coisa: a violação de
// unicidade (P2002), que o código trata onde espera (reserva de e-mail com
// dedupeKey, fatura da mesma competência, dois rascunhos ao mesmo tempo, e-mail
// já cadastrado). No modo stdout cada uma saía como `prisma:error` com o trecho
// do código, de hora em hora, e escondia o erro de verdade. Qualquer outro
// erro continua saindo igual. Um P2002 que ninguém trata não some: o handler
// global responde 409 (e o log de acesso registra), e os jobs mandam ao Sentry.
//
// O Prisma 5 não põe o código no evento (só message, target e timestamp): o
// filtro é pela mensagem que ele gera para o P2002, "Unique constraint failed
// on the fields: (…)".
const UNIQUE_VIOLATION = /Unique constraint failed/

/** O que o evento `error` do Prisma vira no log. Exportado para o teste. */
export function logPrismaError(event: Pick<Prisma.LogEvent, 'message'>): void {
  if (UNIQUE_VIOLATION.test(event.message)) return
  console.error(`prisma:error ${event.message}`)
}

function createPrismaClient() {
  const stdout: Prisma.LogDefinition[] =
    process.env.NODE_ENV === 'development'
      ? [
          { emit: 'stdout', level: 'query' },
          { emit: 'stdout', level: 'warn' },
        ]
      : []
  const client = new PrismaClient<Prisma.PrismaClientOptions, 'error'>({
    log: [...stdout, { emit: 'event', level: 'error' }],
  })
  client.$on('error', logPrismaError)
  return client
}

// Evita múltiplas instâncias do Prisma Client em desenvolvimento (hot reload)
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Re-exporta os tipos gerados pelo Prisma para uso nos outros workspaces
export type {
  User,
  Customer,
  Product,
  Order,
  OrderItem,
  RefreshToken,
  Pilot,
  PilotEvent,
  PilotFeedback,
} from '@prisma/client'
export { Role, OrderStatus, PilotEventType, PilotStatus } from '@prisma/client'

// Catálogo de permissões (fonte única para seed, migrations e API)
export type { PermissionDefinition } from './permission-catalog'
export { PERMISSIONS, DEFAULT_PERMISSIONS_BY_ROLE } from './permission-catalog'
