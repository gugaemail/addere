// Cria (ou atualiza) o tenant de demonstração: empresa que roda inteiramente
// sobre dados sintéticos, sem tocar no Protheus nem no geocoder externo.
//
// Serve duas coisas que não podem expor cliente real:
//   1. os screenshots da App Store e da Play Store;
//   2. a conta que o revisor da Apple usa para entrar no app.
//
// Uso (a senha nunca fica no código nem no histórico do shell):
//   DEMO_USER_PASSWORD=... npm run seed:demo -w @addere/api
//
// É idempotente: rodar de novo atualiza o que mudou e não duplica nada. Roda
// contra o banco que o DATABASE_URL apontar — em produção, como One-Off Job no
// Render, já que o banco não é acessível de fora.
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '@addere/db'
import { DEFAULT_INTELLIGENCE_CONFIG } from '@addere/types'
import { generateMockDataset } from '../src/modules/intelligence/protheus-sql/mock-dataset'
import { QUERY_CONTRACTS } from '../src/modules/intelligence/protheus-sql/contracts'
import { registerIntelJobHandlers } from '../src/modules/intelligence/jobs/register'
import { nightlyHandler } from '../src/modules/intelligence/jobs/nightly'

const COMPANY_NAME = 'Addere Demonstração'
// CNPJ inválido de propósito (dígitos verificadores não fecham) e diferente do
// 00.000.000/0001-00 que o `prisma db seed` dá à "Empresa Demonstração" — essa
// está ligada no Protheus real, e reaproveitar o CNPJ dela trocaria a carteira
// de um cliente de verdade por dados sintéticos.
const COMPANY_CNPJ = '99.999.999/0001-99'
const BRANCH_PROTHEUS = '0101'
// Os dois códigos que o mock-dataset distribui entre os 40 clientes; sem um
// usuário com cada um, metade da carteira fica sem dono e não entra em plano.
const VENDOR_CODES = ['000001', '000002']

function log(msg: string): void {
  console.log(`[demo] ${msg}`)
}

async function main(): Promise<void> {
  const password = process.env.DEMO_USER_PASSWORD
  if (!password || password.length < 8) {
    throw new Error('DEMO_USER_PASSWORD ausente ou com menos de 8 caracteres')
  }
  const passwordHash = await bcrypt.hash(password, 10)

  // ─── Empresa ───
  // A chave é o CNPJ, não o nome: renomear a empresa no painel não pode fazer
  // o script criar uma segunda. Mas se o CNPJ já for de outra empresa, aborta —
  // ligar demoData numa empresa real apagaria a carteira dela da tela do
  // vendedor, e um seed não tem o direito de fazer isso sem ninguém pedir.
  const existing = await prisma.company.findUnique({ where: { cnpj: COMPANY_CNPJ } })
  if (existing && existing.name !== COMPANY_NAME) {
    throw new Error(
      `CNPJ ${COMPANY_CNPJ} já pertence a "${existing.name}" — abortado para não converter empresa real em sintética`
    )
  }
  const intelligenceConfig = { ...DEFAULT_INTELLIGENCE_CONFIG, demoData: true }
  const company = await prisma.company.upsert({
    where: { cnpj: COMPANY_CNPJ },
    update: { name: COMPANY_NAME, active: true, intelligenceEnabled: true, intelligenceConfig },
    create: {
      name: COMPANY_NAME,
      cnpj: COMPANY_CNPJ,
      active: true,
      intelligenceEnabled: true,
      intelligenceConfig,
    },
  })
  log(`empresa ${company.name} (${company.id}) — demoData ligado`)

  // ─── Filial ───
  const branch = await prisma.branch.findFirst({
    where: { companyId: company.id, idProtheus: BRANCH_PROTHEUS },
  })
  if (!branch) {
    await prisma.branch.create({
      data: {
        companyId: company.id,
        name: 'Matriz Campinas',
        idProtheus: BRANCH_PROTHEUS,
        cidade: 'Campinas',
        estado: 'SP',
        active: true,
      },
    })
    log(`filial ${BRANCH_PROTHEUS} criada`)
  }

  // ─── Usuários ───
  // O revisor da Apple entra como vendedor: é o perfil que mostra Hoje, Rota e
  // mapa. Um gerente não veria nada disso e o app pareceria vazio.
  const users = [
    {
      email: 'revisor@demo.addere.com.br',
      name: 'Renato Alves',
      role: 'SALESPERSON' as const,
      idVendProt: VENDOR_CODES[0],
    },
    {
      email: 'vendedor2@demo.addere.com.br',
      name: 'Paula Souza',
      role: 'SALESPERSON' as const,
      idVendProt: VENDOR_CODES[1],
    },
  ]
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        password: passwordHash,
        role: u.role,
        idVendProt: u.idVendProt,
        companyId: company.id,
        active: true,
        visitsPerDay: 8,
        vehicle: 'CAR',
        servedCities: ['Campinas', 'Valinhos', 'Vinhedo'],
      },
      create: {
        email: u.email,
        name: u.name,
        password: passwordHash,
        role: u.role,
        idVendProt: u.idVendProt,
        companyId: company.id,
        visitsPerDay: 8,
        vehicle: 'CAR',
        servedCities: ['Campinas', 'Valinhos', 'Vinhedo'],
      },
    })
  }
  log(`${users.length} vendedor(es) — login: ${users[0].email}`)

  // ─── Clientes e produtos ───
  // O contrato CUSTOMERS só faz UPDATE de segmento/limite; quem cria a linha é
  // o sync REST do Protheus, que a demonstração não tem. Sem este bloco as
  // vendas sintéticas ficariam órfãs e o plano do dia sairia vazio.
  const dataset = generateMockDataset(company.id, new Date())

  for (const c of dataset.CUSTOMERS) {
    const code = String(c.cliente_cod)
    const loja = String(c.cliente_loja)
    await prisma.customer.upsert({
      where: { companyId_loja_protheusCode: { companyId: company.id, loja, protheusCode: code } },
      update: {
        name: String(c.cliente_nome),
        address: String(c.endereco),
        municipio: String(c.cidade),
        bairro: String(c.bairro),
        uf: String(c.uf),
        cep: String(c.cep),
        vendorCode: String(c.vendedor_cod),
        msblql: String(c.bloqueado),
        active: true,
      },
      create: {
        companyId: company.id,
        protheusCode: code,
        loja,
        name: String(c.cliente_nome),
        document: String(c.cnpj),
        address: String(c.endereco),
        municipio: String(c.cidade),
        bairro: String(c.bairro),
        uf: String(c.uf),
        cep: String(c.cep),
        vendorCode: String(c.vendedor_cod),
        msblql: String(c.bloqueado),
      },
    })
  }
  log(`${dataset.CUSTOMERS.length} clientes fictícios`)

  for (const p of dataset.PRODUCTS) {
    const code = String(p.produto_cod)
    await prisma.product.upsert({
      where: { companyId_protheusCode: { companyId: company.id, protheusCode: code } },
      update: {
        name: String(p.produto_desc),
        price: Number(p.preco_tabela),
        productGroup: String(p.grupo),
        active: true,
      },
      create: {
        companyId: company.id,
        protheusCode: code,
        name: String(p.produto_desc),
        price: Number(p.preco_tabela),
        productGroup: String(p.grupo),
        saldo: 100,
      },
    })
  }
  log(`${dataset.PRODUCTS.length} produtos fictícios`)

  // ─── Consultas publicadas ───
  // O noturno só sincroniza contrato publicado; sem isso o passo de sync não
  // faz nada e não há venda para o motor processar.
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
        validatedBy: 'seed-demo-tenant',
      },
    })
    log(`consulta ${contract.name} publicada`)
  }

  // ─── Noturno ───
  registerIntelJobHandlers()
  const run = await prisma.intelJobRun.create({
    data: { companyId: company.id, job: 'NIGHTLY', status: 'RUNNING' },
    select: { id: true },
  })
  log('rodando o noturno…')
  try {
    await nightlyHandler(company.id, run.id)
    await prisma.intelJobRun.update({
      where: { id: run.id },
      data: { status: 'OK', finishedAt: new Date() },
    })
    log('noturno OK')
  } catch (err) {
    await prisma.intelJobRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', error: (err as Error).message, finishedAt: new Date() },
    })
    throw err
  } finally {
    const [sales, titles, geo] = await Promise.all([
      prisma.salesItem.count({ where: { companyId: company.id } }),
      prisma.openTitle.count({ where: { companyId: company.id } }),
      prisma.geoAddress.count({ where: { companyId: company.id, lat: { not: null } } }),
    ])
    log(`vendas=${sales} titulos=${titles} enderecos_com_pino=${geo}`)
  }
}

main()
  .catch((err) => {
    console.error('[demo] FALHOU:', (err as Error).message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
