// models/factories/Table.ts

import { Connection, Model } from 'mongoose';
import { 
  TableSchema, 
  ITable,
  TableSectionSchema,
  ITableSection,
} from '../schemas/table.schema';

// Status code mappings for pre-save hooks
const TABLE_STATUS_CODES = {
  available: 0, reserved: 1, occupied: 2, cleaning: 3, blocked: 4
};

// ─────────────────────────────────────────────────────────────────────────────
// Pre-save hook: Track status changes
// ─────────────────────────────────────────────────────────────────────────────

TableSchema.pre<ITable>('save', function () {
  // s=status, lsc=lastStatusChangeAt
  if (this.isModified('s')) {
    this.lsc = new Date();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Model Factory - Connection-based instantiation
// ─────────────────────────────────────────────────────────────────────────────

export function TableModel(conn: Connection): Model<ITable> {
  return (
    conn.models.Table ||
    conn.model<ITable>('Table', TableSchema)
  );
}

export function TableSectionModel(conn: Connection): Model<ITableSection> {
  return (
    conn.models.TableSection ||
    conn.model<ITableSection>('TableSection', TableSectionSchema)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Get all tables with active sessions
// ─────────────────────────────────────────────────────────────────────────────

export async function getTablesWithSessions(conn: Connection) {
  const Table = TableModel(conn);
  
  // Using compressed field names
  // ia=isActive, as=activeSessionId, sn=sectionName, tn=tableNumber
  return Table.find({ ia: 1 })  // isActive = true (1)
    .populate({
      path: 'as',  // activeSessionId
      populate: [
        {
          path: 'orderId',
          // Compressed field names in Order: on=orderNumber, gt=grandTotal, s=status, ps=paymentStatus, i=items, cAt=createdAt
          select: 'on gt s ps i cAt',
        },
        {
          path: 'waiterId',
          select: 'username role',
        },
        {
          path: 'hostId',
          select: 'username role',
        },
      ],
    })
    .sort({ sn: 1, tn: 1 })  // sectionName, tableNumber
    .lean();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Get tables by section
// ─────────────────────────────────────────────────────────────────────────────

export async function getTablesBySection(conn: Connection, sectionId?: string) {
  const Table = TableModel(conn);
  
  // Compressed field names: ia=isActive, si=sectionId, as=activeSessionId, tn=tableNumber
  const filter: Record<string, unknown> = { ia: 1 };  // isActive = true
  if (sectionId) {
    filter.si = sectionId;  // sectionId
  }
  
  return Table.find(filter)
    .populate('as')  // activeSessionId
    .sort({ tn: 1 })  // tableNumber
    .lean();
}
