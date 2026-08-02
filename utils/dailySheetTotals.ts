/**
 * Authoritative daily-sheet total recomputation.
 *
 * Every write path (atomic-push, entry edit/delete, bulk merge, close) recomputes
 * totals from the full slip/expense arrays through this one function so the
 * combined AND per-payment-method figures can never drift apart.
 *
 * Payment-method rule: cheques are folded into `cash` — the business treats a
 * deposited cheque as cash on hand for daily-sheet reconciliation (mirrors the
 * client's PerMethodTotals derivation).
 */

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

interface AmountAndMethod {
  amount?: number | null;
  paymentMethod?: string | null;
}

interface ComputeInput {
  slipEntries: AmountAndMethod[];
  entries: AmountAndMethod[];
  openingBalance: number;
  cashOpeningBalance: number;
  onlineOpeningBalance: number;
}

export interface DailyTotals {
  totalIncome: number;
  totalExpense: number;
  closingBalance: number;
  cashClosingBalance: number;
  onlineClosingBalance: number;
  incomeByMethod: { cash: number; online: number };
  expenseByMethod: { cash: number; online: number };
}

function bucketize(rows: AmountAndMethod[]): { cash: number; online: number; total: number } {
  const acc = { cash: 0, online: 0, total: 0 };
  for (const r of rows ?? []) {
    const amt = num(r?.amount);
    const pm = (r?.paymentMethod ?? 'cash').toString().toLowerCase();
    if (pm === 'online') acc.online += amt;
    else acc.cash += amt; // cash + cheque
    acc.total += amt;
  }
  return acc;
}

export function computeDailyTotals(input: ComputeInput): DailyTotals {
  const income = bucketize(input.slipEntries);
  const expense = bucketize(input.entries);

  const opening = num(input.openingBalance);
  const cashOpening = num(input.cashOpeningBalance);
  const onlineOpening = num(input.onlineOpeningBalance);

  return {
    totalIncome: income.total,
    totalExpense: expense.total,
    closingBalance: opening + income.total - expense.total,
    cashClosingBalance: cashOpening + income.cash - expense.cash,
    onlineClosingBalance: onlineOpening + income.online - expense.online,
    incomeByMethod: { cash: income.cash, online: income.online },
    expenseByMethod: { cash: expense.cash, online: expense.online },
  };
}
