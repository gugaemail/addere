import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('ad@123ab', 10)

  // ─── SUPERADMIN da plataforma (acesso ao painel web) ───
  const superadmin = await prisma.user.upsert({
    where: { email: 'superadmin@addere.dev' },
    update: { password: passwordHash },
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

  const cliente3 = await prisma.customer.upsert({
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
      price: 125.00,
      unit: 'KG',
      stock: 850.5,
      companyId: company.id,
      active: true,
    },
  })

  const produto4 = await prisma.product.upsert({
    where: { id: 'product-demo-004' },
    update: {},
    create: {
      id: 'product-demo-004',
      name: 'Tubo PVC 100mm',
      protheusCode: 'PRD004',
      price: 38.90,
      unit: 'MT',
      stock: 320,
      companyId: company.id,
      active: false,
    },
  })
  console.log('Produtos criados: 4')

  // ─── Pedidos da empresa ───
  const pedido1 = await prisma.order.upsert({
    where: { id: 'order-demo-001' },
    update: {},
    create: {
      id: 'order-demo-001',
      status: 'SYNCED',
      total: 213.00,
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
            total: 85.00,
          },
          {
            productId: produto3.id,
            quantity: 1,
            unitPrice: 125.00,
            discount: 0,
            total: 125.00,
          },
          {
            productId: produto2.id,
            quantity: 50,
            unitPrice: 0.45,
            discount: 0.25,
            total: 3.00,
          },
        ],
      },
    },
  })

  const pedido2 = await prisma.order.upsert({
    where: { id: 'order-demo-002' },
    update: {},
    create: {
      id: 'order-demo-002',
      status: 'PENDING',
      total: 778.00,
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
            unitPrice: 125.00,
            discount: 0,
            total: 750.00,
          },
          {
            productId: produto2.id,
            quantity: 80,
            unitPrice: 0.45,
            discount: 0.10,
            total: 28.00,
          },
        ],
      },
    },
  })
  console.log('Pedidos criados: 2')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
