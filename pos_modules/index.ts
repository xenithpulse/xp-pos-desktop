// pos_modules/index.ts
// Root barrel — re-exports all pos_modules sub-modules

// Context Bar
export { GlobalContextBar, ContextBarSlot, StatBadge, SearchInput, FilterDropdown } from './context-bar';
export type { GlobalContextBarProps, TabConfig, SlotProps, StatBadgeProps, SearchInputProps, FilterOption, FilterDropdownProps } from './context-bar';

// Floor Plan
export { FloorPlanCanvas, TableVisual, TableSessionPanel, PlaygroundSidebar, ZoneTabBar, GlobalInspector, MiniMap, SelectionHUD, TableEditPopover, ResponsiveCanvasWrapper, useDeviceClass, MobileTableGrid } from './floor-plan';

// Orders
export { OrderEditor, OrderDetailsPanel, OrderCard, OrderManagerList, OrderManagerGrid, OrderList } from './orders';

// Shared
export { default as Loader } from './shared/Loader';
