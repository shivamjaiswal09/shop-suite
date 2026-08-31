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
import type { Permission } from '@shop/core';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  children?: { label: string; to: string }[];
  /**
   * Hide the item unless the signed-in role holds this. Purely cosmetic — the
   * API enforces the same permission independently, and must, because a hidden
   * link is not a closed door. Its job is to stop a cashier walking into a
   * screen that can only answer them with 403s.
   */
  permission?: Permission;
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
      { label: 'Orders', to: '/sales/orders' },
      { label: 'Invoices', to: '/sales/invoices' },
      { label: 'Returns', to: '/sales/returns' },
    ],
  },
  {
    label: 'Inventory',
    to: '/inventory',
    icon: Boxes,
    children: [
      { label: 'Store Stock', to: '/inventory/stores' },
      { label: 'Warehouse Stock', to: '/inventory/warehouses' },
      { label: 'Total Inventory', to: '/inventory/all' },
      { label: 'Transfers', to: '/inventory/transfers' },
      { label: 'Replenishment', to: '/inventory/replenishment' },
      { label: 'Stock Movements', to: '/inventory/movements' },
    ],
  },
  // Purchase documents carry supplier cost prices, so the API now requires
  // `purchase.manage` to read them. A cashier has no use for this screen and,
  // as of that change, no ability to load it either.
  { label: 'Purchases', to: '/purchases', icon: Truck, permission: 'purchase.manage' },
  {
    label: 'Closing & Reconciliation',
    to: '/closing',
    icon: ClipboardCheck,
    children: [
      { label: 'Day-End Closing', to: '/closing/day-end' },
      { label: 'Reconciliation', to: '/closing/reconciliation' },
    ],
  },
  {
    label: 'Onboarding',
    to: '/onboarding',
    icon: ClipboardList,
    children: [
      { label: 'Stores & Warehouses', to: '/onboarding/locations' },
      { label: 'Products & SKUs', to: '/onboarding/products' },
      { label: 'Users & Roles', to: '/onboarding/users' },
      { label: 'Masters', to: '/onboarding/masters' },
    ],
  },
  { label: 'Administration', to: '/admin', icon: Settings },
];
