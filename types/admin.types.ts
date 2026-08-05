// types/admin.types.ts
// Client-safe admin types & constants (no mongoose dependency)
//
// ── WHY THERE ARE DELIVERY AND TAKEAWAY ROLES ────────────────────────────────
// Plenty of restaurants put one person on delivery and another on takeaway for
// a whole shift. Those two people do not need the floor plan, they do not need
// each other's queue, and on a busy service every screen they have to navigate
// past is a mistake waiting to happen. So each order type is a workspace with
// its own URL and its own role, and somebody assigned to it opens the POS
// straight into the one screen they use.
//
// A role is a PRESET of permissions, not a separate concept - see
// ROLE_PERMISSIONS. That is what lets a manager keep every workspace while a
// delivery rider gets exactly one, without a second access-control system.

export type AdminRole =
  | 'super_admin'
  | 'manager'
  | 'cashier'
  | 'chef'
  | 'waiter'
  | 'delivery'
  | 'takeaway';

export type AdminPermission =
  | 'manage_staff'
  | 'manage_orders'
  | 'manage_menu'
  | 'manage_inventory'
  | 'manage_settings'
  | 'view_reports'
  /** The takeaway workspace at /takeaway. */
  | 'manage_takeaway'
  /** The delivery workspace at /delivery. */
  | 'manage_delivery'
  /** The kitchen display at /kitchen. */
  | 'view_kitchen';

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  manager: 'Manager',
  cashier: 'Cashier',
  chef: 'Chef',
  waiter: 'Waiter',
  delivery: 'Delivery Staff',
  takeaway: 'Takeaway Staff',
};

/** One plain line per role, for the staff screen. Owners pick roles, not permissions. */
export const ADMIN_ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  super_admin: 'Everything, including server settings and staff accounts.',
  manager: 'Everything day to day: floor, orders, menu, stock and reports.',
  cashier: 'Takes orders and payments on every order type. Sees reports.',
  chef: 'Kitchen display, menu and stock. Does not take payments.',
  waiter: 'The floor plan and dine-in orders.',
  delivery: 'The delivery queue only. Opens straight into it.',
  takeaway: 'The takeaway queue only. Opens straight into it.',
};

export const ADMIN_PERMISSION_LABELS: Record<AdminPermission, string> = {
  manage_staff: 'Manage Staff',
  manage_orders: 'Manage Orders',
  manage_menu: 'Manage Menu',
  manage_inventory: 'Manage Inventory',
  manage_settings: 'Manage Settings',
  view_reports: 'View Reports',
  manage_takeaway: 'Takeaway Orders',
  manage_delivery: 'Delivery Orders',
  view_kitchen: 'Kitchen Display',
};

export interface IRolePermissions {
  [role: string]: AdminPermission[];
}

export const ROLE_PERMISSIONS: IRolePermissions = {
  super_admin: [
    'manage_staff',
    'manage_orders',
    'manage_menu',
    'manage_inventory',
    'manage_settings',
    'view_reports',
    'manage_takeaway',
    'manage_delivery',
    'view_kitchen',
  ],
  manager: [
    'manage_staff',
    'manage_orders',
    'manage_menu',
    'manage_inventory',
    'manage_settings',
    'view_reports',
    'manage_takeaway',
    'manage_delivery',
    'view_kitchen',
  ],
  cashier: [
    'manage_orders',
    'view_reports',
    'manage_takeaway',
    'manage_delivery',
  ],
  chef: [
    'manage_menu',
    'manage_inventory',
    'view_kitchen',
  ],
  waiter: [
    'manage_orders',
  ],
  // Deliberately narrow. A rider signing in should land on the delivery queue
  // and be able to reach nothing else - that is the entire point of the role.
  delivery: [
    'manage_delivery',
  ],
  takeaway: [
    'manage_takeaway',
  ],
};

/**
 * The permissions a user actually has.
 *
 * The union of what is stored on the account and what their role grants, and
 * the role half is load-bearing for two separate reasons:
 *
 *  1. POST /api/admin creates accounts with a role and NEVER writes a
 *     permissions array. Every account made through the staff screen therefore
 *     has `permissions: []` stored, and any check that read that array alone
 *     would deny a manager their own features. Only the first-run bootstrap
 *     ever populated it.
 *
 *  2. Stored arrays are a snapshot of the permissions that existed on the day
 *     the account was made. A manager created before this file gained
 *     `manage_delivery` would otherwise be locked out of a feature shipped
 *     afterwards, silently, until somebody re-saved every account.
 *
 * The consequence to be aware of: a permission cannot be revoked from an
 * individual below what their role grants. Narrowing someone's access means
 * giving them a narrower role, which is the model the UI presents anyway.
 */
export function resolvePermissions(
  role: AdminRole | string | undefined,
  stored: AdminPermission[] | undefined,
): AdminPermission[] {
  const fromRole = (role && ROLE_PERMISSIONS[role]) || [];
  return Array.from(new Set([...(stored ?? []), ...fromRole]));
}

/** Does this user hold `needed`? Safe with a missing role or a missing array. */
export function hasPermission(
  role: AdminRole | string | undefined,
  stored: AdminPermission[] | undefined,
  needed: AdminPermission,
): boolean {
  return resolvePermissions(role, stored).includes(needed);
}

/**
 * Where this role should land after signing in.
 *
 * Someone whose whole job is one queue should not arrive at a menu of things
 * they cannot open. Everyone else keeps the home screen.
 */
export function landingPathForRole(role: AdminRole | string | undefined): string {
  switch (role) {
    case 'delivery':
      return '/delivery';
    case 'takeaway':
      return '/takeaway';
    case 'chef':
      return '/kitchen';
    default:
      return '/';
  }
}
