export type CashSlip = {
  _id?: string;
  copyNumber: string;
  uniqueNumber: string;
  amount: number;
  description?: string;
  used?: boolean;
  usedBy?: string;
  usedAt?: string | Date | null;
  signedByCEO?: boolean;
  paymentMethod?: string;
  createdAt?: string | Date;
  createdBy?: string;
};

export type Voucher = {
  _id?: string;
  copyNumber: string;
  uniqueNumber: string;
  amount: number;
  description?: string;
  expenseEntry?: string | null; // DailySheet._id
  postedAt?: string | Date;
  postedBy?: string;
};

export type Entry = { category?: string; description?: string; amount?: number };

export type SlipEntry = { copyNumber?: string; uniqueNumber?: string; amount?: number; description?: string };

export type DailySheet = {
  _id?: string;
  date: string | Date;
  slipEntries?: SlipEntry[];
  totalIncome: number;
  totalExpense: number;
  closingBalance: number;
  openingBalance: number;
  notes?: string;
  entries?: Entry[];
  voucherRef?: string | null; // Voucher._id
  isPosted?: boolean;
};

export type DailySummary = {
  dailySheetId: string;
  date?: string | Date;
  totalIncome: number;
  totalExpense: number;
  closingBalance: number;
};

export type MonthlySheet = {
  _id?: string;
  monthLabel: string;
  startDate: string | Date;
  endDate: string | Date;
  openingBalance: number;
  closingBalance: number;
  totalIncome: number;
  totalExpense: number;
  isClosed?: boolean;
  dailySummaries?: DailySummary[];
  notes?: string;
};

export type Anomaly = {
  id: string; // unique anomaly id
  severity: "critical" | "major" | "minor" | "info";
  title: string;
  message: string;
  meta?: Record<string, unknown>;
};

export type IOverview = {    
    totalCashCount: number;
    totalCashSum: number;
    usedCashCount: number;
    unusedCashCount: number;
    cashByPaymentMethod: Record<string, {
        count: number;
        sum: number;
    }>;
    totalVoucherCount: number;
    totalVoucherSum: number;
    vouchersLinkedCount: number;
    vouchersUnlinkedCount: number;
    totalDailyCount: number;
    totalDailyIncome: number;
    totalDailyExpense: number;
    totalSlipEntriesCount: number;
    totalExpenseEntriesCount: number;
    totalMonthlyCount: number;
};



export const keyFromSlip = (s?: { copyNumber?: string; uniqueNumber?: string }) =>
  s && s.copyNumber && s.uniqueNumber ? `${s.copyNumber.trim()}|${s.uniqueNumber.trim()}` : null;

export const safeNum = (n: unknown) => (typeof n === "number" ? n : Number(n || 0));

export async function fetchJson(endpoint: string) {
  try {
    const res = await fetch(endpoint, { cache: "no-store" });
    if (!res.ok) throw new Error(`${endpoint} returned ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data)) return { success: true, data };
    if (data && typeof data === "object" && ("success" in data || "data" in data)) return data;
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err || String(err) };
  }
}

export function mk(id: string, severity: Anomaly["severity"], title: string, message: string,   meta?: Record<string, unknown>): Anomaly {
  return { id, severity, title, message, meta };
}



function toDayLabel(d?: string | Date | null) {
  if (!d) return "(no-date)";
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    // YYYY-MM-DD
    return dt.toISOString().split("T")[0];
  } catch {
    return String(d);
  }
}

function slipKeyLabel(s?: { copyNumber?: string; uniqueNumber?: string }) {
  if (!s) return "(no-slip)";
  if (!s.copyNumber || !s.uniqueNumber) return JSON.stringify(s);
  return `${s.copyNumber.trim()}-${s.uniqueNumber.trim()}`;
}

export async function runIntegrityChecks({
  cashSlips,
  vouchers,
  dailySheets,
  monthlySheets,
}: {
  cashSlips: CashSlip[];
  vouchers: Voucher[];
  dailySheets: DailySheet[];
  monthlySheets: MonthlySheet[];
}): Promise<{
  anomalies: Anomaly[];
  stats: {
    totalCashSum: number;
    totalVoucherSum: number;
    totalDailyIncome: number;
    totalDailyExpense: number;
  };
}> {
  const anomalies: Anomaly[] = [];

  const cashSlipMap = new Map<string, CashSlip[]>();
  for (const cs of cashSlips) {
    const k = `${cs.copyNumber}|${cs.uniqueNumber}`;
    const arr = cashSlipMap.get(k) || [];
    arr.push(cs);
    cashSlipMap.set(k, arr);
  }

  const voucherMapById = new Map<string, Voucher>();
  for (const v of vouchers) if (v._id) voucherMapById.set(v._id, v);

  const voucherMapByExpenseEntry = new Map<string, Voucher[]>();
  for (const v of vouchers) if (v.expenseEntry) {
    const arr = voucherMapByExpenseEntry.get(v.expenseEntry) || [];
    arr.push(v);
    voucherMapByExpenseEntry.set(v.expenseEntry, arr);
  }

  const dailyById = new Map<string, DailySheet>();
  for (const d of dailySheets) if (d._id) dailyById.set(d._id, d);

  // 1) DAILY SHEET CONSISTENCY
  for (const d of dailySheets) {
    const dayLabel = toDayLabel(d.date);
    const id = d._id || `daily:${dayLabel}`;

    // slip sum vs totalIncome
    const slipSum = (d.slipEntries || []).reduce((s, x) => s + safeNum(x.amount), 0);
    if (Math.abs(slipSum - safeNum(d.totalIncome)) > 0.01) {
      anomalies.push(
        mk(
          `${dayLabel}:slip-sum-mismatch`,
          "critical",
          "Daily totalIncome mismatch",
          `Daily sheet ${dayLabel}: slipEntries sum ${slipSum} !== totalIncome ${d.totalIncome}`,
          { dailyLabel: dayLabel, slipSum, totalIncome: d.totalIncome }
        )
      );
    }

    // entries sum vs totalExpense
    const entriesSum = (d.entries || []).reduce((s, x) => s + safeNum(x.amount), 0);
    if (Math.abs(entriesSum - safeNum(d.totalExpense)) > 0.01) {
      anomalies.push(
        mk(
          `${dayLabel}:entries-sum-mismatch`,
          "critical",
          "Daily totalExpense mismatch",
          `Daily sheet ${dayLabel}: entries sum ${entriesSum} !== totalExpense ${d.totalExpense}`,
          { dailyLabel: dayLabel, entriesSum, totalExpense: d.totalExpense }
        )
      );
    }

    // closing balance expected (only check if at least one of income/expense exists)
    const totalIncome = safeNum(d.totalIncome);
    const totalExpense = safeNum(d.totalExpense);
    const openingBalance = safeNum(d.openingBalance);
    const closingBalance = safeNum(d.closingBalance);

    const expectedClosing = openingBalance + totalIncome - totalExpense;

    // Only check when we have a non-null closing balance recorded
    if (d.closingBalance != null && Math.abs(expectedClosing - closingBalance) > 0.01) {
    anomalies.push(
        mk(
        `${dayLabel}:closing-balance`,
        "major",
        "Daily closingBalance mismatch",
        `Daily sheet ${dayLabel}: expected closing ${expectedClosing} !== closingBalance ${d.closingBalance}`,
        { dailyLabel: dayLabel, expectedClosing, closingBalance: d.closingBalance }
        )
    );
    }

    // each slipEntry must map to a cashSlip
    for (const slip of d.slipEntries || []) {
      const k = keyFromSlip(slip);
      const keyLabel = slipKeyLabel(slip);
      if (!k) {
        anomalies.push(
          mk(
            `${dayLabel}:slip:invalid`,
            "major",
            "Invalid slip identifier",
            `Daily ${dayLabel} has slip with missing copyNumber or uniqueNumber.`,
            { slip, dailyLabel: dayLabel }
          )
        );
        continue;
      }
      const matches = cashSlipMap.get(k) || [];
      if (matches.length === 0) {
        anomalies.push(
          mk(
            `${dayLabel}:slip-not-found:${keyLabel}`,
            "critical",
            "CashSlip missing",
            `Slip ${keyLabel} referenced in daily ${dayLabel} not found in CashSlips collection`,
            { dailyLabel: dayLabel, slipKey: keyLabel }
          )
        );
      } else if (matches.length > 1) {
        anomalies.push(
          mk(
            `${dayLabel}:slip-ambiguous:${keyLabel}`,
            "major",
            "Ambiguous CashSlip matches",
            `Slip ${keyLabel} referenced in daily ${dayLabel} matches ${matches.length} CashSlips (expect 1)`,
            { dailyLabel: dayLabel, slipKey: keyLabel, matchesCount: matches.length }
          )
        );
      } else {
        // single match — check amount consistency
        const cs = matches[0];
        if (Math.abs(safeNum(cs.amount) - safeNum(slip.amount)) > 0.01) {
          anomalies.push(
            mk(
              `${dayLabel}:slip-amount-mismatch:${keyLabel}`,
              "major",
              "Slip amount mismatch with CashSlip",
              `Slip ${keyLabel} in daily ${dayLabel} amount ${slip.amount} !== CashSlip amount ${cs.amount}`,
              { slip, cashSlip: cs, dailyLabel: dayLabel }
            )
          );
        }
      }
    }

    // voucherRef checks (if present)
    if (d.voucherRef) {
      const v = voucherMapById.get(d.voucherRef);
      if (!v) {
        anomalies.push(
          mk(
            `${dayLabel}:voucher-notfound`,
            "critical",
            "Voucher referenced in DailySheet not found",
            `Daily ${dayLabel} references voucher ${d.voucherRef} but voucher doc does not exist`,
            { dailyLabel: dayLabel, voucherRef: d.voucherRef }
          )
        );
      } else {
        // voucher amount should match totalExpense of this daily sheet
        if (Math.abs(safeNum(v.amount) - safeNum(d.totalExpense)) > 0.01) {
          anomalies.push(
            mk(
              `${dayLabel}:voucher-amount-mismatch`,
              "major",
              "Voucher amount mismatch",
              `Voucher ${v._id} amount ${v.amount} !== daily totalExpense ${d.totalExpense}`,
              { voucher: v, dailyLabel: dayLabel }
            )
          );
        }

        // voucher.expenseEntry should point back to this daily sheet
        if (v.expenseEntry && d._id && v.expenseEntry !== d._id) {
          anomalies.push(
            mk(
              `${dayLabel}:voucher-ref-mismatch`,
              "major",
              "Voucher.expenseEntry mismatch",
              `Voucher ${v._id} expenseEntry ${v.expenseEntry} !== daily ${d._id}`,
              { voucher: v, dailyLabel: dayLabel }
            )
          );
        }
      }
    }
  }

  // 2) VOUCHERS -> ensure they map to daily sheets when they claim expenseEntry
  for (const v of vouchers) {
    if (v.expenseEntry) {
      const ds = dailyById.get(v.expenseEntry);
      // *** NOTE: intentionally DO NOT flag vouchers that reference missing daily sheets as an anomaly.
      if (!ds) continue;

      // amount parity
      if (Math.abs(safeNum(v.amount) - safeNum(ds.totalExpense)) > 0.01) {
        const dayLabel = toDayLabel(ds.date);
        anomalies.push(
          mk(
            `voucher:${v._id}:amount-mismatch`,
            "major",
            "Voucher amount != referenced DailySheet totalExpense",
            `Voucher ${v._id} amount ${v.amount} != Daily ${dayLabel} totalExpense ${ds.totalExpense}`,
            { voucher: v, dailyLabel: dayLabel }
          )
        );
      }
    }
  }

  // 3) CASH SLIP usage: check used flag vs slipEntries references
  // Build a set of slip keys used in daily sheets (use day labels)
  const usedSlipKeys = new Map<string, { dayLabels: string[]; amounts: number[] }>();
  for (const d of dailySheets) {
    const dayLabel = toDayLabel(d.date);
    for (const s of d.slipEntries || []) {
      const k = keyFromSlip(s);
      if (!k) continue;
      const cur = usedSlipKeys.get(k) || { dayLabels: [], amounts: [] };
      cur.dayLabels.push(dayLabel);
      cur.amounts.push(s.amount || 0);
      usedSlipKeys.set(k, cur);
    }
  }

  for (const cs of cashSlips) {
    const k = `${cs.copyNumber}|${cs.uniqueNumber}`;
    const usage = usedSlipKeys.get(k);
    const keyLabel = `${cs.copyNumber}-${cs.uniqueNumber}`;

    if (!cs.used && usage) {
      anomalies.push(
        mk(
          `cash:${keyLabel}:referenced-not-marked-used`,
          "minor",
          "CashSlip referenced but not marked used",
          `CashSlip ${keyLabel} is referenced in DailySheet(s) ${usage.dayLabels.join(",")}, but used=false`,
          { cashSlip: cs, usage }
        )
      );
    }

    if (usage && usage.dayLabels.length > 1) {
      anomalies.push(
        mk(
          `cash:${keyLabel}:referenced-multiple-times`,
          "major",
          "CashSlip referenced multiple times",
          `CashSlip ${keyLabel} referenced in multiple DailySheets: ${usage.dayLabels.join(
            ","
          )}. Ensure this is intended (partial uses are unsupported).`,
          { cashSlip: cs, usage }
        )
      );
    }

    // amount parity if referenced once
    if (usage && usage.amounts.length === 1) {
      if (Math.abs(safeNum(cs.amount) - safeNum(usage.amounts[0])) > 0.01) {
        anomalies.push(
          mk(
            `cash:${keyLabel}:amount-mismatch`,
            "major",
            "CashSlip amount mismatch with referenced slip",
            `CashSlip ${keyLabel} amount ${cs.amount} != referenced slip amount ${usage.amounts[0]}`,
            { cashSlip: cs, usageAmount: usage.amounts[0] }
          )
        );
      }
    }
  }

  // 4) MONTHLY SHEET checks
  for (const m of monthlySheets) {
    const idLabel = m.monthLabel;
    const summaries = m.dailySummaries || [];

    // ensure each summary refers to a daily sheet that exists
    let sumIncome = 0;
    let sumExpense = 0;
    for (const s of summaries) {
      sumIncome += safeNum(s.totalIncome);
      sumExpense += safeNum(s.totalExpense);

      if (!s.dailySheetId) {
        anomalies.push(
          mk(
            `${idLabel}:summary:missing-id`,
            "major",
            "Monthly dailySummary missing dailySheetId",
            `Monthly ${idLabel} has a dailySummary without dailySheetId`,
            { monthly: m, summary: s }
          )
        );
        continue;
      }

      const ds = dailyById.get(s.dailySheetId);
      if (!ds) {
        anomalies.push(
          mk(
            `${idLabel}:summary:daily-notfound:${s.dailySheetId}`,
            "major",
            "Monthly dailySummary refers to missing DailySheet",
            `Monthly ${idLabel} dailySummary.dailySheetId ${s.dailySheetId} not found in DailySheets`,
            { monthly: m, summary: s }
          )
        );
      } else {
        const dayLabel = toDayLabel(ds.date);
        // small check: ensure totals mirror
        if (Math.abs(s.totalIncome - safeNum(ds.totalIncome)) > 0.01) {
          anomalies.push(
            mk(
              `${idLabel}:summary:income-mismatch:${dayLabel}`,
              "major",
              "Monthly summary income mismatch",
              `Monthly ${idLabel} submitted totalIncome ${s.totalIncome} != Daily ${dayLabel} totalIncome ${ds.totalIncome}`,
              { monthly: m, summary: s, dailyLabel: dayLabel }
            )
          );
        }
        if (Math.abs(s.totalExpense - safeNum(ds.totalExpense)) > 0.01) {
          anomalies.push(
            mk(
              `${idLabel}:summary:expense-mismatch:${dayLabel}`,
              "major",
              "Monthly summary expense mismatch",
              `Monthly ${idLabel} submitted totalExpense ${s.totalExpense} != Daily ${dayLabel} totalExpense ${ds.totalExpense}`,
              { monthly: m, summary: s, dailyLabel: dayLabel }
            )
          );
        }
      }
    }

    // compare monthly aggregates
    if (Math.abs(sumIncome - safeNum(m.totalIncome)) > 0.01) {
      anomalies.push(
        mk(
          `${idLabel}:monthly-income-mismatch`,
          "major",
          "Monthly totalIncome mismatch",
          `Monthly ${idLabel} sum daily incomes ${sumIncome} != monthly totalIncome ${m.totalIncome}`,
          { monthly: m, sumIncome }
        )
      );
    }
    if (Math.abs(sumExpense - safeNum(m.totalExpense)) > 0.01) {
      anomalies.push(
        mk(
          `${idLabel}:monthly-expense-mismatch`,
          "major",
          "Monthly totalExpense mismatch",
          `Monthly ${idLabel} sum daily expenses ${sumExpense} != monthly totalExpense ${m.totalExpense}`,
          { monthly: m, sumExpense }
        )
      );
    }

    // opening/closing chain check
    const expectedClosing = safeNum(m.openingBalance) + sumIncome - sumExpense;
    if (Math.abs(expectedClosing - safeNum(m.closingBalance)) > 0.01) {
      anomalies.push(
        mk(
          `${idLabel}:monthly-closing-balance`,
          "major",
          "Monthly closingBalance mismatch",
          `Monthly ${idLabel} expected closing ${expectedClosing} != closingBalance ${m.closingBalance}`,
          { monthly: m, expectedClosing }
        )
      );
    }
  }

  // 5) Cross-collection totals (global sanity)
  const totalCashSum = cashSlips.reduce((s, x) => s + safeNum(x.amount), 0);
  const totalVoucherSum = vouchers.reduce((s, x) => s + safeNum(x.amount), 0);
  const totalDailyIncome = dailySheets.reduce((s, x) => s + safeNum(x.totalIncome), 0);
  const totalDailyExpense = dailySheets.reduce((s, x) => s + safeNum(x.totalExpense), 0);

  if (totalVoucherSum > totalCashSum + 0.01) {
    anomalies.push(
      mk(
        `global:vouchers-exceed-cash`,
        "major",
        "Vouchers total exceeds CashSlips total",
        `All vouchers total ${totalVoucherSum} > all cash slips total ${totalCashSum}. Verify external expenses or missing incomes.`,
        { totalVoucherSum, totalCashSum }
      )
    );
  }

  // Return a sorted anomaly list (critical first)
  anomalies.sort((a, b) => {
    const order = { critical: 0, major: 1, minor: 2, info: 3 };
    return order[a.severity] - order[b.severity];
  });

  return { anomalies, stats: { totalCashSum, totalVoucherSum, totalDailyIncome, totalDailyExpense } };
}