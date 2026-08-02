// pos_modules/floor-plan/index.ts
// Barrel export for floor plan components

export { default as TableVisual } from './TableVisual';
export { default as FloorPlanCanvas } from './FloorPlanCanvas';
export { default as TableSessionPanel } from './TableSessionPanel';
export { default as ReservationControls, WalkInSeatingBlock } from './ReservationControls';
export type { ReservationHandlers, ReservationInputPayload } from './ReservationControls';
export { default as PlaygroundSidebar } from './PlaygroundSidebar';
export { default as ZoneTabBar } from './ZoneTabBar';
export { default as GlobalInspector } from './GlobalInspector';
export { default as MiniMap } from './MiniMap';
export { default as SelectionHUD } from './SelectionHUD';
export { default as TableEditPopover } from './TableEditPopover';
export { default as ResponsiveCanvasWrapper, useDeviceClass } from './ResponsiveCanvasWrapper';
export { default as MobileTableGrid } from './MobileTableGrid';
