// Semeia o banco LOCAL do e2e: catálogo de permissões (igual ao seed.ts) e um
// SUPERADMIN com senha conhecida. Recusa rodar se a URL não for a local 5434.
const { createRequire } = require('node:module')
const path = require('node:path')
const req = createRequire(path.join(__dirname, '..', '..', '..', 'packages', 'db', 'package.json'))
const LOCAL = `postgresql://addere_dev_user:addere_dev_password@localhost:5434/${process.env.E2E_DB ?? 'addere_e2e'}`
if (process.env.DATABASE_URL !== LOCAL || process.env.DATABASE_URL_DIRECT !== LOCAL) {
  console.error('URL não é a local 5434 — abortando')
  process.exit(1)
}
const { PrismaClient } = req('@prisma/client')
const bcrypt = req('bcryptjs')
const prisma = new PrismaClient()

const PERMISSIONS = [
  { key: 'users.view', label: 'Ver usuários da empresa', category: 'users' },
  { key: 'users.manage', label: 'Criar/ativar/desativar usuários', category: 'users' },
  { key: 'sync.protheus', label: 'Executar sincronização com Protheus', category: 'sync' },
  { key: 'orders.reset_pending', label: 'Reverter pedido sincronizado para pendente', category: 'orders' },
  { key: 'orders.change_carrier', label: 'Alterar transportadora do pedido', category: 'orders' },
  { key: 'orders.change_payment_terms', label: 'Alterar condição de pagamento do pedido', category: 'orders' },
  { key: 'intel.admin', label: 'Inteligência: configurar consultas, premissas e saúde dos dados', category: 'intelligence' },
  { key: 'intel.manager', label: 'Inteligência: acompanhar equipe em campo e perdas', category: 'intelligence' },
]

async function main() {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({ where: { key: p.key }, update: { label: p.label, category: p.category }, create: p })
  }
  const hash = await bcrypt.hash('E2e-Senha-123', 10)
  const sa = await prisma.user.upsert({
    where: { email: 'superadmin@exemplo.test' },
    update: { password: hash, active: true },
    create: { name: 'Super E2E', email: 'superadmin@exemplo.test', password: hash, role: 'SUPERADMIN', companyId: null },
  })
  console.log('permissions:', await prisma.permission.count(), 'superadmin:', sa.id)
}
main().finally(() => prisma.$disconnect())
