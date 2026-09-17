/**
 * Grants the new `view.*` screen permissions to roles that predate them.
 *
 * Until now a role held only coarse action keys, and the sidebar was filtered
 * on those. Per-screen keys are what let an admin hide Warehouse Stock while
 * leaving Store Stock visible — but every role already in the database holds
 * none of them, so the moment either client starts filtering on `view.*` those
 * users see an empty sidebar and can reach nothing.
 *
 * This closes that window. **Run it before deploying the clients**, not after:
 * it is purely additive, so a database that has been backfilled still works
 * perfectly with the old clients, and the new ones find what they expect.
 *
 * The mapping asks what each role could already reach, never what it is called
 * — a company may well have renamed "Manager" to something local, and a role
 * named "Cashier" may have been given the run of the place.
 *
 * Idempotent: re-running adds nothing.
 *
 *   pnpm --filter @shop/api exec node --experimental-strip-types \
 *     prisma/backfill-screen-permissions.ts
 *
 * Pass --dry-run to print what it would do and write nothing.
 */
import { PrismaClient } from '@prisma/client';
import { normalizeRolePermissions, type Permission } from '@shop/core';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

/**
 * What each old action key implies about the screens a role could already open.
 *
 * Deliberately generous where the old model was coarse: `inventory.view` gated
 * all six inventory screens at once, so a role holding it could reach all six
 * and keeps all six. Taking access away is not this script's job — an admin can
 * now do that deliberately, on a screen built for it.
 */
const IMPLIED_SCREENS: Record<string, Permission[]> = {
  'sales.bill': ['view.home', 'view.sales.billing', 'view.sales.invoices'],
  'sales.override_price': ['view.sales.billing'],
  'sales.refund': ['view.sales.returns', 'view.sales.orders', 'view.sales.invoices'],
  'inventory.view': [
    'view.home',
    'view.inventory.stores',
    'view.inventory.warehouses',
    'view.inventory.all',
    'view.inventory.movements',
  ],
  'inventory.adjust': [
    'view.inventory.stores',
    'view.inventory.warehouses',
    'view.inventory.transfers',
    'view.inventory.replenishment',
    'view.onboarding.products',
    'view.onboarding.masters',
  ],
  'purchase.manage': ['view.purchases'],
  'closing.perform': ['view.home', 'view.closing.dayend'],
  'closing.approve': ['view.closing.dayend', 'view.closing.reconciliation'],
  // An admin could reach everything, and must keep being able to — this is the
  // role that repairs all the others.
  'admin.manage': [
    'view.home',
    'view.onboarding.locations',
    'view.onboarding.products',
    'view.onboarding.users',
    'view.onboarding.masters',
    'view.admin',
  ],
};

/**
 * The new permission list for a role that holds `current`.
 *
 * Exported and pure so the mapping can be tested without a database — the
 * property worth proving is that no role ends up able to reach less than it
 * could before, and that is a statement about this function, not about Prisma.
 */
export function upgradeRolePermissions(current: readonly string[]): Permission[] {
  const granted = new Set<string>(current);
  for (const permission of current) {
    for (const screen of IMPLIED_SCREENS[permission] ?? []) granted.add(screen);
  }
  // Everyone gets somewhere to land. A role that could sign in before must
  // still be able to sign in after, and Home is the cheapest way to promise
  // that — an empty sidebar is indistinguishable from a broken deploy.
  if (current.length > 0) granted.add('view.home');
  return normalizeRolePermissions([...granted]);
}

async function main() {
  const roles = await prisma.role.findMany({
    include: { company: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  let changed = 0;
  for (const role of roles) {
    const next = upgradeRolePermissions(role.permissions);
    const added = next.filter((p) => !role.permissions.includes(p));
    if (added.length === 0) continue;

    const where = `${role.company?.name ?? 'unknown'} / ${role.name}`;
    if (DRY_RUN) {
      console.log(`would grant ${where}: ${added.join(', ')}`);
    } else {
      await prisma.role.update({
        where: { id: role.id },
        data: { permissions: { set: next } },
      });
      console.log(`granted ${where}: ${added.length} key(s)`);
    }
    changed += 1;
  }

  console.log(
    `\n${changed} role(s) ${DRY_RUN ? 'would be' : ''} updated; ${roles.length - changed} already current.`,
  );

  // The check that matters: every company must still have somebody who can
  // administer it. If this prints anything, stop and fix it before deploying —
  // a company with no admin cannot be repaired from any screen.
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      users: { where: { active: true }, select: { role: { select: { permissions: true } } } },
    },
  });

  const orphaned = companies.filter(
    (company) =>
      company.users.length > 0 &&
      !company.users.some((u) => u.role?.permissions.includes('admin.manage')),
  );

  if (orphaned.length) {
    console.error(`\nWARNING: ${orphaned.length} company/companies have no active admin:`);
    for (const company of orphaned) console.error(`  - ${company.name} (${company.id})`);
    process.exitCode = 1;
  } else {
    console.log('Every company with users still has an active admin.');
  }
}

// Guarded so that importing this module for its mapping — as the test does —
// does not connect to a database or mutate anything.
if (process.argv[1]?.includes('backfill-screen-permissions')) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
