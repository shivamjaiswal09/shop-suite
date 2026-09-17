import { useLogout, usePermissions, useSessionStore } from '@shop/state';
import { LogOut, Menu, Moon, Smartphone, Store, Sun } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { ErrorBoundary } from './error-boundary';
import { MobileNav } from './mobile-nav';
import { NavList } from './nav-list';
import { StoreSwitcher } from './store-switcher';
import { Button } from './ui/button';
import { visibleNav } from '@shop/core';

export function AppShell() {
  const { pathname } = useLocation();
  const company = useSessionStore((s) => s.company);
  const user = useSessionStore((s) => s.user);
  const theme = useSessionStore((s) => s.theme);
  const toggleTheme = useSessionStore((s) => s.toggleTheme);
  const logout = useLogout();
  const [menuOpen, setMenuOpen] = useState(false);

  // A route change must close the drawer even when it was not a tap inside it
  // that caused one — a browser back gesture, or a redirect after an action.
  useEffect(() => setMenuOpen(false), [pathname]);

  // `usePermissions` is empty while the role master loads, so a gated item stays
  // hidden until the answer is known rather than flashing in and disappearing.
  const granted = usePermissions();
  // Pruned by the shared helper, which drops a hidden child and then drops the
  // group once it has nothing left to show — so Inventory disappears rather
  // than remaining as a heading over an empty list.
  const nav = useMemo(() => visibleNav(granted), [granted]);

  return (
    <div className="flex min-h-screen bg-background">
      <MobileNav open={menuOpen} onClose={() => setMenuOpen(false)} items={nav} />

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
          <NavList items={nav} />
        </nav>

        <div className="border-t border-border p-3">
          {/* Sits above the account row rather than in NAV, because it leaves the
              app rather than navigating within it — and an owner setting up a
              second counter needs to find it without being sent a URL. */}
          <NavLink
            to="/download"
            className="mb-1 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Smartphone className="h-4 w-4 shrink-0" />
            <span className="truncate">Get the Android app</span>
          </NavLink>

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
        <header className="flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-3 sm:gap-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <StoreSwitcher />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-5">
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
