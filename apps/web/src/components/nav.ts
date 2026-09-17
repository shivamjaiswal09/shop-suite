import {
  Boxes,
  ClipboardCheck,
  ClipboardList,
  LayoutDashboard,
  Settings,
  ShoppingCart,
  Truck,
  type LucideIcon,
} from 'lucide-react';

export type { NavNode } from '@shop/core';
export { NAV_TREE } from '@shop/core';

/**
 * Icons for the top-level modules, keyed by the shared tree's node id.
 *
 * The taxonomy itself lives in `@shop/core` so that mobile, the role editor and
 * the API all read the same one. Only the icons stay here, because Lucide is a
 * web dependency and mobile draws the same modules with Ionicons — sharing the
 * structure while each app supplies its own glyphs is what stopped the two
 * menus drifting apart.
 */
export const NAV_ICONS: Record<string, LucideIcon> = {
  home: LayoutDashboard,
  sales: ShoppingCart,
  inventory: Boxes,
  purchases: Truck,
  closing: ClipboardCheck,
  onboarding: ClipboardList,
  admin: Settings,
};
