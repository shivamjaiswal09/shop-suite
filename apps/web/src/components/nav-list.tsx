import type { NavNode } from '@shop/core';
import { NavLink, useLocation } from 'react-router';
import { cn } from '@/lib/utils';
import { NAV_ICONS } from './nav';

/**
 * The navigation tree, rendered identically for the desktop sidebar and the
 * mobile drawer.
 *
 * Shared rather than duplicated so the two cannot drift: a module added to NAV
 * appears in both, and a permission that hides it hides it in both. A phone
 * showing a smaller menu than a laptop is a bug that would otherwise take
 * months to notice.
 */
export function NavList({
  items,
  expandAll = false,
  onNavigate,
}: {
  items: NavNode[];
  /**
   * Show every section's children, not just the open one. The sidebar reveals
   * children on navigation because it is always on screen; the drawer cannot
   * afford that, since expanding a section there costs a tap, a close and a
   * reopen. Showing everything makes any screen one tap away.
   */
  expandAll?: boolean;
  /** Lets the drawer close itself once a destination is chosen. */
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();

  return (
    <>
      {items.map((item) => {
        const active = item.path === '/' ? pathname === '/' : pathname.startsWith(item.path);
        const Icon = NAV_ICONS[item.id];
        return (
          <div key={item.id}>
            <NavLink
              to={item.path}
              end={item.path === '/'}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                active ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-muted',
              )}
            >
              {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
              <span className="truncate">{item.label}</span>
            </NavLink>

            {(expandAll || active) && item.children ? (
              <div className="ml-6 mt-1 space-y-0.5 border-l border-border pl-3">
                {item.children.map((child) => (
                  <NavLink
                    key={child.id}
                    to={child.path}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'block rounded-md px-2 py-1.5 text-[13px] transition-colors',
                        isActive ? 'font-medium text-primary' : 'text-muted-foreground hover:text-foreground',
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
    </>
  );
}
