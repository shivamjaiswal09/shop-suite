import { firstVisiblePath } from '@shop/core';
import { usePermissions } from '@shop/state';
import { Navigate } from 'react-router';

/**
 * Where a section's bare path lands.
 *
 * Menu order decides, minus what the role cannot open — so reordering the nav
 * moves the landing page with it, and a role missing the first entry still
 * lands inside the section rather than being bounced out of it.
 */
export function SectionLanding({ sectionId }: { sectionId: string }) {
  const granted = usePermissions();

  // Same reason RequireScreen holds: an empty set means the role has not
  // arrived yet, not that nothing is permitted.
  if (granted.size === 0) return null;

  const path = firstVisiblePath(granted, sectionId) ?? firstVisiblePath(granted);
  return path ? <Navigate to={path} replace /> : null;
}
