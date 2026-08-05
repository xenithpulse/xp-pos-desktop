import React, { ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { AdminPermission } from '@/models/schemas/admin.schema';
import { hasPermission } from '@/types/admin.types';
import { Lock, LucideFileExclamationPoint } from 'lucide-react';


interface AccessControlProps {
  allowedRoles?: string[];
  requiredPermissions?: AdminPermission[];
  fallback?: ReactNode;
  children: ReactNode;
}

export default function AccessControl({
  allowedRoles = [],
  requiredPermissions = [],
  fallback,
  children,
}: AccessControlProps) {
  const { data: session, status } = useSession();

  // While NextAuth is checking session
  if (status === 'loading') return null;

  const user = session?.user;

  // Type guard to ensure user and user.permissions are defined and correctly typed
  const userPermissions = (user?.permissions || []) as AdminPermission[];

  const hasValidRole =
    allowedRoles.length === 0 || allowedRoles.includes(user?.role || '');

  // hasPermission() rather than a bare .includes(): it falls back to the role's
  // defaults. Accounts created through the staff screen have no stored
  // permissions array at all — only a role — so a raw membership test locks
  // them out of pages their role plainly grants. Same reasoning as the sidebar.
  const hasValidPermissions =
    requiredPermissions.length === 0 ||
    requiredPermissions.every((perm) =>
      hasPermission(user?.role, userPermissions, perm)
    );

  if (hasValidRole && hasValidPermissions) {
    return <>{children}</>;
  }

  // Render fallback if provided, otherwise default message
  return (
    fallback ?? (
      <div className="p-6 bg-red-50 max-h-50 text-red-700 border border-red-200 rounded-lg shadow-md flex flex-col items-center justify-center space-y-4 w-7xl mx-auto my-8 animate-fade-in">
        <Lock className="text-red-500 text-5xl" />
        <h2 className="text-2xl font-bold text-red-800 flex items-center">
          <LucideFileExclamationPoint className="mr-2 text-red-600" /> Access Denied
        </h2>
        <p className="text-lg text-red-600 text-center">
          You do not have the necessary permissions to view this content.
        </p>
      </div>
    )
  );
}