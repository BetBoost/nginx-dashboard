/**
 * Idempotent seed – creates the bootstrap admin user if missing.
 * Run with `npm run seed`.
 */
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL ?? 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD ?? 'ChangeMeNow!';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] admin user already exists: ${email}`);
    return;
  }

  const passwordHash = await argon2.hash(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: 'Administrator',
      role: Role.ADMIN,
    },
  });
  console.log(`[seed] admin user created: ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
