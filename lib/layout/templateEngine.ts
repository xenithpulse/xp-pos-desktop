// lib/layout/templateEngine.ts
// Procedural layout generation engine for the Layout Playground

import {
  LayoutTemplateParams,
  LayoutPattern,
  DraftTable,
  TableShape,
  TableStatus,
} from '@/types/table.types';

// ─────────────────────────────────────────────────────────────────────────────
// UUID Generator (lightweight, no external dep)
// ─────────────────────────────────────────────────────────────────────────────

export function uuid(): string {
  return 'draft_' + Math.random().toString(36).substr(2, 9);
}

// ─────────────────────────────────────────────────────────────────────────────
// Default template parameters
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_TEMPLATE: LayoutTemplateParams = {
  pattern: 'grid',
  rows: 3,
  cols: 4,
  spacing: 40,
  startX: 100,
  startY: 100,
  shape: 'square',
  tableWidth: 100,
  tableHeight: 100,
  capacity: 4,
  prefix: 'T',
};

// ─────────────────────────────────────────────────────────────────────────────
// Core: Generate tables from a template
// ─────────────────────────────────────────────────────────────────────────────

export function generateFromTemplate(
  params: LayoutTemplateParams,
  existingCount: number = 0,
): DraftTable[] {
  switch (params.pattern) {
    case 'grid':
      return generateGrid(params, existingCount);
    case 'diagonal':
      return generateDiagonal(params, existingCount);
    case 'circle':
      return generateCircle(params, existingCount);
    case 'banquet':
      return generateBanquet(params, existingCount);
    case 'u-shape':
      return generateUShape(params, existingCount);
    case 'boardroom':
      return generateBoardroom(params, existingCount);
    case 'booth-row':
      return generateBoothRow(params, existingCount);
    case 'serpentine':
      return generateSerpentine(params, existingCount);
    case 'checkerboard':
      return generateCheckerboard(params, existingCount);
    default:
      return generateGrid(params, existingCount);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern: Grid
// ─────────────────────────────────────────────────────────────────────────────

function generateGrid(
  params: LayoutTemplateParams,
  existingCount: number,
): DraftTable[] {
  const tables: DraftTable[] = [];
  let idx = existingCount;

  for (let row = 0; row < params.rows; row++) {
    for (let col = 0; col < params.cols; col++) {
      idx++;
      tables.push(
        makeDraft({
          tableNumber: `${params.prefix}${idx}`,
          x: params.startX + col * (params.tableWidth + params.spacing),
          y: params.startY + row * (params.tableHeight + params.spacing),
          params,
        }),
      );
    }
  }

  return tables;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern: Diagonal (staggered rows)
// ─────────────────────────────────────────────────────────────────────────────

function generateDiagonal(
  params: LayoutTemplateParams,
  existingCount: number,
): DraftTable[] {
  const tables: DraftTable[] = [];
  let idx = existingCount;

  for (let row = 0; row < params.rows; row++) {
    const offset = row % 2 === 1 ? (params.tableWidth + params.spacing) / 2 : 0;
    for (let col = 0; col < params.cols; col++) {
      idx++;
      tables.push(
        makeDraft({
          tableNumber: `${params.prefix}${idx}`,
          x: params.startX + col * (params.tableWidth + params.spacing) + offset,
          y: params.startY + row * (params.tableHeight + params.spacing),
          params,
        }),
      );
    }
  }

  return tables;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern: Circle (tables arranged in an ellipse)
// ─────────────────────────────────────────────────────────────────────────────

function generateCircle(
  params: LayoutTemplateParams,
  existingCount: number,
): DraftTable[] {
  const tables: DraftTable[] = [];
  const count = params.rows * params.cols;
  const radiusX = (params.cols * (params.tableWidth + params.spacing)) / (2 * Math.PI) + params.tableWidth;
  const radiusY = (params.rows * (params.tableHeight + params.spacing)) / (2 * Math.PI) + params.tableHeight;
  const centerX = params.startX + radiusX;
  const centerY = params.startY + radiusY;

  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    const x = centerX + radiusX * Math.cos(angle) - params.tableWidth / 2;
    const y = centerY + radiusY * Math.sin(angle) - params.tableHeight / 2;
    const idx = existingCount + i + 1;

    tables.push(
      makeDraft({
        tableNumber: `${params.prefix}${idx}`,
        x: Math.round(x),
        y: Math.round(y),
        params,
        orientation: Math.round((angle * 180) / Math.PI + 90) % 360,
      }),
    );
  }

  return tables;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern: Banquet (long rectangular rows)
// ─────────────────────────────────────────────────────────────────────────────

function generateBanquet(
  params: LayoutTemplateParams,
  existingCount: number,
): DraftTable[] {
  const tables: DraftTable[] = [];
  let idx = existingCount;

  // Banquet creates `rows` long tables spanning `cols` width
  const banquetWidth = params.cols * (params.tableWidth + params.spacing) - params.spacing;
  const banquetHeight = params.tableHeight;

  for (let row = 0; row < params.rows; row++) {
    idx++;
    tables.push(
      makeDraft({
        tableNumber: `${params.prefix}${idx}`,
        x: params.startX,
        y: params.startY + row * (banquetHeight + params.spacing * 2),
        params: {
          ...params,
          tableWidth: banquetWidth,
          tableHeight: banquetHeight,
          shape: 'rectangle',
          capacity: params.capacity * params.cols,
        },
      }),
    );
  }

  return tables;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern: U-Shape — tables along 3 sides of a rectangle (open at top)
// ─────────────────────────────────────────────────────────────────────────────

function generateUShape(
  params: LayoutTemplateParams,
  existingCount: number,
): DraftTable[] {
  const tables: DraftTable[] = [];
  let idx = existingCount;
  const tw = params.tableWidth + params.spacing;
  const th = params.tableHeight + params.spacing;

  // Bottom row (full width)
  for (let col = 0; col < params.cols; col++) {
    idx++;
    tables.push(
      makeDraft({
        tableNumber: `${params.prefix}${idx}`,
        x: params.startX + col * tw,
        y: params.startY + (params.rows - 1) * th,
        params,
      }),
    );
  }

  // Left column (excluding bottom corner already placed)
  for (let row = 0; row < params.rows - 1; row++) {
    idx++;
    tables.push(
      makeDraft({
        tableNumber: `${params.prefix}${idx}`,
        x: params.startX,
        y: params.startY + row * th,
        params,
      }),
    );
  }

  // Right column (excluding bottom corner already placed)
  for (let row = 0; row < params.rows - 1; row++) {
    idx++;
    tables.push(
      makeDraft({
        tableNumber: `${params.prefix}${idx}`,
        x: params.startX + (params.cols - 1) * tw,
        y: params.startY + row * th,
        params,
      }),
    );
  }

  return tables;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern: Boardroom — tables around all 4 sides of a large rectangle
// ─────────────────────────────────────────────────────────────────────────────

function generateBoardroom(
  params: LayoutTemplateParams,
  existingCount: number,
): DraftTable[] {
  const tables: DraftTable[] = [];
  let idx = existingCount;
  const tw = params.tableWidth + params.spacing;
  const th = params.tableHeight + params.spacing;

  // Top row
  for (let col = 0; col < params.cols; col++) {
    idx++;
    tables.push(
      makeDraft({
        tableNumber: `${params.prefix}${idx}`,
        x: params.startX + col * tw,
        y: params.startY,
        params,
      }),
    );
  }

  // Bottom row
  for (let col = 0; col < params.cols; col++) {
    idx++;
    tables.push(
      makeDraft({
        tableNumber: `${params.prefix}${idx}`,
        x: params.startX + col * tw,
        y: params.startY + (params.rows - 1) * th,
        params,
      }),
    );
  }

  // Left column (excluding corners)
  for (let row = 1; row < params.rows - 1; row++) {
    idx++;
    tables.push(
      makeDraft({
        tableNumber: `${params.prefix}${idx}`,
        x: params.startX,
        y: params.startY + row * th,
        params,
      }),
    );
  }

  // Right column (excluding corners)
  for (let row = 1; row < params.rows - 1; row++) {
    idx++;
    tables.push(
      makeDraft({
        tableNumber: `${params.prefix}${idx}`,
        x: params.startX + (params.cols - 1) * tw,
        y: params.startY + row * th,
        params,
      }),
    );
  }

  return tables;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern: Booth Row — wall-side booths with fixed backing, tight spacing
// ─────────────────────────────────────────────────────────────────────────────

function generateBoothRow(
  params: LayoutTemplateParams,
  existingCount: number,
): DraftTable[] {
  const tables: DraftTable[] = [];
  let idx = existingCount;

  // `rows` = number of booth rows, `cols` = booths per row
  const boothWidth = params.tableWidth;
  const boothHeight = params.tableHeight;
  const boothSpacingX = params.spacing * 0.6; // Tighter horizontal spacing
  const rowSpacing = params.spacing * 3; // Wide aisle between facing rows

  for (let row = 0; row < params.rows; row++) {
    const yBase = params.startY + row * (boothHeight * 2 + rowSpacing);

    for (let col = 0; col < params.cols; col++) {
      const xPos = params.startX + col * (boothWidth + boothSpacingX);

      // Top-side booth (facing down)
      idx++;
      tables.push(
        makeDraft({
          tableNumber: `${params.prefix}${idx}`,
          x: xPos,
          y: yBase,
          params: {
            ...params,
            tableWidth: boothWidth,
            tableHeight: boothHeight,
            shape: 'rectangle',
          },
          orientation: 0,
        }),
      );

      // Bottom-side booth (facing up) — mirrors across the aisle
      idx++;
      tables.push(
        makeDraft({
          tableNumber: `${params.prefix}${idx}`,
          x: xPos,
          y: yBase + boothHeight + rowSpacing,
          params: {
            ...params,
            tableWidth: boothWidth,
            tableHeight: boothHeight,
            shape: 'rectangle',
          },
          orientation: 0,
        }),
      );
    }
  }

  return tables;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern: Serpentine — curved / organic S-shape arrangement
// ─────────────────────────────────────────────────────────────────────────────

function generateSerpentine(
  params: LayoutTemplateParams,
  existingCount: number,
): DraftTable[] {
  const tables: DraftTable[] = [];
  const count = params.rows * params.cols;
  const amplitude = (params.cols * (params.tableWidth + params.spacing)) / 4;
  const wavelength = (params.rows * (params.tableHeight + params.spacing));
  const stepY = wavelength / count;

  for (let i = 0; i < count; i++) {
    const t = i / count;
    const y = params.startY + i * stepY;
    const x =
      params.startX +
      amplitude +
      amplitude * Math.sin(t * Math.PI * 2 * Math.max(1, Math.floor(params.rows / 2)));

    const idx = existingCount + i + 1;
    const angle = Math.round(
      Math.atan2(
        amplitude *
          Math.cos(t * Math.PI * 2 * Math.max(1, Math.floor(params.rows / 2))) *
          Math.PI *
          2 *
          Math.max(1, Math.floor(params.rows / 2)),
        wavelength / count,
      ) *
        (180 / Math.PI),
    );

    tables.push(
      makeDraft({
        tableNumber: `${params.prefix}${idx}`,
        x: Math.round(x),
        y: Math.round(y),
        params: { ...params, shape: params.shape || 'round' },
        orientation: angle % 360,
      }),
    );
  }

  return tables;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern: Checkerboard / Staggered — optimised for distance & flow
// ─────────────────────────────────────────────────────────────────────────────

function generateCheckerboard(
  params: LayoutTemplateParams,
  existingCount: number,
): DraftTable[] {
  const tables: DraftTable[] = [];
  let idx = existingCount;

  for (let row = 0; row < params.rows; row++) {
    for (let col = 0; col < params.cols; col++) {
      // Skip every other cell in a checkerboard pattern
      if ((row + col) % 2 !== 0) continue;

      idx++;
      tables.push(
        makeDraft({
          tableNumber: `${params.prefix}${idx}`,
          x: params.startX + col * (params.tableWidth + params.spacing),
          y: params.startY + row * (params.tableHeight + params.spacing),
          params,
        }),
      );
    }
  }

  return tables;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: create a DraftTable
// ─────────────────────────────────────────────────────────────────────────────

interface MakeDraftOpts {
  tableNumber: string;
  x: number;
  y: number;
  params: LayoutTemplateParams;
  orientation?: number;
}

function makeDraft({ tableNumber, x, y, params, orientation = 0 }: MakeDraftOpts): DraftTable {
  return {
    _draftId: uuid(),
    _isNew: true,
    tableNumber,
    sectionId: params.sectionId,
    sectionName: params.sectionName,
    x_position: Math.round(x * 100) / 100,
    y_position: Math.round(y * 100) / 100,
    width: params.tableWidth,
    height: params.tableHeight,
    orientation,
    shape: params.shape,
    capacity: params.capacity,
    minCovers: 1,
    status: 'available' as TableStatus,
    isActive: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Create a single draft table (for drag-from-palette)
// ─────────────────────────────────────────────────────────────────────────────

export function createSingleDraft(overrides: {
  x: number;
  y: number;
  shape?: TableShape;
  capacity?: number;
  width?: number;
  height?: number;
  prefix?: string;
  index?: number;
  sectionId?: string;
  sectionName?: string;
}): DraftTable {
  const shape = overrides.shape ?? 'square';
  const w = overrides.width ?? (shape === 'rectangle' ? 140 : 100);
  const h = overrides.height ?? 100;

  return {
    _draftId: uuid(),
    _isNew: true,
    tableNumber: `${overrides.prefix ?? 'T'}${overrides.index ?? 1}`,
    sectionId: overrides.sectionId,
    sectionName: overrides.sectionName,
    x_position: overrides.x,
    y_position: overrides.y,
    width: w,
    height: h,
    orientation: 0,
    shape,
    capacity: overrides.capacity ?? 4,
    minCovers: 1,
    status: 'available' as TableStatus,
    isActive: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Convert DraftTable → BulkUpsertItem
// ─────────────────────────────────────────────────────────────────────────────

export function draftsToBulkUpsert(drafts: DraftTable[]) {
  return drafts.map((d) => ({
    tableNumber: d.tableNumber,
    sectionId: d.sectionId,
    sectionName: d.sectionName,
    x_position: d.x_position,
    y_position: d.y_position,
    width: d.width,
    height: d.height,
    orientation: d.orientation,
    shape: d.shape,
    capacity: d.capacity,
    minCovers: d.minCovers,
    color: d.color,
    isActive: d.isActive,
  }));
}
