// Prontidão do tenant para o piloto (E14a) — só lê, nunca grava.
//
// Uso:
//   npm run intel:onboarding -w @addere/api -- [--company <id>]
//
// Percorre a lista de onboarding do plano e diz o que falta, com o número que
// sustenta cada resposta. O que depende de gente — a confirmação do consultor
// de que o usuário do Protheus é read-only — aparece como pendência manual:
// nenhum script consegue afirmar isso, e fingir que consegue seria pior.
// Carrega o .env como o server.ts faz — sem isso o schema de env recusa a
// partida e o comando documentado não roda fora de um shell já exportado.
import 'dotenv/config'
import { prisma } from '@addere/db'
import { QUERY_CONTRACTS } from '../src/modules/intelligence/protheus-sql/contracts'
import { buildHealthReport } from '../src/modules/intelligence/admin/health.service'

type Level = 'ok' | 'fail' | 'manual'

interface Check {
  level: Level
  label: string
  detail: string
}

const MIN_HEALTH_PCT = 90
const MIN_EVAL_CASES = 20

function line({ level, label, detail }: Check): string {
  const mark = level === 'ok' ? '✓' : level === 'fail' ? '✗' : '•'
  return `${mark} ${label}\n    ${detail}`
}

async function main() {
  const companyArg = process.argv.indexOf('--company')
  const company =
    companyArg > -1
      ? await prisma.company.findUniqueOrThrow({ where: { id: process.argv[companyArg + 1] } })
      : await prisma.company.findFirstOrThrow({ where: { active: true } })

  console.log(`\n[onboarding] ${company.name} (${company.id})\n`)
  const checks: Check[] = []

  // 1. Endpoint SQL genérico — sem ele nada da Inteligência sincroniza
  checks.push(
    company.apiSql
      ? {
          level: 'ok',
          label: 'Endpoint SQL genérico cadastrado',
          detail: 'aba Protheus da empresa',
        }
      : {
          level: 'fail',
          label: 'Endpoint SQL genérico cadastrado',
          detail: 'campo apiSql vazio — cadastre na aba Protheus antes de qualquer sync',
        }
  )

  // 2. Camada ligada
  checks.push({
    level: company.intelligenceEnabled ? 'ok' : 'fail',
    label: 'Camada de Inteligência ligada',
    detail: company.intelligenceEnabled
      ? 'aba Inteligência da empresa'
      : 'ligue na aba Inteligência — o scheduler ignora empresas desligadas',
  })

  // 3. Contratos publicados e reconciliados
  const queries = await prisma.intelQuery.findMany({ where: { companyId: company.id } })
  const byName = new Map(queries.map((q) => [q.name, q]))
  // STOCK é ON_DEMAND — estoque ao vivo é fase 2 (E22) e não entra na cadeia
  // do nightly, então não segura o piloto.
  const contracts = Object.values(QUERY_CONTRACTS).filter((c) => c.frequency !== 'ON_DEMAND')
  const missing = contracts.filter((c) => !byName.get(c.name)?.published).map((c) => c.name)
  checks.push({
    level: missing.length === 0 ? 'ok' : 'fail',
    label: `Contratos publicados (${contracts.length - missing.length}/${contracts.length})`,
    detail: missing.length === 0 ? 'todos publicados' : `faltam: ${missing.join(', ')}`,
  })

  // Reconciliar é comparar valor com o relatório do ERP: só faz sentido em
  // contrato que traz a coluna `valor` — reconcileQuery recusa os demais.
  const reconcilable = new Set(
    contracts.filter((c) => c.columns.some((col) => col.name === 'valor')).map((c) => c.name)
  )
  const unreconciled = queries
    .filter((q) => q.published && reconcilable.has(q.name) && q.reconciliationDiffPct === null)
    .map((q) => q.name)
  checks.push({
    level: unreconciled.length === 0 ? 'ok' : 'fail',
    label: `Reconciliação conferida (${[...reconcilable].length - unreconciled.length}/${[...reconcilable].length})`,
    detail:
      unreconciled.length === 0
        ? 'os contratos com valor batem com o relatório do ERP'
        : `sem reconciliação: ${unreconciled.join(', ')} — rode em Consultas`,
  })

  // 4. Gerente com intel.manager (a tela Equipe depende dele para o recorte D3b)
  const managers = await prisma.user.count({
    where: {
      companyId: company.id,
      active: true,
      permissions: { some: { permission: { key: 'intel.manager' } } },
    },
  })
  checks.push({
    level: managers > 0 ? 'ok' : 'fail',
    label: 'Gerente com permissão intel.manager',
    detail:
      managers > 0
        ? `${managers} gerente(s)`
        : 'nenhum — conceda em Usuários, senão a Equipe em campo fica sem dono',
  })

  // 5. Cadastro dos vendedores
  const sellers = await prisma.user.findMany({
    where: { companyId: company.id, active: true, role: 'SALESPERSON' },
    select: {
      name: true,
      idVendProt: true,
      visitsPerDay: true,
      servedCities: true,
      managerId: true,
    },
  })
  const withoutCode = sellers.filter((s) => !s.idVendProt).map((s) => s.name)
  checks.push({
    level: sellers.length > 0 && withoutCode.length === 0 ? 'ok' : 'fail',
    label: `Vendedores com código Protheus (${sellers.length - withoutCode.length}/${sellers.length})`,
    detail:
      sellers.length === 0
        ? 'nenhum vendedor ativo cadastrado'
        : withoutCode.length === 0
          ? 'todos com idVendProt'
          : `sem código: ${withoutCode.join(', ')} — ficam fora do plano e da Equipe`,
  })

  // O código é único por empresa no banco (@@unique), mas duplicata em rascunho
  // de importação apareceria aqui antes de virar erro de constraint
  const codes = sellers.map((s) => s.idVendProt).filter((c): c is string => c !== null)
  const duplicated = codes.filter((c, i) => codes.indexOf(c) !== i)
  if (duplicated.length > 0) {
    checks.push({
      level: 'fail',
      label: 'Códigos de vendedor únicos',
      detail: `repetidos: ${[...new Set(duplicated)].join(', ')} — dois vendedores veriam o mesmo plano`,
    })
  }

  // Capacidade e cidades só mudam a qualidade do plano — não impedem o piloto
  const incomplete = sellers.filter((s) => !s.visitsPerDay || s.servedCities.length === 0)
  if (incomplete.length > 0) {
    checks.push({
      level: 'manual',
      label: 'Capacidade e cidades por vendedor',
      detail: `${incomplete.length} sem visitsPerDay ou cidades — cai no default da premissa; o agrupamento do dia fica pior`,
    })
  }
  const withoutManager = sellers.filter((s) => !s.managerId)
  if (withoutManager.length > 0 && managers > 1) {
    checks.push({
      level: 'fail',
      label: 'Vendedor ligado ao gerente',
      detail: `${withoutManager.length} sem gerente e a empresa tem ${managers} — some da Equipe de todos eles (D3b)`,
    })
  }

  // 6. Primeiro nightly completo
  const nightly = await prisma.intelJobRun.findFirst({
    where: { companyId: company.id, job: 'NIGHTLY', status: 'OK' },
    orderBy: { startedAt: 'desc' },
    select: { finishedAt: true },
  })
  checks.push({
    level: nightly ? 'ok' : 'fail',
    label: 'Primeiro nightly completo',
    detail: nightly?.finishedAt
      ? `último OK em ${nightly.finishedAt.toISOString()}`
      : 'nenhum NIGHTLY com status OK — rode "Sync agora" em Saúde dos dados',
  })

  // 7. Saúde ≥ 90%
  try {
    const health = await buildHealthReport(company)
    checks.push({
      level: health.healthyPct >= MIN_HEALTH_PCT ? 'ok' : 'fail',
      label: `Saúde dos dados ≥ ${MIN_HEALTH_PCT}%`,
      detail: `${health.healthyPct}% — a lista "corrigir no Protheus" está em Saúde dos dados`,
    })
  } catch (err) {
    checks.push({
      level: 'fail',
      label: `Saúde dos dados ≥ ${MIN_HEALTH_PCT}%`,
      detail: `não foi possível calcular: ${(err as Error).message}`,
    })
  }

  // 8. Suíte de eval congelada
  const evalCases = await prisma.evalCase.count({ where: { companyId: company.id } })
  checks.push({
    level: evalCases >= MIN_EVAL_CASES ? 'ok' : 'fail',
    label: `Casos de eval congelados (${evalCases}/${MIN_EVAL_CASES})`,
    detail:
      evalCases >= MIN_EVAL_CASES
        ? 'rode npm run intel:eval antes de mexer em prompt ou modelo'
        : 'rode npm run intel:freeze-eval depois do primeiro nightly',
  })

  // 9. O que nenhum script consegue afirmar
  checks.push({
    level: 'manual',
    label: 'Usuário do Protheus é read-only',
    detail: 'confirmação do consultor — a API SQL aceita qualquer SELECT que o usuário puder rodar',
  })

  for (const check of checks) console.log(line(check))

  const failed = checks.filter((c) => c.level === 'fail').length
  const manual = checks.filter((c) => c.level === 'manual').length
  console.log(
    `\n[onboarding] ${checks.length - failed - manual} ok · ${failed} pendente(s) · ${manual} de confirmação manual\n`
  )
  // Sai diferente de zero quando falta algo automático: serve em CI e em script
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error('[onboarding] FALHOU:', (err as Error).message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
