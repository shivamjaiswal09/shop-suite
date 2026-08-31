# Shared Layouts

The app shell wraps every authenticated route via a react-router layout route
(`<Route element={<AppShell />}>`). It renders a fixed left sidebar (desktop
only), a top bar carrying the branch/warehouse context switcher and the theme
toggle, and an `<Outlet />` for the page.

**Known gap:** the sidebar is `hidden ... lg:flex`, so below 1024px there is no
navigation at all. There is no drawer/hamburger fallback.


## `apps/web/src/components/app-shell.tsx`

```tsx
import { useLogout, useSessionStore } from '@shop/state';
import { LogOut, Moon, Store, Sun } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { BranchSwitcher } from './branch-switcher';
import { Button } from './ui/button';
import { NAV } from './nav';
import { cn } from '@/lib/utils';

export function AppShell() {
  const { pathname } = useLocation();
  const company = useSessionStore((s) => s.company);
  const user = useSessionStore((s) => s.user);
  const theme = useSessionStore((s) => s.theme);
  const toggleTheme = useSessionStore((s) => s.toggleTheme);
  const logout = useLogout();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Store className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Shop Suite</p>
            <p className="truncate text-xs text-muted-foreground">{company?.name}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((item) => {
            const active = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
            return (
              <div key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                    active ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-muted',
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>

                {active && item.children ? (
                  <div className="ml-6 mt-1 space-y-0.5 border-l border-border pl-3">
                    {item.children.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        className={({ isActive }) =>
                          cn(
                            'block rounded-md px-2 py-1.5 text-[13px] transition-colors',
                            isActive
                              ? 'font-medium text-primary'
                              : 'text-muted-foreground hover:text-foreground',
                          )
                        }
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{user?.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{user?.email}</p>
            </div>
            <Button variant="ghost" size="icon" title="Sign out" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-5 py-3">
          <BranchSwitcher />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" className="lg:hidden" onClick={logout}>
              Sign out
            </Button>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

## `apps/web/src/components/branch-switcher.tsx`

```tsx
import { useAccessibleBranches, useSessionStore, useWarehouses } from '@shop/state';
import { Building2, Warehouse as WarehouseIcon } from 'lucide-react';
import { Select } from './ui/input';

/**
 * Branch/warehouse context lives in the session store, so every hook below it
 * (stock levels, billing, closing) re-queries automatically when it changes.
 *
 * Warehouses are fetched company-wide once and filtered here — fetching per
 * branch would return the *previous* branch's list at the moment of switching.
 */
export function BranchSwitcher() {
  const branch = useSessionStore((s) => s.branch);
  const warehouse = useSessionStore((s) => s.warehouse);
  const setBranch = useSessionStore((s) => s.setBranch);
  const setWarehouse = useSessionStore((s) => s.setWarehouse);

  const branches = useAccessibleBranches();
  const warehouses = useWarehouses();

  const branchWarehouses = (warehouses.data ?? []).filter((w) => w.branchId === branch?.id);

  const onBranchChange = (branchId: string) => {
    const next = branches.data.find((b) => b.id === branchId);
    if (!next) return;
    const forBranch = (warehouses.data ?? []).filter((w) => w.branchId === branchId);
    const defaultWarehouse = forBranch.find((w) => w.isDefault) ?? forBranch[0];
    if (defaultWarehouse) setBranch(next, defaultWarehouse);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <Select
          className="h-8 w-52 text-[13px]"
          value={branch?.id ?? ''}
          disabled={branches.data.length <= 1}
          onChange={(e) => onBranchChange(e.target.value)}
        >
          {branches.data.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <WarehouseIcon className="h-4 w-4 text-muted-foreground" />
        <Select
          className="h-8 w-52 text-[13px]"
          value={warehouse?.id ?? ''}
          onChange={(e) => {
            const next = branchWarehouses.find((w) => w.id === e.target.value);
            if (next) setWarehouse(next);
          }}
        >
          {branchWarehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
```

## `apps/web/src/components/page-header.tsx`

```tsx
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
```

## `apps/web/src/components/nav.ts`

```tsx
import {
  Boxes,
  ClipboardCheck,
  LayoutDashboard,
  Settings,
  ShoppingCart,
  Truck,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  children?: { label: string; to: string }[];
}

/** The six top-level modules. Mobile mirrors this taxonomy exactly. */
export const NAV: NavItem[] = [
  { label: 'Home', to: '/', icon: LayoutDashboard },
  {
    label: 'Sales',
    to: '/sales',
    icon: ShoppingCart,
    children: [
      { label: 'Quick Billing', to: '/sales/billing' },
      { label: 'Invoices', to: '/sales/invoices' },
    ],
  },
  {
    label: 'Inventory',
    to: '/inventory',
    icon: Boxes,
    children: [
      { label: 'Stock Overview', to: '/inventory/overview' },
      { label: 'Products & SKUs', to: '/inventory/products' },
      { label: 'Transfers', to: '/inventory/transfers' },
      { label: 'Stock Movements', to: '/inventory/movements' },
    ],
  },
  { label: 'Purchases', to: '/purchases', icon: Truck },
  { label: 'Closing & Reconciliation', to: '/closing', icon: ClipboardCheck },
  { label: 'Administration', to: '/admin', icon: Settings },
];
```

## `apps/web/src/app.tsx`

```tsx
import { useSessionStore } from '@shop/state';
import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/app-shell';
import { AdministrationPage } from './pages/administration';
import { DayEndClosingPage } from './pages/closing/day-end';
import { HomePage } from './pages/home';
import { MovementsPage } from './pages/inventory/movements';
import { ProductsPage } from './pages/inventory/products';
import { StockOverviewPage } from './pages/inventory/stock-overview';
import { TransfersPage } from './pages/inventory/transfers';
import { LoginPage } from './pages/login';
import { PurchasesPage } from './pages/purchases';
import { InvoicesPage } from './pages/sales/invoices';
import { QuickBillingPage } from './pages/sales/quick-billing';

export function App() {
  const theme = useSessionStore((s) => s.theme);
  const isAuthenticated = useSessionStore((s) => s.user !== null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />

        <Route path="sales">
          <Route index element={<Navigate to="/sales/billing" replace />} />
          <Route path="billing" element={<QuickBillingPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
        </Route>

        <Route path="inventory">
          <Route index element={<Navigate to="/inventory/overview" replace />} />
          <Route path="overview" element={<StockOverviewPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="transfers" element={<TransfersPage />} />
          <Route path="movements" element={<MovementsPage />} />
        </Route>

        <Route path="purchases" element={<PurchasesPage />} />
        <Route path="closing" element={<DayEndClosingPage />} />
        <Route path="admin" element={<AdministrationPage />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
```

## `apps/web/src/main.tsx`

```tsx
import { RepositoriesProvider, createQueryClient } from '@shop/state';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './app';
import './index.css';
import { repositories } from './lib/repositories';

const queryClient = createQueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RepositoriesProvider repositories={repositories}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </RepositoriesProvider>
  </StrictMode>,
);
```
