// Smoke test do pipeline da Inteligência com o adapter sintético (E4).
//
// Uso (banco local via docker-compose ou Postgres local):
//   INTEL_SQL_ADAPTER=mock INTEL_GEOCODER=mock npm run intel:smoke -w @addere/api -- [--company <id>]
//
// O script prepara o mínimo (empresa com Inteligência ligada, filial com código
// Protheus, consultas publicadas a partir dos SQLs de referência), roda o
// nightlyHandler de verdade e imprime o resultado + contagens das tabelas.
// Carrega o .env como o server.ts faz — sem isso o schema de env recusa a
// partida e o comando documentado não roda fora de um shell já exportado.
import 'dotenv/config'
import { prisma } from '@addere/db'
import { env } from '../src/lib/env'
import { QUERY_CONTRACTS } from '../src/modules/intelligence/protheus-sql/contracts'
import { registerIntelJobHandlers } from '../src/modules/intelligence/jobs/register'
import { nightlyHandler } from '../src/modules/intelligence/jobs/nightly'

async function main() {
  if (env.INTEL_SQL_ADAPTER !== 'mock' || env.INTEL_GEOCODER !== 'mock') {
    throw new Error(
      'Rode com INTEL_SQL_ADAPTER=mock INTEL_GEOCODER=mock — o smoke nunca chama serviços externos'
    )
  }

  const companyArg = process.argv.indexOf('--company')
  const companyId = companyArg > -1 ? process.argv[companyArg + 1] : null

  const company = companyId
    ? await prisma.company.findUniqueOrThrow({ where: { id: companyId } })
    : await prisma.company.findFirstOrThrow({ where: { active: true } })
  console.log(`[smoke] empresa: ${company.name} (${company.id})`)

  if (!company.intelligenceEnabled) {
    await prisma.company.update({
      where: { id: company.id },
      data: { intelligenceEnabled: true },
    })
    console.log('[smoke] intelligenceEnabled ligado para o teste')
  }

  const branch = await prisma.branch.findFirst({
    where: { companyId: company.id, active: true, idProtheus: { not: null } },
  })
  if (!branch) {
    await prisma.branch.create({
      data: { companyId: company.id, name: 'Filial smoke', idProtheus: '0101' },
    })
    console.log('[smoke] filial 0101 criada')
  }

  for (const contract of Object.values(QUERY_CONTRACTS)) {
    if (contract.frequency === 'ON_DEMAND') continue
    const published = await prisma.intelQuery.findFirst({
      where: { companyId: company.id, name: contract.name, published: true },
    })
    if (published) continue
    const latest = await prisma.intelQuery.findFirst({
      where: { companyId: company.id, name: contract.name },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    await prisma.intelQuery.create({
      data: {
        companyId: company.id,
        name: contract.name,
        version: (latest?.version ?? 0) + 1,
        sql: contract.referenceSql[0].sql,
        published: true,
        publishedAt: new Date(),
        validatedAt: new Date(),
        validatedBy: 'intel-smoke',
      },
    })
    console.log(`[smoke] consulta ${contract.name} publicada (SQL de referência)`)
  }

  registerIntelJobHandlers()
  const run = await prisma.intelJobRun.create({
    data: { companyId: company.id, job: 'NIGHTLY', status: 'RUNNING' },
    select: { id: true },
  })

  console.log('[smoke] rodando nightlyHandler…')
  const t0 = Date.now()
  try {
    await nightlyHandler(company.id, run.id)
    await prisma.intelJobRun.update({
      where: { id: run.id },
      data: { status: 'OK', finishedAt: new Date() },
    })
  } catch (err) {
    await prisma.intelJobRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', error: (err as Error).message, finishedAt: new Date() },
    })
    throw err
  } finally {
    const final = await prisma.intelJobRun.findUnique({ where: { id: run.id } })
    console.log(`[smoke] run ${final?.status} em ${Date.now() - t0} ms`)
    console.log('[smoke] passos:', JSON.stringify(final?.metadata, null, 2))
    const [sales, titles, goals] = await Promise.all([
      prisma.salesItem.count({ where: { companyId: company.id } }),
      prisma.openTitle.count({ where: { companyId: company.id } }),
      prisma.goalSnapshot.count({ where: { companyId: company.id } }),
    ])
    console.log(
      `[smoke] intel_sales_items=${sales} intel_open_titles=${titles} intel_goal_snapshots=${goals}`
    )
  }
}

main()
  .catch((err) => {
    console.error('[smoke] FALHOU:', (err as Error).message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
