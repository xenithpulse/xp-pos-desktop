// Types for Integrity Check feature

export interface RuleResult {
  key: string;
  label: string;
  passed: boolean;
  actual: number;
  expected: number;
  details?: Record<string, any>;
}

export interface Transaction {
  amount: number;
  copyNumber?: string;
  uniqueNumber?: string;
  note?: string;
  category?: string;
  description?: string;
}

export interface DailyValidationResult {
  dailySheetId: string;
  date: string;
  rules: RuleResult[];
  slipEntries: Transaction[];
  entries: Transaction[];
  monthlySummary: any;
}

export interface RepairDiff {
  field: string;
  before: number | null;
  after: number | null;
}

export interface DailyRepairAudit {
  dailySheetId: string;
  date: string;
  diffs: RepairDiff[];
}

export interface RepairAudit {
  mode?: "daily" | "month";
  dryRun: boolean;
  monthLabel: string;
  dailyAudits: DailyRepairAudit[];
  totals?: RepairDiff[];
}

export type ValidationStatus = "IDLE" | "RUNNING" | "PASSED" | "FAILED" | "ERROR";

export interface IntegrityCheckState {
  status: ValidationStatus;
  progress: number;
  total: number;
  dailyResults: DailyValidationResult[];
  selectedDay: DailyValidationResult | null;
  audit: RepairAudit | null;
  repairing: boolean;
  error: string | null;
}
