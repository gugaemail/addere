import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10)

  // ─── SUPERADMIN da plataforma (acesso ao painel web) ───
  const superadmin = await prisma.user.upsert({
    where: { email: 'superadmin@addere.dev' },
    update: {},
    create: {
      name: 'Super Administrador',
      email: 'superadmin@addere.dev',
      password: passwordHash,
      role: 'SUPERADMIN',
      companyId: null,
    },
  })
  console.log('SUPERADMIN criado:', superadmin.email)

  // ─── Empresa de teste ───
  const company = await prisma.company.upsert({
    where: { cnpj: '00.000.000/0001-00' },
    update: {},
    create: {
      name: 'Empresa Demonstração',
      cnpj: '00.000.000/0001-00',
      idProtheus: 'D MG 01',
      active: true,
    },
  })
  console.log('Empresa criada:', company.name)

  // ─── Filial da empresa de teste ───
  const branch = await prisma.branch.upsert({
    where: { id: 'branch-demo-001' },
    update: {},
    create: {
      id: 'branch-demo-001',
      name: 'Filial Belo Horizonte',
      cnpj: '00.000.000/0002-81',
      idProtheus: 'D MG 02',
      companyId: company.id,
      active: true,
    },
  })
  console.log('Filial criada:', branch.name)

  // ─── Admin da empresa ───
  const admin = await prisma.user.upsert({
    where: { email: 'admin@addere.dev' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@addere.dev',
      password: passwordHash,
      role: 'ADMIN',
      companyId: company.id,
    },
  })
  console.log('Admin criado:', admin.email)

  // ─── Vendedor da empresa ───
  const vendedor = await prisma.user.upsert({
    where: { email: 'vendedor@addere.dev' },
    update: {},
    create: {
      name: 'Vendedor Teste',
      email: 'vendedor@addere.dev',
      password: passwordHash,
      role: 'SALESPERSON',
      companyId: company.id,
    },
  })
  console.log('Vendedor criado:', vendedor.email)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
