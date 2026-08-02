// app/api/tables/sections/route.ts
// API routes for table sections
// Uses compressed field names: n=name, cl=color, fl=floorLevel, ia=isActive

import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { TableSectionModel } from '@/models/factories/Table';
import { broadcastEvent } from '@/lib/realtime/eventBus';

const log = console.log;

// ─────────────────────────────────────────────────────────────────────────────
// GET - Retrieve all sections
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  const denied = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const TableSection = TableSectionModel(conn);

  try {
    // ia:1 = isActive, sort by n = name
    const sections = await TableSection.find({ ia: 1 })
      .sort({ n: 1 })
      .lean();
    
    // Transform to human-readable for API response
    const transformed = sections.map((s: any) => ({
      _id: s._id,
      name: s.n,
      color: s.cl,
      floorLevel: s.fl,
      isActive: s.ia === 1,
    }));
    
    return NextResponse.json({ sections: transformed });
  } catch (e) {
    log('[TableSections API][GET]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST - Create a new section
// ─────────────────────────────────────────────────────────────────────────────

interface CreateSectionPayload {
  name: string;
  floorNumber?: number;
  color?: string;
}

export async function POST(request: NextRequest) {
  const denied = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const TableSection = TableSectionModel(conn);

  try {
    const data: CreateSectionPayload = await request.json();
    
    if (!data.name) {
      return NextResponse.json(
        { error: 'Section name is required' },
        { status: 400 }
      );
    }

    // Check for duplicate name (n = name)
    const existing = await TableSection.findOne({ n: data.name });
    if (existing) {
      return NextResponse.json(
        { error: 'A section with this name already exists' },
        { status: 400 }
      );
    }

    // Create with compressed field names
    const section = new TableSection({
      n: data.name,           // name
      fl: data.floorNumber || 0,  // floorLevel
      cl: data.color,         // color
      ia: 1,                  // isActive = true
    });

    await section.save();

    broadcastEvent({
      type: 'table:updated',
      entityId: section._id.toString(),
      payload: { action: 'section_created', name: data.name },
      timestamp: Date.now(),
    });
    
    // Return human-readable response
    return NextResponse.json({
      _id: section._id,
      name: section.n,
      color: section.cl,
      floorLevel: section.fl,
      isActive: section.ia === 1,
    }, { status: 201 });
  } catch (e) {
    log('[TableSections API][POST]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
