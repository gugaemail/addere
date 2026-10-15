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
  // O que não passou de primeira, com a resposta reprovada — decide se o ajuste
  // é na regra do self-check ou no prompt
  for (const item of summary.notFirst) {
    console.log(`\n[eval] ${item.kind} ${item.status} → ${item.result}`)
    item.rejected.forEach((r, i) => {
      console.log(`  tentativa ${i + 1}: ${r.violations.join(' | ')}`)
      console.log(`    ${r.text.replace(/\n/g, ' / ')}`)
    })
  }

  // Placar por último: com os casos impressos antes, ele é o que fica na tela
  const ran = summary.total - summary.skipped
  const firstPct = ran > 0 ? Math.round((summary.passedFirst / ran) * 100) : 0
  console.log(`\n[eval] promptVersion=${summary.promptVersion}`)
  console.log(
    `[eval] total=${summary.total} pass=${summary.passed} (de primeira=${summary.passedFirst} = ${firstPct}%, ` +
      `na regeneração=${summary.passedRetry}) fail=${summary.failed} ` +
      `(bloqueado=${summary.blockedFailed}) skip=${summary.skipped}`
  )
  // Critério do plano 012: zero falha em BLOCKED e ≥ 90 % de primeira.
  // Tudo SKIPPED também reprova — não testou nada.
  console.log(`[eval] ${summary.approved ? 'APROVADO' : 'REPROVADO'}`)
  if (!summary.approved) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error('[eval] FALHOU:', (err as Error).message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
