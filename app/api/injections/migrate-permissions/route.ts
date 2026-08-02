// app/api/injections/migrate-permissions/route.ts
// One-time migration: recalculate all admin permissions from their role
// using the updated ROLE_PERMISSIONS map.

import { NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { AdminModel } from '@/models/factories/Admin';
import { ROLE_PERMISSIONS } from '@/types/admin.types';

export async function GET() {
  try {
    const conn = await mongooseConnect();
    const Admin = AdminModel(conn);

    const admins = await Admin.find({});
    let updated = 0;
    const results: { username: string; role: string; oldPerms: string[]; newPerms: string[] }[] = [];

    for (const admin of admins) {
      const oldPerms = [...(admin.permissions || [])];
      const newPerms = ROLE_PERMISSIONS[admin.role] || [];

      admin.permissions = newPerms;
      await admin.save();

      results.push({
        username: admin.username,
        role: admin.role,
        oldPerms,
        newPerms,
      });
      updated++;
    }

    return NextResponse.json({
      success: true,
      message: `Migrated permissions for ${updated} admin(s).`,
      results,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[migrate-permissions]', err);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
