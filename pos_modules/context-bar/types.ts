import { ReactNode } from 'react';
import { ActiveTab } from '@/stores/posStore';

export interface TabConfig {
  id: ActiveTab;
  label: string;
  icon: ReactNode;
}

export interface ActivityLogEntry {
  type: string;
  summary: string;
  ts: number;
}

export type SyncStatus = 'connecting' | 'connected' | 'polling' | 'disconnected';

export interface GlobalContextBarProps {
  // Slot content based on active tab
  floorPlanSlot?: ReactNode;
  ordersSlot?: ReactNode;
  orderEditorSlot?: ReactNode;
  orderListSlot?: ReactNode;
  takeawaySlot?: ReactNode;

  /** Tab IDs to hide from the navigation (driven by hub settings). */
  hiddenTabs?: ActiveTab[];

  // Global actions
  onNewOrder?: () => void;
  onRefresh?: () => void;

  // Print actions (for Order Editor / Takeaway tab)
  onPrintKOT?: () => void;
  onPrintInvoice?: () => void;

  // User info
  userName?: string;
  userRole?: string;

  // Realtime sync indicators
  syncStatus?: SyncStatus;
  activityLog?: ActivityLogEntry[];
}

export interface SlotProps {
  children: ReactNode;
  className?: string;
}

export interface StatBadgeProps {
  icon: ReactNode;
  value: string | number;
  label: string;
  color?: 'purple' | 'orange' | 'green' | 'blue' | 'red';
}

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDropdownProps {
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  label?: string;
}
