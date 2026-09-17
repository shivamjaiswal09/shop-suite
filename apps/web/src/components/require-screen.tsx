import { firstVisiblePath, type ScreenPermission } from '@shop/core';
import { usePermissions } from '@shop/state';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';

/**
 * Guards a route against a role that may not see it.
 *
 * Hiding the sidebar entry is not enough — nav.ts has always said so, and until
 * now the API was the only thing that made it true. A typed URL, a stale
 * bookmark or a link pasted into chat all land here, and without this they land
 * on the screen itself.
 *
 * Redirect rather than a 403 page: someone who followed an old bookmark wants
 * to get on with their day, not read about why they cannot. Their own first
 * visible screen is the most useful place to put them.
 */
export function RequireScreen({
  screen,
  children,
}: {
  screen: ScreenPermission;
  children: ReactNode;
}) {
  const granted = usePermissions();

  // Empty while the role master is still loading. Treating "not yet known" as
  // "not permitted" would bounce every user off every screen on a cold load, so
  // hold the render instead — the same reason the sidebar waits.
  if (granted.size === 0) return null;

  if (!granted.has(screen)) {
    const fallback = firstVisiblePath(granted);
    // No visible screen at all is a role-configuration problem, not a routing
    // one, and sending them in a circle would only hide it.
    return fallback ? <Navigate to={fallback} replace /> : <NoScreens />;
  }

  return <>{children}</>;
}

function NoScreens() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-lg font-semibold">Nothing to show you yet</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your role has not been given access to any screen. An administrator can grant it under
        Onboarding → Users &amp; Roles.
      </p>
    </div>
  );
}
