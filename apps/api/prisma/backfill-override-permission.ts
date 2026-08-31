/**
 * Grants `sales.override_price` to roles that already had the authority to
 * discount before the permission was split out of `sales.bill`.
 *
 * Every company created before this change has Admin and Manager roles whose
 * permission arrays predate the new string. The API treats `admin.manage` as
 * implying the grant so Admins keep working untouched, but Managers hold
 * neither and would silently lose the ability to discount. This closes that
 * gap without touching Cashier, which is the role the split exists to restrain.
 *
 * Idempotent: re-running adds nothing. Run once after deploying the change.
 *
 *   pnpm --filter @shop/api exec node --experimental-strip-types \
 *     prisma/backfill-override-permission.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PERMISSION = 'sales.override_price';
/** Roles that could already discount. Cashier is deliberately absent. */
const ELIGIBLE = ['sales.refund', 'admin.manage', 'closing.approve'];

async function main() {
  const roles = await prisma.role.findMany({
    include: { company: { select: { name: true } } },
  });

  let granted = 0;
  for (const role of roles) {
    if (role.permissions.includes(PERMISSION)) continue;
    // The test is what the role can already do, not what it is called — a
    // company may well have renamed "Manager" to something local.
    if (!ELIGIBLE.some((p) => role.permissions.includes(p))) continue;

    await prisma.role.update({
      where: { id: role.id },
      data: { permissions: { set: [...role.permissions, PERMISSION] } },
    });
    granted += 1;
    console.log(`granted to ${role.company?.name ?? 'unknown'} / ${role.name}`);
  }

  const skipped = roles.length - granted;
  console.log(`\n${granted} role(s) granted ${PERMISSION}; ${skipped} left unchanged.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
