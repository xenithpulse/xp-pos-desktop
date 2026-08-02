/**
 * PrintableDailySheet — React component that renders a single-page A4 daily
 * sheet, designed to be printed via `react-to-print` (useReactToPrint).
 *
 * Layout (top → bottom):
 *  ┌─ Header: Tenant Name • Sheet # • Date ───────────────────────────────────┐
 *  │ Cash Slips table (8 cols, single-row entries + Opening row)              │
 *  │ Expense table (6 cols, single-row entries + Closing Balance row)         │
 *  │ Notes (optional, narrow strip below)                                     │
 *  └──────────────────────────────────────────────────────────────────────────┘
 *
 * The Closing Balance row sits inside the expense table's tfoot so its
 * Cash / Bank / Total numeric cells are perfectly aligned with the table's
 * existing column grid.
 *
 * Cash Withdrawl mirrors (and any slip without an attached booking) show
 * the slip's `description` in the Client column instead of a placeholder.
 *
 * Payment-method routing:
 *   • Cash column   ← `cash`, `cheque`
 *   • Online column ← `online`, `card`, `bank_transfer`, anything else
 */
import React, { forwardRef } from 'react';
import type { DailySheet, ISlipEntry, Entry, ISlipBookingLink } from './types';

/**
 * Canonical payment-method normalizer. Cash/cheque map to the cash bucket;
 * every other value (online, card, bank_transfer, …) maps to online — matching
 * the column rules documented in the file header.
 */
const normalizePaymentMethod = (method: string | undefined): 'cash' | 'cheque' | 'online' => {
  const pm = (method ?? '').toString().trim().toLowerCase();
  if (pm === 'cash') return 'cash';
  if (pm === 'cheque' || pm === 'check') return 'cheque';
  return 'online';
};

/* ── helpers ── */

const fmtMoney = (n: number | undefined | null): string => {
  const v = Number(n ?? 0);
  return v.toLocaleString('en-PK', { maximumFractionDigits: 2 });
};

const fmtDate = (d: string | Date | undefined | null): string => {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const fmtDateTime = (d: string | Date | undefined | null): string => {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

/** Compact PKT date+time, 12-hour, e.g. "30 Apr · 07:42 PM" */
const fmtDateTimeShort = (d: string | Date | undefined | null): string => {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  const datePart = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  });
  const timePart = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart} · ${timePart}`;
};

/** ObjectId hex → embedded timestamp (first 4 bytes) → Date */
const objectIdToDate = (id: string | undefined | null): Date | null => {
  if (!id || typeof id !== 'string' || id.length < 8) return null;
  const tsHex = id.substring(0, 8);
  const ts = parseInt(tsHex, 16);
  if (!Number.isFinite(ts) || ts <= 0) return null;
  return new Date(ts * 1000);
};

/**
 * Cash/Online split — uses the same canonical normalizer the API uses when
 * persisting daily-sheet entries, so the print view is resilient to any
 * raw/legacy values that may have slipped through (e.g. "Cash", "Bank transfer",
 * "bank_transfer", "Card", "Online").
 *
 *   Cash column   ← cash, cheque
 *   Online column ← online, card, bank_transfer, and any other value
 */
const splitAmountByMethod = (
  amount: number,
  method: string | undefined
): { cash: number; online: number } => {
  const pm = normalizePaymentMethod(method);
  if (pm === 'cash' || pm === 'cheque') return { cash: amount, online: 0 };
  return { cash: 0, online: amount };
};

/** Parse PostToContractPanel's `${date} ${start} ${end}` string. */
function parseEventDateAndMeal(raw: string | undefined): { date: string; meal: string } {
  if (!raw || typeof raw !== 'string') return { date: '—', meal: '' };
  const s = raw.trim();
  const dateMatch = s.match(/(\d{4}-\d{2}-\d{2})/);
  const datePart = dateMatch ? dateMatch[1] : s.split(' ')[0];
  const timeMatch = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/);
  let hour24 = -1;
  if (timeMatch) {
    let h = parseInt(timeMatch[1], 10);
    const mer = (timeMatch[3] || '').toUpperCase();
    if (mer === 'PM' && h < 12) h += 12;
    else if (mer === 'AM' && h === 12) h = 0;
    hour24 = h;
  }
  let dateLabel = datePart;
  const d = new Date(datePart);
  if (!isNaN(d.getTime())) {
    dateLabel = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  const meal = hour24 < 0 ? '' : hour24 < 17 ? 'Lunch' : 'Dinner';
  return { date: dateLabel, meal };
}

const firstBookingLabel = (
  bookings?: ISlipBookingLink[]
): { client: string; bookingNo: string; eventDateLabel: string; meal: string } => {
  const b = bookings && bookings[0];
  if (!b) return { client: '—', bookingNo: '—', eventDateLabel: '—', meal: '' };
  const { date, meal } = parseEventDateAndMeal(b.eventTimeAndDate);
  return {
    client: b.clientName || '—',
    bookingNo: b.bookingUniqueId || (b.bookingId ? String(b.bookingId).slice(-6) : '—'),
    eventDateLabel: date,
    meal,
  };
};

/* ── totals ── */

interface MethodTotals {
  cash: number;
  online: number;
  total: number;
  count: number;
}

function totalsForSlips(entries: ISlipEntry[]): MethodTotals {
  let cash = 0,
    online = 0,
    total = 0;
  const count = entries?.length || 0;
  for (const s of entries || []) {
    const amt = Number(s.amount) || 0;
    const split = splitAmountByMethod(amt, s.paymentMethod);
    cash += split.cash;
    online += split.online;
    total += amt;
  }
  return { cash, online, total, count };
}

function totalsForExpenses(entries: Entry[]): MethodTotals {
  let cash = 0,
    online = 0,
    total = 0;
  const count = entries?.length || 0;
  for (const e of entries || []) {
    const amt = Number(e.amount) || 0;
    const split = splitAmountByMethod(amt, e.paymentMethod);
    cash += split.cash;
    online += split.online;
    total += amt;
  }
  return { cash, online, total, count };
}

/* ── component ── */

interface PrintableDailySheetProps {
  sheet: DailySheet;
}

const PrintableDailySheet = forwardRef<HTMLDivElement, PrintableDailySheetProps>(
  function PrintableDailySheet({ sheet }, ref) {
    const slipTotals = totalsForSlips(sheet.slipEntries || []);
    const expenseTotals = totalsForExpenses(sheet.entries || []);
    const opening = Number(sheet.openingBalance) || 0;

    // Per-method opening with single-drawer fallback: when neither split is set
    // but a combined opening exists, treat the entire opening as cash. This
    // mirrors the schema's pre-save logic so screen and DB always agree.
    let cashOpening = Number(sheet.cashOpeningBalance) || 0;
    const onlineOpening = Number(sheet.onlineOpeningBalance) || 0;
    if (cashOpening === 0 && onlineOpening === 0 && opening > 0) cashOpening = opening;
    const totalOpening = cashOpening + onlineOpening;

    // Cash-Slip table totals INCLUDE the opening balance row — so the
    // "Total" line shows the actual money present in each bucket after
    // the day's incoming slips, before any expenses.
    const slipPlusOpeningCash = slipTotals.cash + cashOpening;
    const slipPlusOpeningOnline = slipTotals.online + onlineOpening;
    const slipPlusOpeningGrand = slipPlusOpeningCash + slipPlusOpeningOnline;

    // Closing per bucket follows the same cash/cheque vs online routing.
    // Prefer schema-persisted values; fall back to the same formula the
    // schema uses so older sheets without the split still print correctly.
    const cashClosing =
      typeof sheet.cashClosingBalance === 'number'
        ? sheet.cashClosingBalance
        : slipPlusOpeningCash - expenseTotals.cash;
    const onlineClosing =
      typeof sheet.onlineClosingBalance === 'number'
        ? sheet.onlineClosingBalance
        : slipPlusOpeningOnline - expenseTotals.online;
    const closing =
      typeof sheet.closingBalance === 'number'
        ? sheet.closingBalance
        : opening + slipTotals.total - expenseTotals.total;
    const sheetDate = fmtDate(sheet.date);
    const sheetNo = sheet.sheetNumber ?? '—';

    const slipEntries = sheet.slipEntries || [];
    const expenseEntries = sheet.entries || [];

    return (
      <>
        <style>{printStyles}</style>
        <div className="ds-print-root" ref={ref}>
          <div className="sheet">
            <div className="scaler">
              {/* ── Header ── */}
              <header className="doc-head">
                <div>
                  <div className="biz">Daily Cash & Bank Status</div>
                </div>
                <div className="meta">
                  <div className="sheet-no">SHEET #{sheetNo}</div>
                  <div className="date">{sheetDate}</div>
                  {sheet._id && <div className="ref">REF {String(sheet._id).slice(-8)}</div>}
                </div>
              </header>

              {/* ── Cash Slips ── */}
              <h2 className="section">
                <span>Cash Slips · Income</span>
                <span className="count">
                  {slipTotals.count} entr{slipTotals.count === 1 ? 'y' : 'ies'}
                </span>
              </h2>
              <table className="slips">
                <colgroup>
                  <col className="c-client" />
                  <col className="c-booking" />
                  <col className="c-event" />
                  <col className="c-created" />
                  <col className="c-copy" />
                  <col className="c-cash" />
                  <col className="c-online" />
                  <col className="c-total" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>
                      Event No.
                    </th>
                    <th>
                      Event
                    </th>
                    <th>
                      BRC <span className="th-sub">(Date)</span>
                    </th>
                    <th>
                      BRC-V.NO
                    </th>
                    <th className="num">Cash</th>
                    <th className="num">Bank</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Opening Balance row — always first so users read the day
                      starting from the money already in the drawer. */}
                  <tr className="opening-row">
                    <td colSpan={5}>
                      <span className="cell-main">Opening Balance</span>
                      <span className="cell-sub"> (carried from previous sheet)</span>
                    </td>
                    <td className="num">
                      {cashOpening > 0 ? fmtMoney(cashOpening) : <span className="muted">—</span>}
                    </td>
                    <td className="num">
                      {onlineOpening > 0 ? fmtMoney(onlineOpening) : <span className="muted">—</span>}
                    </td>
                    <td className="num strong">{fmtMoney(totalOpening)}</td>
                  </tr>
                  {slipEntries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="empty">
                        No cash slips on this sheet.
                      </td>
                    </tr>
                  ) : (
                    slipEntries.map((s, i) => {
                      const booking = firstBookingLabel(s.bookings);
                      const hasBooking = !!(s.bookings && s.bookings.length);
                      const slipCreated = s.slipCreatedAt ?? objectIdToDate(s._id) ?? null;
                      const { cash, online } = splitAmountByMethod(Number(s.amount) || 0, s.paymentMethod);
                      const total = Number(s.amount) || 0;
                      // Daily Sheet v2 reading priority:
                      //   • Client    ← slip-level `clientName` (v2 snapshot)
                      //                  → booking[0].clientName (legacy)
                      //                  → slip.description (cash-withdrawl mirrors)
                      //   • Event No  ← slip.description (v2 convention: it carries
                      //                  the Event ID like "A-356" / "B-86")
                      //                  → booking[0].bookingUniqueId (legacy)
                      //   • Event Date← slip-level `eventDate` (v2 snapshot)
                      //                  → booking[0].eventTimeAndDate (legacy)
                      const v2ClientName = typeof s.clientName === 'string' ? s.clientName.trim() : '';
                      const clientLabel =
                        v2ClientName ||
                        (hasBooking ? booking.client : (s.description || booking.client));
                      const v2EventId = typeof s.description === 'string' ? s.description.trim() : '';
                      // Show the description as Event No when it isn't being used
                      // as the client label (i.e. v2 slip with both clientName +
                      // description, or any slip that snapshotted a clientName).
                      const eventNoLabel =
                        v2ClientName && v2EventId ? v2EventId :
                        hasBooking ? booking.bookingNo :
                        v2EventId || '—';
                      const eventDateLabel = s.eventDate
                        ? fmtDate(s.eventDate)
                        : booking.eventDateLabel;
                      const meal = s.eventDate ? '' : booking.meal;
                      return (
                        <tr key={s._id || i}>
                          <td>
                            <span className="cell-main">{clientLabel}</span>
                          </td>
                          <td className="mono">{eventNoLabel}</td>
                          <td>
                            <span className="cell-main">{eventDateLabel}</span>
                            {meal && (
                              <span
                                className={`meal ${meal === 'Lunch' ? 'lunch' : 'dinner'}`}
                              >
                                {meal}
                              </span>
                            )}
                          </td>
                          <td className="mono">{fmtDate(slipCreated)}</td>
                          <td className="mono">
                            <span className="copy">#{s.copyNumber}</span>
                            {s.uniqueNumber && (
                              <>
                                {' '}
                                <span className="uniq">({s.uniqueNumber})</span>
                              </>
                            )}
                          </td>
                          <td className="num">
                            {cash > 0 ? fmtMoney(cash) : <span className="muted">—</span>}
                          </td>
                          <td className="num">
                            {online > 0 ? fmtMoney(online) : <span className="muted">—</span>}
                          </td>
                          <td className="num strong">{fmtMoney(total)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'right' }}>
                      Total <span className="th-sub">(Opening + Slips)</span>
                    </td>
                    <td className="num">{fmtMoney(slipPlusOpeningCash)}</td>
                    <td className="num">{fmtMoney(slipPlusOpeningOnline)}</td>
                    <td className="num">{fmtMoney(slipPlusOpeningGrand)}</td>
                  </tr>
                </tfoot>
              </table>

              {/* ── Expenses ── */}
              <h2 className="section">
                <span>Expenses · Cash Payouts</span>
                <span className="count">
                  {expenseTotals.count} entr{expenseTotals.count === 1 ? 'y' : 'ies'}
                </span>
              </h2>
              <table className="exps">
                <colgroup>
                  <col className="c-desc" />
                  <col className="c-when" />
                  <col className="c-copy" />
                  <col className="c-cash" />
                  <col className="c-online" />
                  <col className="c-total" />
                </colgroup>
                <thead>
                  <tr>
                    <th>
                      Description <span className="th-sub">(Category)</span>
                    </th>
                    <th>
                      Created <span className="th-sub">(PKT)</span>
                    </th>
                    <th>
                      Voucher No.
                    </th>
                    <th className="num">Cash</th>
                    <th className="num">Bank</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseEntries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="empty">
                        No expense entries on this sheet.
                      </td>
                    </tr>
                  ) : (
                    expenseEntries.map((e, i) => {
                      const created = e.createdAt ?? objectIdToDate(e._id) ?? null;
                      const amount = Number(e.amount) || 0;
                      const { cash, online } = splitAmountByMethod(amount, e.paymentMethod);
                      const copy = e.postedCopyNumber || '';
                      const uniq = e.postedUniqueNumber || '';
                      const category = (e.category || '').replace(/_/g, ' ');
                      const lines = Array.isArray(e.lines) ? e.lines : [];
                      // Inline up to 2 lines in the parent row (compact, easy
                      // to relate to the totals on the right). Beyond that we
                      // promote them to a nested sub-table so it stays legible.
                      const inlineLines = lines.length > 0 && lines.length <= 2;
                      const expandedLines = lines.length > 2;
                      const fmtLine = (l: typeof lines[number]): string => {
                        const qty =
                          typeof l.quantity === 'number'
                            ? `${l.quantity}${l.unit ? ' ' + l.unit : ''}`
                            : '';
                        const rate =
                          typeof l.rate === 'number' ? `@ ${fmtMoney(l.rate)}` : '';
                        const sub = l.subCategory || '—';
                        return [sub, qty, rate].filter(Boolean).join(' ');
                      };
                      return (
                        <React.Fragment key={e._id || i}>
                          <tr>
                            <td>
                              <span className="cell-main">
                                {expandedLines
                                  ? `${lines.length} items`
                                  : inlineLines
                                  ? lines.map(fmtLine).join(' · ')
                                  : e.description || '—'}
                              </span>
                              {category && (
                                <>
                                  {' '}
                                  <span className="cell-sub cap">({category})</span>
                                </>
                              )}
                              {e.vendorName && (
                                <>
                                  {' '}
                                  <span className="cell-sub">· {e.vendorName}</span>
                                </>
                              )}
                            </td>
                            <td className="mono">{fmtDateTimeShort(created)}</td>
                            <td className="mono">
                              {copy || uniq ? (
                                <>
                                  {copy && <span className="copy">#{copy}</span>}
                                  {copy && uniq && ' '}
                                  {uniq && <span className="uniq">({uniq})</span>}
                                </>
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                            <td className="num">
                              {cash > 0 ? fmtMoney(cash) : <span className="muted">—</span>}
                            </td>
                            <td className="num">
                              {online > 0 ? fmtMoney(online) : <span className="muted">—</span>}
                            </td>
                            <td className="num strong">{fmtMoney(amount)}</td>
                          </tr>
                          {expandedLines && (
                            <tr className="lines-row">
                              <td colSpan={6} className="lines-cell">
                                <table className="lines-table">
                                  <colgroup>
                                    <col className="lc-item" />
                                    <col className="lc-qty" />
                                    <col className="lc-rate" />
                                    <col className="lc-amount" />
                                  </colgroup>
                                  <tbody>
                                    {lines.map((l, li) => {
                                      const qtyLabel =
                                        typeof l.quantity === 'number'
                                          ? `${l.quantity}${l.unit ? ' ' + l.unit : ''}`
                                          : l.unit || '—';
                                      return (
                                        <tr key={li}>
                                          <td>
                                            <span className="line-bullet">↳</span>
                                            {l.subCategory || '—'}
                                            {l.description && (
                                              <span className="cell-sub">
                                                {' '}
                                                · {l.description}
                                              </span>
                                            )}
                                          </td>
                                          <td className="num mono">{qtyLabel}</td>
                                          <td className="num mono">
                                            {typeof l.rate === 'number'
                                              ? `@ ${fmtMoney(l.rate)}`
                                              : '—'}
                                          </td>
                                          <td className="num strong">
                                            {fmtMoney(l.amount)}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'right' }}>
                      Expense Totals
                    </td>
                    <td className="num">{fmtMoney(expenseTotals.cash)}</td>
                    <td className="num">{fmtMoney(expenseTotals.online)}</td>
                    <td className="num">{fmtMoney(expenseTotals.total)}</td>
                  </tr>
                  {/* Closing Balance row — perfectly aligned with the
                      expense table's Cash / Bank / Total columns so the
                      printed sheet ends on the day's final figures. */}
                  <tr className="closing-foot">
                    <td colSpan={3} style={{ textAlign: 'right' }}>
                      Closing Balance
                    </td>
                    <td className="num strong">{fmtMoney(cashClosing)}</td>
                    <td className="num strong">{fmtMoney(onlineClosing)}</td>
                    <td className="num strong">{fmtMoney(closing)}</td>
                  </tr>
                </tfoot>
              </table>

              {sheet.notes ? (
                <div className="notes">
                  <span className="label">Notes</span>
                  {sheet.notes}
                </div>
              ) : null}

              {/* ── Footer ── */}
              <footer className="doc-foot">
                <span>Generated {fmtDateTime(new Date())}</span>
                <span>
                  · Sheet #{sheetNo}
                </span>
              </footer>
            </div>
          </div>
        </div>
      </>
    );
  }
);

export default PrintableDailySheet;

/* ── styles (scoped via .ds-print-root prefix) ── */

const printStyles = `
  /* Off-screen mount: hidden on screen but rendered for react-to-print to clone. */
  .ds-print-root {
    position: fixed;
    left: -10000px;
    top: 0;
    width: 210mm;
    background: #fff;
    color: #2a2f36;
    font-family: 'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif;
    font-size: 10px;
    line-height: 1.35;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .ds-print-root *, .ds-print-root *::before, .ds-print-root *::after { box-sizing: border-box; }

  .ds-print-root .sheet {
    width: 210mm; min-height: 297mm; background: #fff;
    padding: 10mm 11mm 9mm; display: flex; flex-direction: column;
  }
  .ds-print-root .scaler {
    display: flex; flex-direction: column; flex: 1;
  }

  /* Header — corporate: thin double rule, no heavy black bar */
  .ds-print-root header.doc-head {
    display: grid; grid-template-columns: 1fr auto; align-items: end;
    border-bottom: 1px solid #2a2f36; padding-bottom: 7px; margin-bottom: 9px;
    position: relative;
  }
  .ds-print-root header.doc-head::after {
    content: ''; position: absolute; left: 0; right: 0; bottom: -3px;
    border-bottom: 1px solid #2a2f36;
  }
  .ds-print-root header.doc-head .biz {
    font-size: 16px; font-weight: 700; letter-spacing: .3px; color: #2a2f36; line-height: 1.1;
  }
  .ds-print-root header.doc-head .sub {
    font-size: 9.5px; color: #5b6470; margin-top: 2px; letter-spacing: .8px; text-transform: uppercase;
  }
  .ds-print-root header.doc-head .meta { text-align: right; line-height: 1.3; }
  .ds-print-root header.doc-head .meta .sheet-no {
    display: inline-block; font-size: 10.5px; font-weight: 700;
    background: #fff; color: #2a2f36; border: 1px solid #2a2f36;
    padding: 3px 9px; border-radius: 2px; letter-spacing: .6px;
  }
  .ds-print-root header.doc-head .meta .date {
    margin-top: 4px; font-size: 11px; font-weight: 600; color: #2a2f36;
  }
  .ds-print-root header.doc-head .meta .ref {
    font-size: 9px; color: #8a929c; margin-top: 1px; font-family: ui-monospace, monospace;
  }

  /* Section titles — light bg + dark text + left accent rule */
  .ds-print-root h2.section {
    font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px;
    margin: 9px 0 0; padding: 5px 9px 5px 12px;
    color: #2a2f36; background: #eef1f4;
    border: 1px solid #c6ccd3; border-left: 3px solid #2a2f36;
    border-radius: 2px 2px 0 0;
    display: flex; justify-content: space-between; align-items: center;
  }
  .ds-print-root h2.section .count {
    font-size: 8.5px; font-weight: 600; color: #5b6470;
    background: #fff; border: 1px solid #c6ccd3;
    padding: 1px 7px; border-radius: 8px; letter-spacing: .3px;
  }

  /* Tables */
  .ds-print-root table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .ds-print-root thead th {
    background: #f6f7f9; color: #2a2f36; text-align: left;
    font-weight: 700; font-size: 8.5px; text-transform: uppercase; letter-spacing: .6px;
    padding: 5px 6px; border: 1px solid #c6ccd3; border-bottom: 1.5px solid #2a2f36;
  }
  .ds-print-root tbody td {
    padding: 4px 6px; border: 1px solid #d8dde3; vertical-align: middle;
    word-wrap: break-word; word-break: break-word; font-size: 9.5px; color: #2a2f36;
  }
  .ds-print-root tbody tr:nth-child(even) td { background: #f6f7f9; }
  .ds-print-root td.num, .ds-print-root th.num {
    text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .ds-print-root td.mono { font-family: ui-monospace, 'SF Mono', Consolas, monospace; }
  .ds-print-root td.strong { font-weight: 700; }
  .ds-print-root td .cell-main { font-weight: 600; color: #2a2f36; }
  .ds-print-root td .cell-sub { color: #5b6470; font-size: 8.5px; font-style: italic; }
  .ds-print-root td .cell-sub.cap { text-transform: capitalize; }
  .ds-print-root td .copy { font-weight: 700; color: #2a2f36; font-size: 9px; }
  .ds-print-root td .uniq { color: #5b6470; font-size: 8.5px; font-weight: 500; }
  .ds-print-root td.empty { text-align: center; color: #8a929c; font-style: italic; padding: 12px; }
  .ds-print-root .muted { color: #b7bdc5; }

  /* Per-line breakdown nested under multi-line expense rows. Reads as an
     indented continuation of the parent row: same column grid, no header,
     a left guide-line + ↳ bullet visually anchor each item to the entry
     above. The wrapper <td> spans full width and kills its own padding so
     only the inner table styling is visible. */
  .ds-print-root tr.lines-row td.lines-cell {
    padding: 0;
    border: 1px solid #d8dde3;
    border-top: 0;
    background: #fbfbfd;
  }
  .ds-print-root tbody tr.lines-row:nth-child(even) td.lines-cell {
    background: #fbfbfd;
  }
  .ds-print-root table.lines-table {
    width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0;
  }
  /* Match the parent expense table's column ratios so Qty/Rate/Amount
     line up under their parent columns (Created, Voucher #, Cash, Bank, Total). */
  .ds-print-root table.lines-table colgroup .lc-item   { width: 58%; }
  .ds-print-root table.lines-table colgroup .lc-qty    { width: 12%; }
  .ds-print-root table.lines-table colgroup .lc-rate   { width: 14%; }
  .ds-print-root table.lines-table colgroup .lc-amount { width: 16%; }
  .ds-print-root table.lines-table tbody td {
    padding: 2.5px 8px; border: 0; border-bottom: 1px dotted #e2e6eb;
    background: transparent; font-size: 9px; color: #2a2f36;
  }
  .ds-print-root table.lines-table tbody tr:last-child td { border-bottom: 0; }
  /* Indent the first cell so it visually sits underneath the parent row,
     and add a thin guide line at the left to group the items together. */
  .ds-print-root table.lines-table tbody td:first-child {
    padding-left: 22px;
    border-left: 2px solid #c6ccd3;
  }
  .ds-print-root table.lines-table .line-bullet {
    display: inline-block; width: 12px; margin-left: -14px;
    color: #8a929c; font-weight: 700;
  }

  .ds-print-root .th-sub {
    font-weight: 500; color: #8a929c; font-size: 7.5px;
    text-transform: none; letter-spacing: 0; margin-left: 2px; font-style: italic;
  }

  .ds-print-root .meal {
    display: inline-block; padding: 0 6px; margin-left: 4px;
    font-size: 8px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase;
    border: 1px solid #5b6470; color: #2a2f36; background: #fff; border-radius: 2px;
  }
  .ds-print-root .meal.dinner { background: #5b6470; color: #fff; border-color: #5b6470; }

  .ds-print-root tfoot td {
    padding: 5px 6px; border: 1px solid #c6ccd3;
    background: #e3e7ec; font-weight: 700; font-size: 9.5px; color: #2a2f36;
    border-top: 1.5px solid #2a2f36;
  }

  /* Closing Balance row inside expense tfoot — most prominent line on the
     printed page: dark grey background, white text, larger size. Sits
     directly below the expense entries with the cash / bank / total
     numeric cells perfectly aligned to the table's column grid. */
  .ds-print-root tfoot tr.closing-foot td {
    background: #2a2f36; color: #fff;
    font-weight: 700; font-size: 11px; letter-spacing: .4px;
    border-color: #2a2f36;
  }

  /* Opening Balance row in slip table — visually anchored as the starting line */
  .ds-print-root tbody tr.opening-row td {
    background: #eef1f4 !important; font-weight: 600;
    border-top: 1.5px solid #2a2f36; border-bottom: 1px solid #c6ccd3;
  }

  /* Slip table widths */
  .ds-print-root table.slips col.c-client    { width: 17%; }
  .ds-print-root table.slips col.c-booking   { width: 9%;  }
  .ds-print-root table.slips col.c-event     { width: 14%; }
  .ds-print-root table.slips col.c-created   { width: 10%; }
  .ds-print-root table.slips col.c-copy      { width: 12%; }
  .ds-print-root table.slips col.c-cash      { width: 11%; }
  .ds-print-root table.slips col.c-online    { width: 11%; }
  .ds-print-root table.slips col.c-total     { width: 16%; }

  /* Expense table widths */
  .ds-print-root table.exps col.c-desc       { width: 36%; }
  .ds-print-root table.exps col.c-when       { width: 16%; }
  .ds-print-root table.exps col.c-copy       { width: 14%; }
  .ds-print-root table.exps col.c-cash       { width: 11%; }
  .ds-print-root table.exps col.c-online     { width: 11%; }
  .ds-print-root table.exps col.c-total      { width: 12%; }

  /* Notes — narrow strip below the closing row (when present) */
  .ds-print-root .notes {
    margin-top: 8px; padding: 8px 10px; background: #f6f7f9;
    border: 1px solid #c6ccd3; border-left: 3px solid #5b6470; border-radius: 2px;
    font-style: italic; color: #2a2f36; font-size: 9px; line-height: 1.4;
  }
  .ds-print-root .notes .label {
    font-style: normal; font-weight: 700; text-transform: uppercase;
    letter-spacing: .6px; font-size: 8px; color: #5b6470; margin-bottom: 3px; display: block;
  }

  /* Footer */
  .ds-print-root footer.doc-foot {
    margin-top: 6px; padding-top: 5px; border-top: 1px solid #c6ccd3;
    display: flex; justify-content: space-between;
    font-size: 8px; color: #8a929c; letter-spacing: .3px;
  }

  /* Print rules — force grayscale, hide screen shadows */
  @media print {
    .ds-print-root {
      position: static !important; left: 0 !important;
      filter: grayscale(100%);
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    .ds-print-root .sheet { padding: 8mm 9mm; }
    .ds-print-root thead { display: table-header-group; }
    .ds-print-root tr, .ds-print-root td, .ds-print-root th { page-break-inside: avoid; }
    .ds-print-root h2.section { page-break-after: avoid; }
  }
  @page { size: A4; margin: 0; }
`;
