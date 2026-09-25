// Congela casos de eval pseudonimizados a partir dos sinais atuais (E6, D4).
// Carrega o .env como o server.ts faz — sem isso o schema de env recusa a
// partida e o comando documentado não roda fora de um shell já exportado.
import 'dotenv/config'
import { prisma } from '@addere/db'
import { freezeEvalCases } from '../src/modules/intelligence/eval/eval.service'

async function main() {
  const companyArg = process.argv.indexOf('--company')
  const company =
    companyArg > -1
      ? await prisma.company.findUniqueOrThrow({ where: { id: process.argv[companyArg + 1] } })
      : await prisma.company.findFirstOrThrow({ where: { active: true } })
  const created = await freezeEvalCases(company)
  console.log(`[freeze-eval] ${created} caso(s) congelado(s) para ${company.name}`)
}

main()
  .catch((err) => {
    console.error('[freeze-eval] FALHOU:', (err as Error).message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
