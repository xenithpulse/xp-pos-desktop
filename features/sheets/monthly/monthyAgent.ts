// lib/monthlyAgent.ts
type ExpenseEntry = { category: string; description?: string; amount: number; paymentMethod?: 'cash' | 'cheque' | 'online' };
type SlipEntry = { copyNumber?: string; uniqueNumber?: string; amount?: number; description?: string };

export interface MonthlyDailySummary {
  dailySheetId: string;
  date?: string;
}

export interface MonthlySheet {
  _id: string;
  monthLabel: string;
  startDate: string;
  endDate: string;
  openingBalance?: number;
  cashOpeningBalance?: number;
  onlineOpeningBalance?: number;
  notes?: string;
  totalIncome?: number;
  totalExpense?: number;
  closingBalance?: number;
  isClosed?: boolean;
  dailySummaries?: MonthlyDailySummary[];
}

let agentActive = false;
let activeMonthly: MonthlySheet | null = null;

function ts() {
  return new Date().toISOString();
}

/**
 * Fetch the currently open monthly sheet (server: /api/monthly-sheets/active)
 */
export async function getActiveMonthly(): Promise<MonthlySheet | null> {
  console.info(`[${ts()}] [monthlyAgent] getActiveMonthly — fetching active monthly sheet...`);
  try {
    const res = await fetch('/api/monthly-sheets/active');
    if (!res.ok) {
      console.error(`[${ts()}] [monthlyAgent] getActiveMonthly — fetch failed (status: ${res.status})`);
      throw new Error('Failed to fetch active monthly');
    }
    const data: MonthlySheet | null = await res.json();
    console.info(`[${ts()}] [monthlyAgent] getActiveMonthly — success. activeMonthly:`, data ?? 'null');
    return data;
  } catch (err) {
    console.error(`[${ts()}] [monthlyAgent] getActiveMonthly — error:`, err);
    throw err;
  }
}

/**
 * Open (create) a new monthly sheet and start the client-agent.
 * Calls POST /api/monthly-sheets/open
 */
export async function openMonthly(opts: {
  monthLabel: string;
  startDate: string | Date;
  endDate: string | Date;
  openingBalance?: number;
  cashOpeningBalance?: number;
  onlineOpeningBalance?: number;
  notes?: string;
}): Promise<MonthlySheet> {
  console.info(
    `[${ts()}] [monthlyAgent] openMonthly — opening month: ${opts.monthLabel} (${opts.startDate} → ${opts.endDate})`
  );
  console.debug(`[${ts()}] [monthlyAgent] openMonthly — payload:`, opts);

  try {
    const res = await fetch('/api/monthly-sheets/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      console.error(
        `[${ts()}] [monthlyAgent] openMonthly — server error (status: ${res.status})`,
        errJson ?? 'no-json'
      );
      throw new Error(errJson?.error || 'Failed to open monthly sheet');
    }
    const monthly: MonthlySheet = await res.json();
    activeMonthly = monthly;
    agentActive = true;
    console.info(
      `[${ts()}] [monthlyAgent] openMonthly — success. Opened & agent started for ${monthly.monthLabel} (${monthly._id})`
    );
    return monthly;
  } catch (err) {
    console.error(`[${ts()}] [monthlyAgent] openMonthly — error:`, err);
    throw err;
  }
}

/**
 * Update an open monthly sheet's window (startDate / endDate).
 * Calls PATCH /api/monthly-sheets/{id}. The server enforces that the new range
 * still contains every existing daily sheet and does not overlap another month.
 */
export async function updateMonthlyDates(
  monthlyId: string,
  dates: { startDate?: string; endDate?: string }
): Promise<MonthlySheet> {
  console.info(
    `[${ts()}] [monthlyAgent] updateMonthlyDates — id=${monthlyId}`,
    dates
  );
  if (!monthlyId) throw new Error('monthlyId missing');

  try {
    const res = await fetch(`/api/monthly-sheets/${monthlyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dates),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      console.error(
        `[${ts()}] [monthlyAgent] updateMonthlyDates — server error (status: ${res.status})`,
        json ?? 'no-json'
      );
      throw new Error(json?.message || json?.error || 'Failed to update monthly dates');
    }
    const updated: MonthlySheet = json?.data ?? json;
    if (activeMonthly && activeMonthly._id === monthlyId) {
      activeMonthly = updated;
    }
    console.info(`[${ts()}] [monthlyAgent] updateMonthlyDates — success.`);
    return updated;
  } catch (err) {
    console.error(`[${ts()}] [monthlyAgent] updateMonthlyDates — error:`, err);
    throw err;
  }
}

/**
 * Close an open monthly sheet. Calls POST /api/monthly-sheets/{id}/close
 */
export async function closeMonthly(monthlyId?: string): Promise<MonthlySheet> {
  const id = monthlyId || activeMonthly?._id;
  console.info(`[${ts()}] [monthlyAgent] closeMonthly — closing monthlyId=${id}...`);
  if (!id) {
    console.error(`[${ts()}] [monthlyAgent] closeMonthly — monthlyId missing`);
    throw new Error('monthlyId missing');
  }

  try {
    const res = await fetch(`/api/monthly-sheets/${id}/close`, { method: 'POST' });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      console.error(
        `[${ts()}] [monthlyAgent] closeMonthly — server error (status: ${res.status})`,
        errJson ?? 'no-json'
      );
      throw new Error(errJson?.error || 'Failed to close monthly');
    }
    const data: MonthlySheet = await res.json();
    console.info(`[${ts()}] [monthlyAgent] closeMonthly — success. Monthly closed.`, data);
    stopMonthlyAgent();
    return data;
  } catch (err) {
    console.error(`[${ts()}] [monthlyAgent] closeMonthly — error:`, err);
    throw err;
  }
}

/**
 * Start agent by loading the active monthly from server. Throws if none open.
 */
export async function startMonthlyAgent(): Promise<MonthlySheet> {
  console.info(`[${ts()}] [monthlyAgent] startMonthlyAgent — starting agent...`);
  try {
    const data = await getActiveMonthly();
    if (!data) {
      console.warn(`[${ts()}] [monthlyAgent] startMonthlyAgent — no open monthly sheet found.`);
      throw new Error('No open monthly sheet. Please Open Month first.');
    }
    activeMonthly = data;
    agentActive = true;
    console.info(
      `[${ts()}] [monthlyAgent] startMonthlyAgent — agentActive=true, streaming to: ${activeMonthly.monthLabel} (${activeMonthly._id})`
    );
    return activeMonthly;
  } catch (err) {
    console.error(`[${ts()}] [monthlyAgent] startMonthlyAgent — failed:`, err);
    throw err;
  }
}

/**
 * Stop client-side agent (no more auto-sync)
 */
export function stopMonthlyAgent(): void {
  console.info(`[${ts()}] [monthlyAgent] stopMonthlyAgent — stopping agent...`);
  agentActive = false;
  activeMonthly = null;
  console.info(`[${ts()}] [monthlyAgent] stopMonthlyAgent — agent stopped.`);
}

/**
 * Sync a daily sheet summary to the currently active monthly (client -> server)
 */
export async function syncDailyToMonthlyExpenses(payload: {
  dailySheetId: string;
  date?: string | Date;
  entries: ExpenseEntry[];
  slipEntries?: SlipEntry[];
  totalIncome?: number;
  totalExpense?: number;
  closingBalance?: number;
}): Promise<MonthlySheet | null> {
  console.info(`[${ts()}] [monthlyAgent] syncDailyToMonthlyExpenses — invoked`);
  if (!agentActive) {
    console.warn(`[${ts()}] [monthlyAgent] syncDailyToMonthlyExpenses — agent not active. Skipping sync.`);
    return null;
  }

  try {
    if (!activeMonthly) {
      console.info(`[${ts()}] [monthlyAgent] syncDailyToMonthlyExpenses — activeMonthly missing, attempting to reload...`);
      activeMonthly = await getActiveMonthly();
      if (!activeMonthly) {
        console.error(
          `[${ts()}] [monthlyAgent] syncDailyToMonthlyExpenses — no open monthly sheet found (after reload).`
        );
        throw new Error('No open monthly sheet found (agent expects an open month).');
      }
    }

    const body = {
      dailySheetId: payload.dailySheetId,
      date: payload.date || undefined,
      totalIncome: payload.totalIncome || 0,
      totalExpense:
        typeof payload.totalExpense === 'number'
          ? payload.totalExpense
          : payload.entries.reduce((s, e) => s + Number(e.amount || 0), 0),
      closingBalance: payload.closingBalance || 0,
      slipEntries: payload.slipEntries || [],
      entries: payload.entries || [],
    };

    console.debug(`[${ts()}] [monthlyAgent] syncDailyToMonthlyExpenses — payload:`, {
      monthlyId: activeMonthly._id,
      body,
    });

    const res = await fetch(`/api/monthly-sheets/${activeMonthly._id}/sync-daily`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      console.error(
        `[${ts()}] [monthlyAgent] syncDailyToMonthlyExpenses — server responded with error (status: ${res.status})`,
        errJson ?? 'no-json'
      );
      throw new Error(errJson?.error || 'Failed to sync to monthly sheet');
    }

    const updated: MonthlySheet = await res.json();
    activeMonthly = updated;
    console.info(
      `[${ts()}] [monthlyAgent] syncDailyToMonthlyExpenses — success. Updated monthly totals: totalIncome=${updated.totalIncome}, totalExpense=${updated.totalExpense}, closingBalance=${updated.closingBalance}`
    );
    return updated;
  } catch (err) {
    console.error(`[${ts()}] [monthlyAgent] syncDailyToMonthlyExpenses — error:`, err);
    throw err;
  }
}
