// lib/floor-plan/alignmentGuides.ts
// Smart-snapping alignment guides — detects when a dragging table aligns
// with the center or edge of other tables and returns guide lines + snap positions.
// Also computes dynamic distance markers to nearest neighbors.

import { DistanceMarker } from '@/types/table.types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AlignmentGuide {
  /** 'h' = horizontal line, 'v' = vertical line */
  axis: 'h' | 'v';
  /** Position in canvas-space (px) */
  position: number;
  /** Length bounds for visual rendering */
  start: number;
  end: number;
}

export interface SnapResult {
  /** Snapped position */
  x: number;
  y: number;
  /** Active guides to render */
  guides: AlignmentGuide[];
  /** Distance markers to nearest neighbors */
  distanceMarkers: DistanceMarker[];
}

export interface TableRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

/** Pixel threshold within which a guide "catches" */
const SNAP_THRESHOLD = 6;
/** Max distance to show distance markers */
const DISTANCE_MARKER_MAX = 300;
/** Max number of distance markers to show at once */
const MAX_DISTANCE_MARKERS = 4;

// ─────────────────────────────────────────────────────────────────────────────
// Distance Markers — pixel-gap labels between dragged table & neighbors
// ─────────────────────────────────────────────────────────────────────────────

function computeDistanceMarkers(
  dragX: number,
  dragY: number,
  dragW: number,
  dragH: number,
  others: TableRect[],
): DistanceMarker[] {
  const markers: DistanceMarker[] = [];
  const dRight = dragX + dragW;
  const dBottom = dragY + dragH;
  const dCx = dragX + dragW / 2;
  const dCy = dragY + dragH / 2;

  for (const o of others) {
    const oRight = o.x + o.w;
    const oBottom = o.y + o.h;
    const oCy = o.y + o.h / 2;
    const oCx = o.x + o.w / 2;

    // Horizontal overlap check (for vertical distance)
    const hOverlap = dragX < oRight && dRight > o.x;
    // Vertical overlap check (for horizontal distance)
    const vOverlap = dragY < oBottom && dBottom > o.y;

    // Right gap: dragged table's right edge → other's left edge
    if (vOverlap && o.x > dRight && o.x - dRight < DISTANCE_MARKER_MAX) {
      const midY = Math.max(dragY, o.y) + (Math.min(dBottom, oBottom) - Math.max(dragY, o.y)) / 2;
      markers.push({ x1: dRight, y1: midY, x2: o.x, y2: midY, distance: Math.round(o.x - dRight), axis: 'h' });
    }

    // Left gap: other's right edge → dragged table's left edge
    if (vOverlap && oRight < dragX && dragX - oRight < DISTANCE_MARKER_MAX) {
      const midY = Math.max(dragY, o.y) + (Math.min(dBottom, oBottom) - Math.max(dragY, o.y)) / 2;
      markers.push({ x1: oRight, y1: midY, x2: dragX, y2: midY, distance: Math.round(dragX - oRight), axis: 'h' });
    }

    // Bottom gap: dragged table's bottom edge → other's top edge
    if (hOverlap && o.y > dBottom && o.y - dBottom < DISTANCE_MARKER_MAX) {
      const midX = Math.max(dragX, o.x) + (Math.min(dRight, oRight) - Math.max(dragX, o.x)) / 2;
      markers.push({ x1: midX, y1: dBottom, x2: midX, y2: o.y, distance: Math.round(o.y - dBottom), axis: 'v' });
    }

    // Top gap: other's bottom edge → dragged table's top edge
    if (hOverlap && oBottom < dragY && dragY - oBottom < DISTANCE_MARKER_MAX) {
      const midX = Math.max(dragX, o.x) + (Math.min(dRight, oRight) - Math.max(dragX, o.x)) / 2;
      markers.push({ x1: midX, y1: oBottom, x2: midX, y2: dragY, distance: Math.round(dragY - oBottom), axis: 'v' });
    }
  }

  // Sort by distance, keep closest markers
  markers.sort((a, b) => a.distance - b.distance);
  return markers.slice(0, MAX_DISTANCE_MARKERS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Distribution — equalize spacing between 3+ tables
// ─────────────────────────────────────────────────────────────────────────────

export function distributeHorizontally(
  tables: TableRect[],
): { id: string; x: number }[] {
  if (tables.length < 3) return [];
  const sorted = [...tables].sort((a, b) => a.x - b.x);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const totalWidth = sorted.reduce((s, t) => s + t.w, 0);
  const totalSpace = (last.x + last.w) - first.x - totalWidth;
  const gap = totalSpace / (sorted.length - 1);

  let currentX = first.x + first.w + gap;
  return sorted.slice(1, -1).map((t) => {
    const result = { id: t.id, x: Math.round(currentX) };
    currentX += t.w + gap;
    return result;
  });
}

export function distributeVertically(
  tables: TableRect[],
): { id: string; y: number }[] {
  if (tables.length < 3) return [];
  const sorted = [...tables].sort((a, b) => a.y - b.y);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const totalHeight = sorted.reduce((s, t) => s + t.h, 0);
  const totalSpace = (last.y + last.h) - first.y - totalHeight;
  const gap = totalSpace / (sorted.length - 1);

  let currentY = first.y + first.h + gap;
  return sorted.slice(1, -1).map((t) => {
    const result = { id: t.id, y: Math.round(currentY) };
    currentY += t.h + gap;
    return result;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tidy Up — snap a messy selection into the nearest perfect grid or line
// ─────────────────────────────────────────────────────────────────────────────

export function tidyUp(
  tables: TableRect[],
  gridSpacing = 20,
): { id: string; x: number; y: number }[] {
  if (tables.length === 0) return [];

  // Determine if tables form a roughly linear arrangement (line) or a grid
  const xs = tables.map((t) => t.x);
  const ys = tables.map((t) => t.y);
  const xRange = Math.max(...xs) - Math.min(...xs);
  const yRange = Math.max(...ys) - Math.min(...ys);

  // Average dimensions for spacing calculation
  const avgW = tables.reduce((s, t) => s + t.w, 0) / tables.length;
  const avgH = tables.reduce((s, t) => s + t.h, 0) / tables.length;
  const gapX = Math.max(gridSpacing, 20);
  const gapY = Math.max(gridSpacing, 20);

  // Determine grid cols: approximate square root for grid layout
  const n = tables.length;
  let cols: number;

  if (yRange < avgH * 0.8) {
    // Nearly horizontal line
    cols = n;
  } else if (xRange < avgW * 0.8) {
    // Nearly vertical line
    cols = 1;
  } else {
    // Grid: try to match aspect ratio of bounding box
    cols = Math.max(1, Math.round(Math.sqrt(n * (xRange / Math.max(yRange, 1)))));
  }

  // Sort tables: top-to-bottom, then left-to-right
  const sorted = [...tables].sort((a, b) => {
    const rowA = Math.round(a.y / (avgH + gapY));
    const rowB = Math.round(b.y / (avgH + gapY));
    if (rowA !== rowB) return rowA - rowB;
    return a.x - b.x;
  });

  // Origin = top-left of the bounding box
  const originX = Math.min(...xs);
  const originY = Math.min(...ys);

  return sorted.map((t, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      id: t.id,
      x: Math.round(originX + col * (avgW + gapX)),
      y: Math.round(originY + row * (avgH + gapY)),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Arrange in Row — single horizontal line, sorting left-to-right
// ─────────────────────────────────────────────────────────────────────────────

export function arrangeInRow(
  tables: TableRect[],
  spacing = 20,
): { id: string; x: number; y: number }[] {
  if (tables.length === 0) return [];

  const sorted = [...tables].sort((a, b) => a.x - b.x);
  // Anchor Y = average center Y of all selected tables
  const avgCenterY = sorted.reduce((s, t) => s + t.y + t.h / 2, 0) / sorted.length;
  let currentX = sorted[0].x;

  return sorted.map((t) => {
    const result = {
      id: t.id,
      x: Math.round(currentX),
      y: Math.round(avgCenterY - t.h / 2),
    };
    currentX += t.w + spacing;
    return result;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Arrange in Column — single vertical line, sorting top-to-bottom
// ─────────────────────────────────────────────────────────────────────────────

export function arrangeInColumn(
  tables: TableRect[],
  spacing = 20,
): { id: string; x: number; y: number }[] {
  if (tables.length === 0) return [];

  const sorted = [...tables].sort((a, b) => a.y - b.y);
  // Anchor X = average center X of all selected tables
  const avgCenterX = sorted.reduce((s, t) => s + t.x + t.w / 2, 0) / sorted.length;
  let currentY = sorted[0].y;

  return sorted.map((t) => {
    const result = {
      id: t.id,
      x: Math.round(avgCenterX - t.w / 2),
      y: Math.round(currentY),
    };
    currentY += t.h + spacing;
    return result;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Smart Organize — group tables by size, arrange groups in tidy rows
// ─────────────────────────────────────────────────────────────────────────────

export function smartOrganize(
  tables: TableRect[],
  spacing = 20,
): { id: string; x: number; y: number }[] {
  if (tables.length === 0) return [];

  // Group tables by size (width×height key)
  const groups = new Map<string, TableRect[]>();
  for (const t of tables) {
    const key = `${t.w}x${t.h}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  // Origin = top-left of bounding box
  const originX = Math.min(...tables.map((t) => t.x));
  const originY = Math.min(...tables.map((t) => t.y));

  const results: { id: string; x: number; y: number }[] = [];
  let currentY = originY;

  // For each size group, arrange in rows with optimal columns
  for (const [, group] of groups) {
    const w = group[0].w;
    const h = group[0].h;
    const maxCols = Math.max(1, Math.ceil(Math.sqrt(group.length)));

    // Sort by original x position
    group.sort((a, b) => a.x - b.x);

    group.forEach((t, i) => {
      const col = i % maxCols;
      const row = Math.floor(i / maxCols);
      results.push({
        id: t.id,
        x: Math.round(originX + col * (w + spacing)),
        y: Math.round(currentY + row * (h + spacing)),
      });
    });

    const rowCount = Math.ceil(group.length / maxCols);
    currentY += rowCount * (h + spacing) + spacing; // extra gap between groups
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Alignment Algorithm
// ─────────────────────────────────────────────────────────────────────────────

export function computeAlignmentGuides(
  /** The table being dragged (proposed position) */
  dragId: string,
  dragX: number,
  dragY: number,
  dragW: number,
  dragH: number,
  /** All other tables on the canvas */
  others: TableRect[],
): SnapResult {
  const guides: AlignmentGuide[] = [];
  let snapX = dragX;
  let snapY = dragY;

  // Edges & center of dragging table
  const dCx = dragX + dragW / 2;
  const dCy = dragY + dragH / 2;
  const dRight = dragX + dragW;
  const dBottom = dragY + dragH;

  let bestDx = Infinity;
  let bestDy = Infinity;

  for (const o of others) {
    if (o.id === dragId) continue;

    const oCx = o.x + o.w / 2;
    const oCy = o.y + o.h / 2;
    const oRight = o.x + o.w;
    const oBottom = o.y + o.h;

    // ── Vertical guides (snap X) ──

    // Left ↔ Left
    const llDiff = Math.abs(dragX - o.x);
    if (llDiff < SNAP_THRESHOLD && llDiff < bestDx) {
      bestDx = llDiff;
      snapX = o.x;
    }

    // Right ↔ Right
    const rrDiff = Math.abs(dRight - oRight);
    if (rrDiff < SNAP_THRESHOLD && rrDiff < bestDx) {
      bestDx = rrDiff;
      snapX = oRight - dragW;
    }

    // Center ↔ Center (vertical mid-line)
    const ccxDiff = Math.abs(dCx - oCx);
    if (ccxDiff < SNAP_THRESHOLD && ccxDiff < bestDx) {
      bestDx = ccxDiff;
      snapX = oCx - dragW / 2;
    }

    // Left ↔ Right
    const lrDiff = Math.abs(dragX - oRight);
    if (lrDiff < SNAP_THRESHOLD && lrDiff < bestDx) {
      bestDx = lrDiff;
      snapX = oRight;
    }

    // Right ↔ Left
    const rlDiff = Math.abs(dRight - o.x);
    if (rlDiff < SNAP_THRESHOLD && rlDiff < bestDx) {
      bestDx = rlDiff;
      snapX = o.x - dragW;
    }

    // ── Horizontal guides (snap Y) ──

    // Top ↔ Top
    const ttDiff = Math.abs(dragY - o.y);
    if (ttDiff < SNAP_THRESHOLD && ttDiff < bestDy) {
      bestDy = ttDiff;
      snapY = o.y;
    }

    // Bottom ↔ Bottom
    const bbDiff = Math.abs(dBottom - oBottom);
    if (bbDiff < SNAP_THRESHOLD && bbDiff < bestDy) {
      bestDy = bbDiff;
      snapY = oBottom - dragH;
    }

    // Center ↔ Center (horizontal mid-line)
    const ccyDiff = Math.abs(dCy - oCy);
    if (ccyDiff < SNAP_THRESHOLD && ccyDiff < bestDy) {
      bestDy = ccyDiff;
      snapY = oCy - dragH / 2;
    }

    // Top ↔ Bottom
    const tbDiff = Math.abs(dragY - oBottom);
    if (tbDiff < SNAP_THRESHOLD && tbDiff < bestDy) {
      bestDy = tbDiff;
      snapY = oBottom;
    }

    // Bottom ↔ Top
    const btDiff = Math.abs(dBottom - o.y);
    if (btDiff < SNAP_THRESHOLD && btDiff < bestDy) {
      bestDy = btDiff;
      snapY = o.y - dragH;
    }
  }

  // Build guide lines for snap results
  if (bestDx < SNAP_THRESHOLD) {
    for (const o of others) {
      if (o.id === dragId) continue;
      const oCx = o.x + o.w / 2;
      const checks = [
        { val: snapX, oVal: o.x },
        { val: snapX, oVal: o.x + o.w },
        { val: snapX + dragW, oVal: o.x },
        { val: snapX + dragW, oVal: o.x + o.w },
        { val: snapX + dragW / 2, oVal: oCx },
      ];
      for (const c of checks) {
        if (Math.abs(c.val - c.oVal) < 1) {
          const minY = Math.min(snapY, o.y) - 20;
          const maxY = Math.max(snapY + dragH, o.y + o.h) + 20;
          guides.push({ axis: 'v', position: c.val, start: minY, end: maxY });
          break;
        }
      }
    }
  }

  if (bestDy < SNAP_THRESHOLD) {
    for (const o of others) {
      if (o.id === dragId) continue;
      const oCy = o.y + o.h / 2;
      const checks = [
        { val: snapY, oVal: o.y },
        { val: snapY, oVal: o.y + o.h },
        { val: snapY + dragH, oVal: o.y },
        { val: snapY + dragH, oVal: o.y + o.h },
        { val: snapY + dragH / 2, oVal: oCy },
      ];
      for (const c of checks) {
        if (Math.abs(c.val - c.oVal) < 1) {
          const minX = Math.min(snapX, o.x) - 20;
          const maxX = Math.max(snapX + dragW, o.x + o.w) + 20;
          guides.push({ axis: 'h', position: c.val, start: minX, end: maxX });
          break;
        }
      }
    }
  }

  // Compute distance markers using snapped position
  const filteredOthers = others.filter((o) => o.id !== dragId);
  const distanceMarkers = computeDistanceMarkers(snapX, snapY, dragW, dragH, filteredOthers);

  return { x: snapX, y: snapY, guides, distanceMarkers };
}
