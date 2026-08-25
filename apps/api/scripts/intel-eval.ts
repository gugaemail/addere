// Eval de regressão do agente via CLI (E6): npm run intel:eval -w @addere/api
// Requer DB acessível; sem ANTHROPIC_API_KEY os casos ficam SKIPPED.
// Carrega o .env como o server.ts faz — sem isso o schema de env recusa a
// partida e o comando documentado não roda fora de um shell já exportado.
import 'dotenv/config'
import { prisma } from '@addere/db'
import { runEval } from '../src/modules/intelligence/eval/eval.service'

async function main() {
  const companyArg = process.argv.indexOf('--company')
  const company =
    companyArg > -1
      ? await prisma.company.findUniqueOrThrow({ where: { id: process.argv[companyArg + 1] } })
      : await prisma.company.findFirstOrThrow({ where: { active: true } })

  console.log(`[eval] empresa: ${company.name}`)
  const summary = await runEval(company)
  console.log(`[eval] promptVersion=${summary.promptVersion}`)
  console.log(
    `[eval] total=${summary.total} pass=${summary.passed} fail=${summary.failed} skip=${summary.skipped}`
  )
  if (summary.failed > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error('[eval] FALHOU:', (err as Error).message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
