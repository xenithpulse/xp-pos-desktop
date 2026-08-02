import React from "react";

const BusinessName = process.env.BUSINESS_NAME || "XENITHPULSE";

interface SlipEntry {
  copyNumber?: string;
  uniqueNumber?: string;
  amount?: number;
  description?: string;
  paymentMethod?: string;
}

interface DailyEntry {
  category?: string;
  description?: string;
  amount?: number;
  paymentMethod?: string;
}

interface DailySummary {
  date?: string;
  totalIncome: number;
  totalExpense: number;
  closingBalance: number;
  slipEntries?: SlipEntry[];
  entries?: DailyEntry[];
}

interface MonthlySheet {
  _id: string;
  monthLabel: string;
  startDate: string;
  endDate: string;
  openingBalance: number;
  closingBalance: number;
  totalIncome: number;
  totalExpense: number;
  isClosed: boolean;
  dailySummaries: DailySummary[];
  notes?: string;
}

interface MonthlyReportToPrintProps {
  data: MonthlySheet;
}

const MonthlyReportToPrint = React.forwardRef<HTMLDivElement, MonthlyReportToPrintProps>(
  ({ data }, ref) => {
    const formatCurrency = (amount: number): string => {
      return new Intl.NumberFormat("en-PK", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount);
    };

    const formatWithLabel = (amount: number): { value: string; label: string } => {
      const absNum = Math.abs(amount);
      if (absNum >= 10000000) {
        return { value: (amount / 10000000).toFixed(2), label: "Crore" };
      }
      if (absNum >= 100000) {
        return { value: (amount / 100000).toFixed(2), label: "Lakh" };
      }
      return { value: formatCurrency(amount), label: "" };
    };

    const formatDate = (dateStr: string): string => {
      return new Date(dateStr).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    };

    const formatDateShort = (dateStr: string): string => {
      return new Date(dateStr).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "short",
      });
    };

    const netChange = data.totalIncome - data.totalExpense;
    const netFormatted = formatWithLabel(netChange);

    return (
      <div ref={ref} className="bg-white text-black font-sans" style={{ fontSize: "11px" }}>
        <style type="text/css" media="print">
          {`
            @page { 
              size: A4; 
              margin: 12mm; 
            }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .avoid-break {
              page-break-inside: avoid;
            }
            .page-break {
              page-break-before: always;
            }
          `}
        </style>

        {/* HEADER */}
        <header className="pb-4 mb-4" style={{ borderBottom: "2px solid #000" }}>
          <div className="flex justify-between items-start">
            <div>
              <h1 style={{ fontSize: "20px", fontWeight: 800, letterSpacing: "-0.5px", lineHeight: 1.2 }}>
                MONTHLY FINANCIAL REPORT
              </h1>
              <h2 style={{ fontSize: "14px", fontWeight: 600, color: "#444", marginTop: "4px" }}>
                {data.monthLabel}
              </h2>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ 
                display: "inline-block",
                padding: "4px 10px", 
                fontSize: "9px", 
                fontWeight: 700,
                borderRadius: "4px",
                backgroundColor: data.isClosed ? "#dcfce7" : "#fef9c3",
                color: data.isClosed ? "#166534" : "#854d0e"
              }}>
                {data.isClosed ? "CLOSED" : "OPEN"}
              </div>
              <p style={{ fontSize: "9px", color: "#666", marginTop: "6px" }}>
                Generated: {new Date().toLocaleDateString("en-GB")}
              </p>
            </div>
          </div>
          <p style={{ fontSize: "10px", color: "#666", marginTop: "8px" }}>
            Period: {formatDate(data.startDate)} - {formatDate(data.endDate)}
          </p>
        </header>

        {/* EXECUTIVE SUMMARY */}
        <section className="avoid-break" style={{ marginBottom: "20px" }}>
          <h3 style={{ fontSize: "11px", fontWeight: 700, marginBottom: "10px", paddingBottom: "4px", borderBottom: "1px solid #e5e5e5" }}>
            EXECUTIVE SUMMARY
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px" }}>
            {/* Opening */}
            <div style={{ padding: "10px", backgroundColor: "#f9fafb", borderRadius: "6px", border: "1px solid #e5e5e5", textAlign: "center" }}>
              <p style={{ fontSize: "8px", color: "#666", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.5px" }}>Opening</p>
              <p style={{ fontSize: "12px", fontWeight: 800, marginTop: "4px", letterSpacing: "-0.3px" }}>
                {formatCurrency(data.openingBalance)}
              </p>
            </div>

            {/* Income */}
            <div style={{ padding: "10px", backgroundColor: "#f0fdf4", borderRadius: "6px", border: "1px solid #bbf7d0", textAlign: "center" }}>
              <p style={{ fontSize: "8px", color: "#166534", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.5px" }}>Income</p>
              <p style={{ fontSize: "12px", fontWeight: 800, marginTop: "4px", color: "#166534", letterSpacing: "-0.3px" }}>
                +{formatCurrency(data.totalIncome)}
              </p>
            </div>

            {/* Expense */}
            <div style={{ padding: "10px", backgroundColor: "#fef2f2", borderRadius: "6px", border: "1px solid #fecaca", textAlign: "center" }}>
              <p style={{ fontSize: "8px", color: "#991b1b", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.5px" }}>Expense</p>
              <p style={{ fontSize: "12px", fontWeight: 800, marginTop: "4px", color: "#991b1b", letterSpacing: "-0.3px" }}>
                -{formatCurrency(data.totalExpense)}
              </p>
            </div>

            {/* Net */}
            <div style={{ 
              padding: "10px", 
              backgroundColor: netChange >= 0 ? "#ecfdf5" : "#fff7ed", 
              borderRadius: "6px", 
              border: `1px solid ${netChange >= 0 ? "#a7f3d0" : "#fed7aa"}`,
              textAlign: "center" 
            }}>
              <p style={{ fontSize: "8px", color: netChange >= 0 ? "#047857" : "#c2410c", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.5px" }}>
                Net {netFormatted.label && `(${netFormatted.label})`}
              </p>
              <p style={{ fontSize: "12px", fontWeight: 800, marginTop: "4px", color: netChange >= 0 ? "#047857" : "#c2410c", letterSpacing: "-0.3px" }}>
                {netChange >= 0 ? "+" : ""}{netFormatted.label ? netFormatted.value : formatCurrency(netChange)}
              </p>
            </div>

            {/* Closing */}
            <div style={{ padding: "10px", backgroundColor: "#18181b", borderRadius: "6px", textAlign: "center" }}>
              <p style={{ fontSize: "8px", color: "#a1a1aa", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.5px" }}>Closing</p>
              <p style={{ fontSize: "12px", fontWeight: 800, marginTop: "4px", color: "#fff", letterSpacing: "-0.3px" }}>
                {formatCurrency(data.closingBalance)}
              </p>
            </div>
          </div>
        </section>

        {/* DAILY TRANSACTIONS */}
        <section>
          <h3 style={{ fontSize: "11px", fontWeight: 700, marginBottom: "10px", paddingBottom: "4px", borderBottom: "1px solid #e5e5e5" }}>
            DAILY TRANSACTION LOG ({data.dailySummaries.length} Days)
          </h3>

          {data.dailySummaries.map((day, i) => {
            const dayNet = day.totalIncome - day.totalExpense;
            
            return (
              <div key={i} className="avoid-break" style={{ marginBottom: "12px", border: "1px solid #e5e5e5", borderRadius: "6px", overflow: "hidden" }}>
                {/* Day Header */}
                <div style={{ 
                  backgroundColor: "#f9fafb", 
                  padding: "8px 12px", 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "center",
                  borderBottom: "1px solid #e5e5e5"
                }}>
                  <span style={{ fontWeight: 700, fontSize: "11px" }}>
                    {day.date ? formatDateShort(day.date) : `Day ${i + 1}`}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "10px" }}>
                    <span style={{ color: "#166534", fontWeight: 600 }}>+{formatCurrency(day.totalIncome)}</span>
                    <span style={{ color: "#991b1b", fontWeight: 600 }}>-{formatCurrency(day.totalExpense)}</span>
                    <span style={{ 
                      fontWeight: 700, 
                      padding: "2px 8px", 
                      borderRadius: "4px",
                      backgroundColor: dayNet >= 0 ? "#dcfce7" : "#fef2f2",
                      color: dayNet >= 0 ? "#166534" : "#991b1b"
                    }}>
                      Net: {dayNet >= 0 ? "+" : ""}{formatCurrency(dayNet)}
                    </span>
                  </div>
                </div>

                <div style={{ padding: "10px 12px" }}>
                  {/* Slip Entries */}
                  {day.slipEntries && day.slipEntries.length > 0 && (
                    <div style={{ marginBottom: "10px" }}>
                      <p style={{ fontSize: "9px", fontWeight: 700, color: "#166534", textTransform: "uppercase", marginBottom: "6px", letterSpacing: "0.5px" }}>
                        Cash Receipts ({day.slipEntries.length})
                      </p>
                      <table style={{ width: "100%", fontSize: "10px", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #e5e5e5" }}>
                            <th style={{ textAlign: "left", padding: "4px 0", fontWeight: 600, color: "#666", width: "80px" }}>Slip #</th>
                            <th style={{ textAlign: "left", padding: "4px 0", fontWeight: 600, color: "#666" }}>Description</th>
                            <th style={{ textAlign: "right", padding: "4px 0", fontWeight: 600, color: "#666", width: "100px" }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {day.slipEntries.map((slip, j) => (
                            <tr key={j} style={{ borderBottom: "1px solid #f3f4f6" }}>
                              <td style={{ padding: "4px 0", fontFamily: "monospace", fontSize: "9px" }}>
                                {slip.copyNumber || "-"}/{slip.uniqueNumber || "-"}
                              </td>
                              <td style={{ padding: "4px 0", color: "#444" }}>{slip.description || "-"}</td>
                              <td style={{ padding: "4px 0", textAlign: "right", fontWeight: 600, color: "#166534" }}>
                                {formatCurrency(slip.amount || 0)}{slip.paymentMethod ? ` (${slip.paymentMethod})` : ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Expense Entries */}
                  {day.entries && day.entries.length > 0 && (
                    <div>
                      <p style={{ fontSize: "9px", fontWeight: 700, color: "#991b1b", textTransform: "uppercase", marginBottom: "6px", letterSpacing: "0.5px" }}>
                        Expenses ({day.entries.length})
                      </p>
                      <table style={{ width: "100%", fontSize: "10px", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #e5e5e5" }}>
                            <th style={{ textAlign: "left", padding: "4px 0", fontWeight: 600, color: "#666", width: "100px" }}>Category</th>
                            <th style={{ textAlign: "left", padding: "4px 0", fontWeight: 600, color: "#666" }}>Description</th>
                            <th style={{ textAlign: "right", padding: "4px 0", fontWeight: 600, color: "#666", width: "100px" }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {day.entries.map((entry, k) => (
                            <tr key={k} style={{ borderBottom: "1px solid #f3f4f6" }}>
                              <td style={{ padding: "4px 0", color: "#666", textTransform: "capitalize" }}>
                                {entry.category?.replace(/_/g, " ") || "-"}
                              </td>
                              <td style={{ padding: "4px 0", color: "#444" }}>{entry.description || "-"}</td>
                              <td style={{ padding: "4px 0", textAlign: "right", fontWeight: 600, color: "#991b1b" }}>
                                {formatCurrency(entry.amount || 0)}{entry.paymentMethod ? ` (${entry.paymentMethod})` : ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Empty State */}
                  {(!day.slipEntries || day.slipEntries.length === 0) &&
                    (!day.entries || day.entries.length === 0) && (
                      <p style={{ textAlign: "center", color: "#9ca3af", fontSize: "10px", padding: "12px 0", fontStyle: "italic" }}>
                        No transactions recorded
                      </p>
                    )}
                </div>
              </div>
            );
          })}
        </section>

        {/* FOOTER */}
        <footer style={{ marginTop: "20px", paddingTop: "10px", borderTop: "2px solid #000", textAlign: "center", fontSize: "9px", color: "#666" }}>
          <p>Report ID: <span style={{ fontFamily: "monospace" }}>{data._id}</span></p>
          <p style={{ marginTop: "4px" }}>
            Generated on {new Date().toLocaleString("en-GB")} - {BusinessName} Financial System
          </p>
        </footer>
      </div>
    );
  }
);

MonthlyReportToPrint.displayName = "MonthlyReportToPrint";
export default MonthlyReportToPrint;
