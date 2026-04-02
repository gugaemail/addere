import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@addere.dev' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@addere.dev',
      password: passwordHash,
      role: 'ADMIN',
    },
  })

  console.log('Usuário admin criado:', admin.email)

  const vendedor = await prisma.user.upsert({
    where: { email: 'vendedor@addere.dev' },
    update: {},
    create: {
      name: 'Vendedor Teste',
      email: 'vendedor@addere.dev',
      password: passwordHash,
      role: 'SALESPERSON',
    },
  })

  console.log('Usuário vendedor criado:', vendedor.email)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
