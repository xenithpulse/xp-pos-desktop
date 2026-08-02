/**
 * Status Reset Injection API
 * 
 * Resets the system state for testing/demo purposes:
 * - Mark all orders as completed
 * - Mark all tables as available
 * - Close all active sessions
 * 
 * GET /api/injections/reset-status - Reset all orders and tables
 */

import { NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { OrderModel } from '@/models/factories/Order';
import { TableModel } from '@/models/factories/Table';
import { TableSessionModel } from '@/models/factories/TableSession';

// Compressed status codes
const ORDER_STATUS_COMPLETED = 6;  // completed
const TABLE_STATUS_AVAILABLE = 0;  // available

interface ResetStats {
  orders: {
    total: number;
    updated: number;
    alreadyCompleted: number;
  };
  tables: {
    total: number;
    updated: number;
    alreadyAvailable: number;
  };
  sessions: {
    total: number;
    closed: number;
    alreadyClosed: number;
  };
  errors: string[];
}

export async function GET() {
  const startTime = Date.now();

  try {
    const conn = await mongooseConnect();
    const Order = OrderModel(conn);
    const Table = TableModel(conn);
    const TableSession = TableSessionModel(conn);

    const stats: ResetStats = {
      orders: { total: 0, updated: 0, alreadyCompleted: 0 },
      tables: { total: 0, updated: 0, alreadyAvailable: 0 },
      sessions: { total: 0, closed: 0, alreadyClosed: 0 },
      errors: [],
    };

    // ═══════════════════════════════════════════════════════════════════════
    // 1. UPDATE ORDERS → Status = Completed
    // ═══════════════════════════════════════════════════════════════════════
    console.log('[Reset Status] Updating orders to completed...');
    
    const orders = await Order.find({}).lean();
    stats.orders.total = orders.length;

    for (const order of orders) {
      try {
        // Check if already completed (s=6) or cancelled (s=7)
        const currentStatus = (order as any).s ?? (order as any).status;
        if (currentStatus === ORDER_STATUS_COMPLETED || currentStatus === 7 || currentStatus === 'completed' || currentStatus === 'cancelled') {
          stats.orders.alreadyCompleted++;
          continue;
        }

        // Update to completed
        await Order.updateOne(
          { _id: order._id },
          {
            $set: {
              s: ORDER_STATUS_COMPLETED,      // status = completed
              ps: 1,                          // paymentStatus = paid
              coa: new Date(),                // completedAt
              lsc: new Date(),                // lastStatusChangeAt
            },
          }
        );
        stats.orders.updated++;
      } catch (error) {
        stats.errors.push(`Order ${order._id}: ${(error as Error).message}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. CLOSE ALL ACTIVE SESSIONS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('[Reset Status] Closing active sessions...');

    const sessions = await TableSession.find({}).lean();
    stats.sessions.total = sessions.length;

    for (const session of sessions) {
      try {
        const currentStatus = (session as any).status;
        if (currentStatus === 'closed') {
          stats.sessions.alreadyClosed++;
          continue;
        }

        await TableSession.updateOne(
          { _id: session._id },
          {
            $set: {
              status: 'closed',
              closedAt: new Date(),
            },
            $push: {
              events: {
                event: 'session_closed',
                details: 'Closed by reset-status injection',
                timestamp: new Date(),
              },
            },
          }
        );
        stats.sessions.closed++;
      } catch (error) {
        stats.errors.push(`Session ${session._id}: ${(error as Error).message}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. UPDATE TABLES → Status = Available
    // ═══════════════════════════════════════════════════════════════════════
    console.log('[Reset Status] Updating tables to available...');

    const tables = await Table.find({}).lean();
    stats.tables.total = tables.length;

    for (const table of tables) {
      try {
        // Check if already available (s=0)
        const currentStatus = (table as any).s ?? (table as any).status;
        if (currentStatus === TABLE_STATUS_AVAILABLE || currentStatus === 'available') {
          stats.tables.alreadyAvailable++;
          continue;
        }

        // Update to available and clear active session
        await Table.updateOne(
          { _id: table._id },
          {
            $set: {
              s: TABLE_STATUS_AVAILABLE,      // status = available
              as: null,                       // activeSessionId = null
              lsc: new Date(),                // lastStatusChangeAt
            },
            $unset: {
              r: '',                          // reservation = null
            },
          }
        );
        stats.tables.updated++;
      } catch (error) {
        stats.errors.push(`Table ${table._id}: ${(error as Error).message}`);
      }
    }

    const duration = Date.now() - startTime;

    console.log('[Reset Status] Complete:', {
      orders: `${stats.orders.updated}/${stats.orders.total} updated`,
      sessions: `${stats.sessions.closed}/${stats.sessions.total} closed`,
      tables: `${stats.tables.updated}/${stats.tables.total} updated`,
      errors: stats.errors.length,
      duration: `${duration}ms`,
    });

    return NextResponse.json({
      success: true,
      message: 'Status reset complete',
      stats,
      duration: `${duration}ms`,
    });
  } catch (error) {
    console.error('[Reset Status] Fatal error:', error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
