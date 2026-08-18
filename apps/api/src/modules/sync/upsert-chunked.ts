import { prisma } from '@addere/db'
import type { Prisma } from '@prisma/client'

const CHUNK_SIZE = 500

/**
 * Executa upserts em chunks transacionais; quando um chunk falha (ex: P2002 em
 * clientes multi-loja com o mesmo CNPJ), cai para upsert individual e acumula
 * os erros por registro. Única implementação — antes havia três cópias.
 */
export async function upsertChunked<T>(
  records: T[],
  buildUpsert: (record: T) => Prisma.PrismaPromise<unknown>,
  label: (record: T) => string
): Promise<{ synced: number; errors: string[] }> {
  let synced = 0
  const errors: string[] = []

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE)
    try {
      await prisma.$transaction(chunk.map(buildUpsert))
      synced += chunk.length
    } catch {
      for (const record of chunk) {
        try {
          await buildUpsert(record)
          synced++
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Erro desconhecido'
          errors.push(`${label(record)}: ${msg}`)
        }
      }
    }
  }

  return { synced, errors }
}
