// app/api/tables/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { TableModel, getTablesWithSessions } from '@/models/factories/Table';
import { ITable, TableStatus, TableShape } from '@/models/schemas/table.schema';
import { TableSessionModel } from '@/models/factories/TableSession';
import { AdminModel } from '@/models/factories/Admin';
import { OrderModel } from '@/models/factories/Order';
import { broadcastEvent } from '@/lib/realtime/eventBus';
import {
  prepareTableForStorage,
  prepareTableForResponse,
  prepareTablesForResponse,
  buildCompressedTableQuery,
  prepareTableForBroadcast,
  prepareTableUpdateForStorage,
} from '@/lib/compression/api-helpers';
import { reconcileTableReservations } from '@/lib/reservations/server';

const log = console.log;

// ─────────────────────────────────────────────────────────────────────────────
// GET - Retrieve tables with optional filters
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (authResult) return authResult;


  const conn = await mongooseConnect();
  // Register dependent models on this connection so populate('as' → Order/Admin) resolves.
  const TableSession = TableSessionModel(conn);
  const Admin = AdminModel(conn);
  const Order = OrderModel(conn);
  void TableSession; void Admin; void Order;

  try {
    const { searchParams } = new URL(req.url);

    // Bring reservation-driven state in line with the clock before reading.
    // This is what opens hold windows and auto-releases no-shows without a
    // background scheduler — the floor plan polls, so the floor plan drives it.
    if (searchParams.get('skipReconcile') !== 'true') {
      try {
        const changes = await reconcileTableReservations(conn);
        for (const change of changes) {
          broadcastEvent({
            type: 'table:updated',
            entityId: change.tableId,
            payload: {
              action: 'reservation_reconciled',
              status: change.to,
              tableNumber: change.tableNumber,
              released: change.released.length,
            },
            timestamp: Date.now(),
          });
        }
      } catch (e) {
        // Never let reconciliation failure take the floor plan down with it.
        log('[Tables API][GET] reconcile failed', e);
      }
    }

    // Check if we want full data with sessions
    const withSessions = searchParams.get('withSessions') === 'true';

    if (withSessions) {
      const tables = await getTablesWithSessions(conn);
      return NextResponse.json({ tables: prepareTablesForResponse(tables as any[]) }, { status: 200 });
    }
    
    // Build filter query
    const Table = TableModel(conn);
    const filter: Record<string, unknown> = {};
    
    const status = searchParams.get('status');
    if (status) filter.status = status;
    
    const sectionId = searchParams.get('sectionId');
    if (sectionId) filter.sectionId = sectionId;
    
    const isActive = searchParams.get('isActive');
    if (isActive !== null) filter.isActive = isActive !== 'false';
    
    // Convert to compressed query
    const compressedFilter = buildCompressedTableQuery(filter);
    
    const tables = await Table.find(compressedFilter)
      .populate('as') // activeSessionId -> as
      .sort({ sn: 1, tn: 1 }) // sectionName -> sn, tableNumber -> tn
      .lean() as unknown as Record<string, unknown>[];

    return NextResponse.json({ tables: prepareTablesForResponse(tables) }, { status: 200 });
  } catch (e) {
    log('[Tables API][GET]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST - Create a new table
// ─────────────────────────────────────────────────────────────────────────────

interface CreateTablePayload {
  tableNumber: string;
  name?: string;
  sectionId?: string;
  sectionName?: string;
  x_position: number;
  y_position: number;
  width?: number;
  height?: number;
  orientation?: number;
  shape?: TableShape;
  capacity: number;
  minCovers?: number;
  color?: string;
}

export async function POST(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (authResult) return authResult;

  const conn = await mongooseConnect();
  const Table = TableModel(conn);
  const Order = OrderModel(conn);
  void Order; // registered for populate side-effects

  try {
    const payload: CreateTablePayload = await req.json();

    // Validate required fields
    if (!payload.tableNumber) {
      return NextResponse.json(
        { message: 'Table number is required' },
        { status: 400 }
      );
    }

    if (typeof payload.capacity !== 'number' || payload.capacity < 1) {
      return NextResponse.json(
        { message: 'Valid capacity is required' },
        { status: 400 }
      );
    }

    // Check for duplicate table number using compressed field
    const existing = await Table.findOne({ tn: payload.tableNumber });
    if (existing) {
      return NextResponse.json(
        { message: 'Table number already exists' },
        { status: 409 }
      );
    }

    // Prepare table data with compression
    const tableData = prepareTableForStorage({
      tableNumber: payload.tableNumber,
      name: payload.name,
      sectionId: payload.sectionId,
      sectionName: payload.sectionName,
      x_position: payload.x_position ?? 0,
      y_position: payload.y_position ?? 0,
      width: payload.width ?? 1,
      height: payload.height ?? 1,
      orientation: payload.orientation ?? 0,
      shape: payload.shape ?? 'square',
      capacity: payload.capacity,
      minCovers: payload.minCovers,
      color: payload.color,
      status: 'available',
      isActive: true,
    } as any);

    const table = await Table.create(tableData);
    
    // Decode for response
    const decodedTable = prepareTableForResponse(table.toObject() as unknown as Record<string, unknown>);

    broadcastEvent({
      type: 'table:updated',
      entityId: table._id.toString(),
      payload: prepareTableForBroadcast(table.toObject() as unknown as Record<string, unknown>) as unknown as Record<string, unknown>, // Compressed for realtime
      timestamp: Date.now(),
    });

    return NextResponse.json(decodedTable, { status: 201 });
  } catch (e) {
    log('[Tables API][POST]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT - Bulk update table positions (for drag-and-drop floor plan editor)
// ─────────────────────────────────────────────────────────────────────────────

interface TablePositionUpdate {
  id: string;
  x_position: number;
  y_position: number;
  width?: number;
  height?: number;
  orientation?: number;
}

export async function PUT(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (authResult) return authResult;

  const conn = await mongooseConnect();
  const Table = TableModel(conn);
  const Order = OrderModel(conn);
  void Order; // registered for populate side-effects

  try {
    const { updates }: { updates: TablePositionUpdate[] } = await req.json();

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { message: 'Updates array is required' },
        { status: 400 }
      );
    }

    // Perform bulk updates — map to compressed schema field names
    const bulkOps = updates.map(update => ({
      updateOne: {
        filter: { _id: update.id },
        update: {
          $set: {
            x: update.x_position,
            y: update.y_position,
            ...(update.width !== undefined && { w: update.width }),
            ...(update.height !== undefined && { h: update.height }),
            ...(update.orientation !== undefined && { o: update.orientation }),
          },
        },
      },
    }));

    await Table.bulkWrite(bulkOps);

    broadcastEvent({
      type: 'table:updated',
      entityId: '__bulk_positions__',
      payload: { action: 'bulk_position_update', count: updates.length },
      timestamp: Date.now(),
    });

    return NextResponse.json({ 
      success: true, 
      message: `Updated ${updates.length} table positions` 
    }, { status: 200 });
  } catch (e) {
    log('[Tables API][PUT]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH - Bulk Upsert: create new tables + update existing in one call
//         Used by the Layout Playground "Save Layout" action.
// ─────────────────────────────────────────────────────────────────────────────

interface BulkUpsertItem {
  _id?: string;               // present → update, absent → create
  tableNumber: string;
  name?: string;
  sectionId?: string;
  sectionName?: string;
  x_position: number;
  y_position: number;
  width: number;
  height: number;
  orientation: number;
  shape: string;
  capacity: number;
  minCovers?: number;
  color?: string;
  groupId?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export async function PATCH(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (authResult) return authResult;

  const conn = await mongooseConnect();
  const Table = TableModel(conn);
  const Order = OrderModel(conn);
  void Order; // registered for populate side-effects
  
  try {
    const { tables }: { tables: BulkUpsertItem[] } = await req.json();

    if (!Array.isArray(tables) || tables.length === 0) {
      return NextResponse.json(
        { message: 'tables array is required' },
        { status: 400 }
      );
    }

    const toCreate: BulkUpsertItem[] = [];
    const toUpdate: BulkUpsertItem[] = [];

    for (const item of tables) {
      if (item._id) {
        toUpdate.push(item);
      } else {
        toCreate.push(item);
      }
    }

    let createdCount = 0;
    let updatedCount = 0;
    const resultTables: unknown[] = [];

    // ── Create new tables ──
    if (toCreate.length > 0) {
      // Check for duplicate table numbers (tn = tableNumber in compressed schema)
      const existingNumbers = await Table.find({
        tn: { $in: toCreate.map((t) => t.tableNumber) },
      }).select('tn').lean();

      const existingSet = new Set(existingNumbers.map((e: any) => e.tn));

      // Auto-suffix duplicates so the upsert never fails
      // Use prepareTableForStorage to encode to compressed format
      const createDocs = toCreate.map((item) => {
        let num = item.tableNumber;
        if (existingSet.has(num)) {
          num = `${num}-${Date.now().toString(36).slice(-4)}`;
        }
        return prepareTableForStorage({
          tableNumber: num,
          name: item.name,
          sectionId: item.sectionId || undefined,
          sectionName: item.sectionName,
          x_position: item.x_position,
          y_position: item.y_position,
          width: item.width ?? 100,
          height: item.height ?? 100,
          orientation: item.orientation ?? 0,
          shape: item.shape ?? 'square',
          capacity: item.capacity ?? 4,
          minCovers: item.minCovers,
          color: item.color,
          groupId: item.groupId || null,
          sortOrder: item.sortOrder ?? 0,
          status: 'available',
          isActive: true,
        } as any);
      });

      const created = await Table.insertMany(createDocs);
      createdCount = created.length;
      resultTables.push(...created);
    }

    // ── Update existing tables ──
    if (toUpdate.length > 0) {
      // Use prepareTableUpdateForStorage to encode updates to compressed format
      const bulkOps = toUpdate.map((item) => {
        const updateData: Record<string, unknown> = {};
        if (item.tableNumber) updateData.tableNumber = item.tableNumber;
        if (item.name !== undefined) updateData.name = item.name;
        if (item.sectionId !== undefined) updateData.sectionId = item.sectionId || undefined;
        if (item.sectionName !== undefined) updateData.sectionName = item.sectionName;
        if (item.x_position !== undefined) updateData.x_position = item.x_position;
        if (item.y_position !== undefined) updateData.y_position = item.y_position;
        if (item.width !== undefined) updateData.width = item.width;
        if (item.height !== undefined) updateData.height = item.height;
        if (item.orientation !== undefined) updateData.orientation = item.orientation;
        if (item.shape !== undefined) updateData.shape = item.shape;
        if (item.capacity !== undefined) updateData.capacity = item.capacity;
        if (item.minCovers !== undefined) updateData.minCovers = item.minCovers;
        if (item.color !== undefined) updateData.color = item.color;
        if (item.groupId !== undefined) updateData.groupId = item.groupId || null;
        if (item.sortOrder !== undefined) updateData.sortOrder = item.sortOrder;
        if (item.isActive !== undefined) updateData.isActive = item.isActive;

        return {
          updateOne: {
            filter: { _id: item._id as string },
            update: { $set: prepareTableUpdateForStorage(updateData as any) },
          },
        };
      }) as any[];

      const result = await Table.bulkWrite(bulkOps);
      updatedCount = result.modifiedCount;
    }

    broadcastEvent({
      type: 'table:updated',
      entityId: '__bulk_upsert__',
      payload: { action: 'bulk_upsert', created: createdCount, updated: updatedCount },
      timestamp: Date.now(),
    });

    return NextResponse.json({
      success: true,
      created: createdCount,
      updated: updatedCount,
      tables: resultTables,
    }, { status: 200 });
  } catch (e) {
    log('[Tables API][PATCH]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
