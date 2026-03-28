import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('admin123', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@controlid.com' },
    update: {},
    create: {
      email: 'admin@controlid.com',
      password: hashedPassword,
      name: 'Administrator',
      role: Role.ADMIN,
    },
  });

  const location = await prisma.location.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Main Office',
      address: 'Rua Example, 123 - São Paulo, SP',
    },
  });

  console.log('Seed completed:', { admin: admin.email, location: location.name });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
