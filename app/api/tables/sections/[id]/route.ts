// app/api/tables/sections/[id]/route.ts
// API routes for individual table section operations

import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { TableSectionModel } from '@/models/factories/Table';
import { broadcastEvent } from '@/lib/realtime/eventBus';

// ─────────────────────────────────────────────────────────────────────────────
// DELETE - Soft-delete a section (set ia=0)
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (denied) return denied;

  const { id } = await params;
  const conn = await mongooseConnect();
  const TableSection = TableSectionModel(conn);

  try {
    const section = await TableSection.findById(id);
    if (!section) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }

    // Soft-delete: set ia (isActive) to 0
    section.ia = 0;
    await section.save();

    broadcastEvent({
      type: 'table:updated',
      entityId: id,
      payload: { action: 'section_deleted', name: section.n },
      timestamp: Date.now(),
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.log('[TableSections API][DELETE]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
