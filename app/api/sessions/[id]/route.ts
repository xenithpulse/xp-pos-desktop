// app/api/sessions/[id]/route.ts
// API routes for table session operations

import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest, getSession } from '@/lib/auth';
import { TableSessionModel, closeTableSession } from '@/models/factories/TableSession';
import { extractId } from '@/utils/extractID';
import { isVersionConflict, versionConflictBody, withRetry } from '@/lib/concurrency';
import { broadcastEvent } from '@/lib/realtime/eventBus';

const log = console.log;

// ─────────────────────────────────────────────────────────────────────────────
// GET - Retrieve session by ID
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const id = extractId(request, 3);

  const denied = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const TableSession = TableSessionModel(conn);

  try {
    const session = await TableSession.findById(id)
      .populate('tableId')
      .populate('orderId')
      .populate('waiterId', 'username')
      .populate('hostId', 'username')
      .lean();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch (e) {
    log('[Sessions API][GET/:id]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH - Session actions (request_bill, close, update_waiter, etc.)
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  const id = extractId(request, 3);

  const denied = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (denied) return denied;

  const authSession = await getSession();
  const staffId = authSession?.user?.id;

  if (!staffId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const conn = await mongooseConnect();
  const TableSession = TableSessionModel(conn);

  try {
    const { action, ...data } = await request.json();

    // Use withRetry for automatic retry on version conflicts.
    // Broadcast is OUTSIDE the retry to prevent duplicate events.
    const result = await withRetry(async () => {
      const session = await TableSession.findById(id);
      if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }

      // Convert staffId string to ObjectId for schema compatibility
      const staffObjectId = new Types.ObjectId(staffId);

      switch (action) {
        case 'request_bill':
          if (session.status !== 'active') {
            return NextResponse.json(
              { error: 'Can only request bill for active sessions' },
              { status: 400 }
            );
          }
          session.status = 'billing';
          session.billRequestedAt = new Date();
          session.events.push({
            event: 'bill_requested',
            details: 'Bill requested by guest',
            staffId: staffObjectId,
            timestamp: new Date(),
          });
          await session.save();
          break;

        case 'close':
          await closeTableSession(conn, id, staffId);
          broadcastEvent({
            type: 'session:closed',
            entityId: id,
            payload: { status: 'closed', action: 'close' },
            timestamp: Date.now(),
          });
          // closeTableSession returns void — fetch the closed session to return
          const closedSession = await TableSession.findById(id)
            .populate('tableId')
            .populate('orderId')
            .lean();
          return NextResponse.json(closedSession ?? { success: true, sessionId: id, status: 'closed' });

        case 'update_waiter':
          if (!data.waiterId) {
            return NextResponse.json(
              { error: 'waiterId is required' },
              { status: 400 }
            );
          }
          const previousWaiterId = session.waiterId;
          session.waiterId = new Types.ObjectId(data.waiterId);
          session.events.push({
            event: 'waiter_changed',
            details: `Server changed from ${previousWaiterId || 'none'} to ${data.waiterId}`,
            staffId: staffObjectId,
            timestamp: new Date(),
          });
          await session.save();
          break;

        case 'add_note':
          if (!data.note) {
            return NextResponse.json(
              { error: 'note is required' },
              { status: 400 }
            );
          }
          session.notes = session.notes 
            ? `${session.notes}\n${data.note}` 
            : data.note;
          session.events.push({
            event: 'note_added',
            details: data.note,
            staffId: staffObjectId,
            timestamp: new Date(),
          });
          await session.save();
          break;

        case 'update_covers':
          if (typeof data.covers !== 'number' || data.covers < 1) {
            return NextResponse.json(
              { error: 'valid covers count is required' },
              { status: 400 }
            );
          }
          session.covers = data.covers;
          await session.save();
          break;

        case 'update_financials':
          // Initialize financials if not exists
          const financials = session.financials || {};
          if (data.serviceChargePercentage !== undefined) {
            financials.serviceChargePercentage = data.serviceChargePercentage;
          }
          if (data.taxOverride !== undefined) {
            financials.taxOverride = data.taxOverride;
          }
          if (data.discountReason !== undefined) {
            financials.discountReason = data.discountReason;
          }
          session.financials = financials;
          await session.save();
          break;

        default:
          return NextResponse.json(
            { error: `Unknown action: ${action}` },
            { status: 400 }
          );
      }

      // Return updated session (lean() ensures plain JS object — no ObjectId serialization issues)
      const updatedSession = await TableSession.findById(id)
        .populate('tableId')
        .populate('orderId')
        .populate('waiterId', 'username')
        .lean();

      return updatedSession;
    });

    // Transactional / early-return cases (close, validation errors) already
    // returned a NextResponse — pass them through.
    if (result instanceof NextResponse) {
      return result;
    }

    // Broadcast once after successful save (never inside retry loop)
    broadcastEvent({
      type: 'session:updated',
      entityId: id,
      __v: (result as any)?.__v,
      payload: { status: (result as any)?.status, action },
      timestamp: Date.now(),
    });

    return NextResponse.json(result);
  } catch (e: any) {
    if (isVersionConflict(e)) {
      return NextResponse.json(versionConflictBody('Session'), { status: 409 });
    }
    log('[Sessions API][PATCH/:id]', e);
    
    if (e.message === 'Session not found') {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (e.message === 'Session is already closed') {
      return NextResponse.json({ error: 'Session is already closed' }, { status: 400 });
    }
    
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
