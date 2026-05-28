import { prisma } from '@addere/db'
import type { Prisma } from '@prisma/client'

interface LogProtheusCallInput {
  companyId:     string
  operation:     string
  endpointKey:   string
  success:       boolean
  httpStatus?:   number
  durationMs?:   number
  recordsSynced?: number
  totalRecords?:  number
  errorMessage?:  string
  metadata?:      Record<string, unknown>
}

export async function logProtheusCall(input: LogProtheusCallInput): Promise<void> {
  try {
    const errorMessage = input.errorMessage
      ? input.errorMessage.slice(0, 500)
      : undefined

    await prisma.protheusLog.create({
      data: {
        companyId:     input.companyId,
        operation:     input.operation,
        endpointKey:   input.endpointKey,
        success:       input.success,
        httpStatus:    input.httpStatus    ?? undefined,
        durationMs:    input.durationMs    ?? undefined,
        recordsSynced: input.recordsSynced ?? undefined,
        totalRecords:  input.totalRecords  ?? undefined,
        errorMessage:  errorMessage        ?? undefined,
        metadata:      (input.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    })
  } catch (err) {
    console.error('[protheus-logger] Falha ao gravar log:', (err as Error).message)
  }
}
