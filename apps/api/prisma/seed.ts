import { hashPassword } from '../src/auth.ts';
import { prisma } from '../src/db.ts';

/**
 * Bootstraps the one principal that cannot be created through the API: the
 * super admin. Everything else — companies, admins, users — is created by
 * signing in as this account and using the app.
 */
const EMAIL = process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@shopsuite.in';
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMe!2026';

const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
if (existing) {
  console.log(`super admin already present: ${EMAIL}`);
} else {
  await prisma.user.create({
    data: {
      name: 'Platform Super Admin',
      email: EMAIL,
      passwordHash: await hashPassword(PASSWORD),
      isSuperAdmin: true,
      companyId: null,
      roleId: null,
    },
  });
  console.log(`super admin created: ${EMAIL} / ${PASSWORD}`);
  console.log('Change this password after the first sign-in.');
}

await prisma.$disconnect();
