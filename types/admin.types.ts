// types/admin.types.ts
// Client-safe admin types & constants (no mongoose dependency)

export type AdminRole =
  | 'super_admin'
  | 'manager'
  | 'cashier'
  | 'chef'
  | 'waiter';

export type AdminPermission =
  | 'manage_staff'
  | 'manage_orders'
  | 'manage_menu'
  | 'manage_inventory'
  | 'manage_settings'
  | 'view_reports';

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  manager: 'Manager',
  cashier: 'Cashier',
  chef: 'Chef',
  waiter: 'Waiter',
};

export const ADMIN_PERMISSION_LABELS: Record<AdminPermission, string> = {
  manage_staff: 'Manage Staff',
  manage_orders: 'Manage Orders',
  manage_menu: 'Manage Menu',
  manage_inventory: 'Manage Inventory',
  manage_settings: 'Manage Settings',
  view_reports: 'View Reports',
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
  ],
  manager: [
    'manage_staff',
    'manage_orders',
    'manage_menu',
    'manage_inventory',
    'manage_settings',
    'view_reports',
  ],
  cashier: [
    'manage_orders',
    'view_reports',
  ],
  chef: [
    'manage_menu',
    'manage_inventory',
  ],
  waiter: [
    'manage_orders',
  ],
};
