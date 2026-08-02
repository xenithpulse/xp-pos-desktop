
import { Document, Schema } from 'mongoose';
import type { AdminRole, AdminPermission } from '@/types/admin.types';
import { ROLE_PERMISSIONS } from '@/types/admin.types';

// Re-export client-safe types so existing server imports still work
export type { AdminRole, AdminPermission } from '@/types/admin.types';
export { ADMIN_ROLE_LABELS, ADMIN_PERMISSION_LABELS, ROLE_PERMISSIONS } from '@/types/admin.types';

export interface IAdmin extends Document {
  username: string;
  password: string;
  role: AdminRole;
  permissions: AdminPermission[];
  isActive: boolean;
  createdAt: Date;
}

export const AdminSchema: Schema = new Schema(
  {
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: Object.keys(ROLE_PERMISSIONS),
      default: 'waiter',
      required: true,
    },
    permissions: [{ type: String }],
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'admins' }
);