import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
// Import relativo (não @addere/db) para o tsx do `prisma db seed` resolver sem paths
import { PERMISSIONS, DEFAULT_PERMISSIONS_BY_ROLE } from '../src/permission-catalog'

const prisma = new PrismaClient()

const USER_TYPE_BY_ROLE: Record<string, string> = {
  ADMIN: 'Administrador',
  SALESPERSON: 'Vendedor',
}

async function seedPermissions() {
  // ─── Catálogo de permissões ───
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { label: permission.label, category: permission.category },
      create: permission,
    })
  }
  console.log('Catálogo de permissões criado:', PERMISSIONS.length)

  // ─── Tipos de usuário ───
  const userTypes: Record<string, { id: string }> = {}
  for (const name of Object.values(USER_TYPE_BY_ROLE)) {
    userTypes[name] = await prisma.userType.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }
  console.log('Tipos de usuário criados:', Object.keys(userTypes).join(', '))

  // ─── Backfill: associa tipo + permissões padrão aos usuários existentes ───
  const users = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SALESPERSON'] } } })
  for (const user of users) {
    const typeName = USER_TYPE_BY_ROLE[user.role]
    const permissionKeys = DEFAULT_PERMISSIONS_BY_ROLE[user.role] ?? []

    await prisma.user.update({
      where: { id: user.id },
      data: { userTypeId: userTypes[typeName].id },
    })

    for (const key of permissionKeys) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key } })
      await prisma.userPermission.upsert({
        where: { userId_permissionId: { userId: user.id, permissionId: permission.id } },
        update: {},
        create: { userId: user.id, permissionId: permission.id },
      })
    }
  }
  console.log('Backfill de tipo/permissões aplicado a', users.length, 'usuário(s)')
}

async function main() {
  // Senha do seed vem do ambiente — nunca hardcoded; em produção é obrigatória
  const seedPassword = process.env.SEED_ADMIN_PASSWORD
  if (!seedPassword) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SEED_ADMIN_PASSWORD é obrigatória para rodar o seed em produção')
    }
    console.warn('SEED_ADMIN_PASSWORD não definida — usando senha de desenvolvimento')
  }
  const passwordHash = await bcrypt.hash(seedPassword ?? 'dev-only-password', 10)

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

  // ─── Usuários dos testes e2e (Detox) — apenas fora de produção ───
  // Credenciais fixas esperadas por apps/mobile/e2e/helpers/auth.ts
  if (process.env.NODE_ENV !== 'production') {
    const e2ePasswordHash = await bcrypt.hash('test1234', 10)
    // O vendedor e2e tem código Protheus porque os fluxos da Inteligência
    // (plano do dia, visita) são chaveados por `User.idVendProt` — o mesmo
    // código do gerador sintético usado pelo `intel:smoke` da API.
    const E2E_VENDOR_CODE = '000001'
    const e2eUsers = [
      {
        email: 'rep@addere.test',
        name: 'Vendedor E2E',
        role: 'SALESPERSON' as const,
        idVendProt: E2E_VENDOR_CODE,
      },
      { email: 'manager@addere.test', name: 'Gerente E2E', role: 'ADMIN' as const },
    ]
    for (const u of e2eUsers) {
      await prisma.user.upsert({
        where: { email: u.email },
        update: { password: e2ePasswordHash, active: true, idVendProt: u.idVendProt ?? null },
        create: {
          name: u.name,
          email: u.email,
          password: e2ePasswordHash,
          role: u.role,
          companyId: company.id,
          idVendProt: u.idVendProt ?? null,
        },
      })
    }
    console.log('Usuários e2e criados:', e2eUsers.map((u) => u.email).join(', '))

    // Cliente buscado pelos fluxos e2e ("Cliente Teste") — precisa ser da
    // carteira do vendedor e2e, senão a listagem por vendedor não o devolve
    await prisma.customer.upsert({
      where: { id: 'customer-e2e-001' },
      update: { name: 'Cliente Teste', active: true, vendorCode: E2E_VENDOR_CODE },
      create: {
        id: 'customer-e2e-001',
        name: 'Cliente Teste',
        document: '111.222.333-44',
        email: 'cliente@addere.test',
        phone: '(31) 99999-0099',
        protheusCode: 'CLIE2E',
        vendorCode: E2E_VENDOR_CODE,
        companyId: company.id,
        active: true,
      },
    })
    console.log('Cliente e2e criado: Cliente Teste')
  }

  // ─── Clientes da empresa ───
  const cliente1 = await prisma.customer.upsert({
    where: { id: 'customer-demo-001' },
    update: {},
    create: {
      id: 'customer-demo-001',
      name: 'João da Silva',
      document: '123.456.789-00',
      email: 'joao@exemplo.com',
      phone: '(31) 99999-0001',
      protheusCode: 'CLI001',
      companyId: company.id,
      active: true,
    },
  })

  const cliente2 = await prisma.customer.upsert({
    where: { id: 'customer-demo-002' },
    update: {},
    create: {
      id: 'customer-demo-002',
      name: 'Maria Oliveira',
      document: '987.654.321-00',
      email: 'maria@exemplo.com',
      phone: '(31) 99999-0002',
      protheusCode: 'CLI002',
      companyId: company.id,
      active: true,
    },
  })

  const _cliente3 = await prisma.customer.upsert({
    where: { id: 'customer-demo-003' },
    update: {},
    create: {
      id: 'customer-demo-003',
      name: 'Distribuidora Central Ltda',
      document: '12.345.678/0001-99',
      email: 'contato@distribuidora.com',
      phone: '(31) 3333-4444',
      protheusCode: 'CLI003',
      companyId: company.id,
      active: false,
    },
  })
  console.log('Clientes criados: 3')

  // ─── Produtos da empresa ───
  const produto1 = await prisma.product.upsert({
    where: { id: 'product-demo-001' },
    update: {},
    create: {
      id: 'product-demo-001',
      name: 'Parafuso Sextavado M8',
      protheusCode: 'PRD001',
      price: 0.85,
      unit: 'PC',
      stock: 1500,
      companyId: company.id,
      active: true,
    },
  })

  const produto2 = await prisma.product.upsert({
    where: { id: 'product-demo-002' },
    update: {},
    create: {
      id: 'product-demo-002',
      name: 'Porca Sextavada M8',
      protheusCode: 'PRD002',
      price: 0.45,
      unit: 'PC',
      stock: 2200,
      companyId: company.id,
      active: true,
    },
  })

  const produto3 = await prisma.product.upsert({
    where: { id: 'product-demo-003' },
    update: {},
    create: {
      id: 'product-demo-003',
      name: 'Chapa de Aço 3mm',
      protheusCode: 'PRD003',
      price: 125.0,
      unit: 'KG',
      stock: 850.5,
      companyId: company.id,
      active: true,
    },
  })

  const _produto4 = await prisma.product.upsert({
    where: { id: 'product-demo-004' },
    update: {},
    create: {
      id: 'product-demo-004',
      name: 'Tubo PVC 100mm',
      protheusCode: 'PRD004',
      price: 38.9,
      unit: 'MT',
      stock: 320,
      companyId: company.id,
      active: false,
    },
  })
  console.log('Produtos criados: 4')

  // ─── Pedidos da empresa ───
  const _pedido1 = await prisma.order.upsert({
    where: { id: 'order-demo-001' },
    update: {},
    create: {
      id: 'order-demo-001',
      status: 'SYNCED',
      total: 213.0,
      notes: 'Entrega urgente',
      companyId: company.id,
      customerId: cliente1.id,
      userId: vendedor.id,
      branchId: branch.id,
      items: {
        create: [
          {
            productId: produto1.id,
            quantity: 100,
            unitPrice: 0.85,
            discount: 0,
            total: 85.0,
          },
          {
            productId: produto3.id,
            quantity: 1,
            unitPrice: 125.0,
            discount: 0,
            total: 125.0,
          },
          {
            productId: produto2.id,
            quantity: 50,
            unitPrice: 0.45,
            discount: 0.25,
            total: 3.0,
          },
        ],
      },
    },
  })

  const _pedido2 = await prisma.order.upsert({
    where: { id: 'order-demo-002' },
    update: {},
    create: {
      id: 'order-demo-002',
      status: 'PENDING',
      total: 778.0,
      notes: null,
      companyId: company.id,
      customerId: cliente2.id,
      userId: vendedor.id,
      branchId: branch.id,
      items: {
        create: [
          {
            productId: produto3.id,
            quantity: 6,
            unitPrice: 125.0,
            discount: 0,
            total: 750.0,
          },
          {
            productId: produto2.id,
            quantity: 80,
            unitPrice: 0.45,
            discount: 0.1,
            total: 28.0,
          },
        ],
      },
    },
  })
  console.log('Pedidos criados: 2')

  await seedPermissions()
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
