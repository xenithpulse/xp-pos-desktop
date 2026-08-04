// lib/demo-data/tables.ts
//
// The sample floor plan: two sections and fourteen tables, positioned.
//
// Why this exists at all: the bundled JSON gives a fresh install a menu, but no
// tables - and tables are how most of the POS is actually driven (sessions,
// orders against a table, the floor view). Without them a new user opens the
// floor plan to an empty grid and has nothing to click.
//
// Positions are hand-laid rather than generated. A grid of identical squares
// looks like test data; a room with a bar, a window row and a terrace looks
// like a restaurant, which is the point of a demo.
//
// COORDINATES are in the same arbitrary units the floor-plan editor uses (see
// x/y/w/h on ITable). Origin is top-left. Everything here sits inside roughly
// 1000x700 so it fits the default canvas without panning.

import { Connection, Types } from "mongoose";
import { TableModel, TableSectionModel } from "@/models/factories/Table";

// Shape codes, from table.schema.ts: 0=square, 1=rectangle, 2=round, 3=oval
const SQUARE = 0;
const RECTANGLE = 1;
const ROUND = 2;
const OVAL = 3;

// Status code 0 = available.
const AVAILABLE = 0;

interface DemoSection {
  name: string;
  color: string;
  floor: number;
}

interface DemoTable {
  number: string;
  section: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: number;
  capacity: number;
  sortOrder: number;
}

const SECTIONS: DemoSection[] = [
  { name: "Main Hall", color: "#34d399", floor: 0 },
  { name: "Terrace", color: "#38bdf8", floor: 0 },
];

// Main Hall: a window row along the top, four-tops through the middle, and two
// large round tables for groups. Terrace: a relaxed scatter of small tables.
const TABLES: DemoTable[] = [
  // Window row - twos, tight against the top wall
  { number: "1", section: "Main Hall", x: 60, y: 60, w: 80, h: 80, shape: SQUARE, capacity: 2, sortOrder: 1 },
  { number: "2", section: "Main Hall", x: 190, y: 60, w: 80, h: 80, shape: SQUARE, capacity: 2, sortOrder: 2 },
  { number: "3", section: "Main Hall", x: 320, y: 60, w: 80, h: 80, shape: SQUARE, capacity: 2, sortOrder: 3 },
  { number: "4", section: "Main Hall", x: 450, y: 60, w: 80, h: 80, shape: SQUARE, capacity: 2, sortOrder: 4 },

  // Middle - four-tops
  { number: "5", section: "Main Hall", x: 60, y: 220, w: 120, h: 90, shape: RECTANGLE, capacity: 4, sortOrder: 5 },
  { number: "6", section: "Main Hall", x: 230, y: 220, w: 120, h: 90, shape: RECTANGLE, capacity: 4, sortOrder: 6 },
  { number: "7", section: "Main Hall", x: 400, y: 220, w: 120, h: 90, shape: RECTANGLE, capacity: 4, sortOrder: 7 },

  // Back of the room - big rounds for groups
  { number: "8", section: "Main Hall", x: 90, y: 400, w: 140, h: 140, shape: ROUND, capacity: 8, sortOrder: 8 },
  { number: "9", section: "Main Hall", x: 300, y: 400, w: 140, h: 140, shape: ROUND, capacity: 8, sortOrder: 9 },

  // The long family table
  { number: "10", section: "Main Hall", x: 500, y: 420, w: 200, h: 100, shape: OVAL, capacity: 10, sortOrder: 10 },

  // Terrace - offset to the right so the two sections read as separate rooms
  { number: "T1", section: "Terrace", x: 780, y: 80, w: 90, h: 90, shape: ROUND, capacity: 4, sortOrder: 11 },
  { number: "T2", section: "Terrace", x: 780, y: 220, w: 90, h: 90, shape: ROUND, capacity: 4, sortOrder: 12 },
  { number: "T3", section: "Terrace", x: 780, y: 360, w: 90, h: 90, shape: ROUND, capacity: 4, sortOrder: 13 },
  { number: "T4", section: "Terrace", x: 780, y: 500, w: 130, h: 90, shape: RECTANGLE, capacity: 6, sortOrder: 14 },
];

/** Table numbers this module owns. Removal is keyed on exactly these. */
export function demoTableNumbers(): string[] {
  return TABLES.map((t) => t.number);
}

export function demoSectionNames(): string[] {
  return SECTIONS.map((s) => s.name);
}

export interface TableSeedResult {
  sections: number;
  tables: number;
  skipped: number;
}

/**
 * Create the sample floor plan.
 *
 * Upserts by table number, so re-running is safe. A table the owner has already
 * created with one of these numbers is LEFT ALONE rather than moved out from
 * under them - hence the skipped count.
 */
export async function seedTableData(conn: Connection): Promise<TableSeedResult> {
  const Table = TableModel(conn);
  const TableSection = TableSectionModel(conn);

  const result: TableSeedResult = { sections: 0, tables: 0, skipped: 0 };

  // ── Sections ─────────────────────────────────────────────────────────────
  const sectionIds = new Map<string, Types.ObjectId>();
  for (const s of SECTIONS) {
    const existing = await TableSection.findOne({ n: s.name });
    if (existing) {
      sectionIds.set(s.name, existing._id as Types.ObjectId);
      continue;
    }
    const created = await TableSection.create({
      n: s.name,
      cl: s.color,
      fl: s.floor,
      ia: 1,
    });
    sectionIds.set(s.name, created._id as Types.ObjectId);
    result.sections++;
  }

  // ── Tables ───────────────────────────────────────────────────────────────
  for (const t of TABLES) {
    // Never overwrite a table that already exists. On a POS in service, table
    // "5" is a real table with a real position someone chose.
    if (await Table.exists({ tn: t.number })) {
      result.skipped++;
      continue;
    }

    await Table.create({
      tn: t.number,
      si: sectionIds.get(t.section),
      sn: t.section,
      x: t.x,
      y: t.y,
      w: t.w,
      h: t.h,
      o: 0,
      sh: t.shape,
      c: t.capacity,
      s: AVAILABLE,
      rs: [],
      cl: SECTIONS.find((s) => s.name === t.section)?.color,
      ia: 1,
      so: t.sortOrder,
      lsc: new Date(),
    });
    result.tables++;
  }

  return result;
}

export interface TableRemoveResult {
  tables: number;
  sections: number;
  inUse: number;
}

/**
 * Remove the sample floor plan.
 *
 * A demo table with an ACTIVE SESSION is left in place. Deleting a table that
 * someone is mid-order on would orphan that order, and "remove the sample data"
 * is not a request to destroy live trade - if a real customer is sitting at
 * table 5, table 5 stays until they leave.
 *
 * Sections are only removed once no table references them, so a section the
 * owner has moved their own tables into survives.
 */
export async function removeTableData(conn: Connection): Promise<TableRemoveResult> {
  const Table = TableModel(conn);
  const TableSection = TableSectionModel(conn);

  const numbers = demoTableNumbers();

  const busy = await Table.countDocuments({
    tn: { $in: numbers },
    $or: [{ as: { $ne: null, $exists: true } }, { s: { $ne: AVAILABLE } }],
  });

  const removed = await Table.deleteMany({
    tn: { $in: numbers },
    as: null,
    s: AVAILABLE,
  });

  let sections = 0;
  for (const name of demoSectionNames()) {
    const section = await TableSection.findOne({ n: name });
    if (!section) continue;
    const stillUsed = await Table.countDocuments({ si: section._id });
    if (stillUsed === 0) {
      await TableSection.deleteOne({ _id: section._id });
      sections++;
    }
  }

  return { tables: removed.deletedCount ?? 0, sections, inUse: busy };
}
