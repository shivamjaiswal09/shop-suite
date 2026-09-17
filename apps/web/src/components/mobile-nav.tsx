import { useLogout, useSessionStore } from '@shop/state';
import { LogOut, Smartphone, Store, X } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink } from 'react-router';
import { NavList } from './nav-list';
import { Button } from './ui/button';
import type { NavNode } from '@shop/core';

/**
 * Navigation for screens too narrow for the sidebar.
 *
 * Below `lg` the sidebar is hidden, and until this existed it was the only
 * place NAV was rendered — so a phone could reach the home screen and nothing
 * else. Not a cramped layout: no route out at all.
 */
export function MobileNav({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: NavNode[];
}) {
  const company = useSessionStore((s) => s.company);
  const user = useSessionStore((s) => s.user);
  const logout = useLogout();

  // Escape closes it, and the page behind must not scroll while it is open —
  // on a phone that reads as the drawer itself being broken.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="Close menu"
        className="absolute inset-0 bg-foreground/40"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        className="absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col border-r border-border bg-card shadow-xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Store className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Shop Suite</p>
            <p className="truncate text-xs text-muted-foreground">{company?.name}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close menu">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <NavList items={items} expandAll onNavigate={onClose} />
        </nav>

        <div className="border-t border-border p-3">
          <NavLink
            to="/download"
            onClick={onClose}
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
      </div>
    </div>
  );
}
