"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import type {
  IntegrityCheckState,
  DailyValidationResult,
  RepairAudit,
  ValidationStatus,
} from "./types";

interface UseIntegrityCheckOptions {
  monthLabel: string;
}

interface UseIntegrityCheckReturn extends IntegrityCheckState {
  startValidation: () => void;
  stopValidation: () => void;
  selectDay: (day: DailyValidationResult | null) => void;
  runRepair: (dryRun: boolean) => Promise<void>;
  reset: () => void;
  failedDays: DailyValidationResult[];
  passedDays: DailyValidationResult[];
  hasIssues: boolean;
}

export function useIntegrityCheck({ monthLabel }: UseIntegrityCheckOptions): UseIntegrityCheckReturn {
  const [status, setStatus] = useState<ValidationStatus>("IDLE");
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [dailyResults, setDailyResults] = useState<DailyValidationResult[]>([]);
  const [selectedDay, setSelectedDay] = useState<DailyValidationResult | null>(null);
  const [audit, setAudit] = useState<RepairAudit | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);

  const startValidation = useCallback(() => {
    if (!monthLabel) return;

    // Reset state
    setStatus("RUNNING");
    setDailyResults([]);
    setSelectedDay(null);
    setAudit(null);
    setProgress(0);
    setTotal(0);
    setError(null);

    // Close existing EventSource
    esRef.current?.close();

    const es = new EventSource(`/api/monthly-sheets/validate?monthLabel=${encodeURIComponent(monthLabel)}`);
    esRef.current = es;

    es.addEventListener("daily-progress", (e) => {
      try {
        const payload = JSON.parse(e.data) as DailyValidationResult & { index: number; total: number };
        setDailyResults((prev) => [payload, ...prev]);
        setProgress(payload.index);
        setTotal(payload.total);
      } catch (err) {
        console.error("Failed to parse daily-progress:", err);
      }
    });

    es.addEventListener("done", (e) => {
      try {
        const { status: finalStatus } = JSON.parse(e.data);
        setStatus(finalStatus as ValidationStatus);
      } catch {
        setStatus("PASSED");
      }
      es.close();
    });

    es.addEventListener("error", (e) => {
      try {
        const data = JSON.parse((e as any).data || "{}");
        setError(data.message || "Validation failed");
      } catch {
        setError("Validation connection failed");
      }
      setStatus("ERROR");
      es.close();
    });

    es.onerror = () => {
      setStatus("ERROR");
      setError("Connection to validation stream lost");
      es.close();
    };
  }, [monthLabel]);

  const stopValidation = useCallback(() => {
    esRef.current?.close();
    setStatus("IDLE");
  }, []);

  const selectDay = useCallback((day: DailyValidationResult | null) => {
    setSelectedDay(day);
  }, []);

  const runRepair = useCallback(async (dryRun: boolean) => {
    if (!monthLabel) return;

    setRepairing(true);
    setError(null);

    try {
      const res = await fetch("/api/monthly-sheets/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthLabel, dryRun }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        setError(err.message || "Repair failed");
        setAudit(null);
        return;
      }

      const data = (await res.json()) as RepairAudit;
      setAudit(data);

      // If not a dry run and successful, refresh validation
      if (!dryRun) {
        // Re-validate after repair
        setTimeout(() => startValidation(), 500);
      }
    } catch (e) {
      console.error("Repair error:", e);
      setError(e instanceof Error ? e.message : "Repair request failed");
    } finally {
      setRepairing(false);
    }
  }, [monthLabel, startValidation]);

  const reset = useCallback(() => {
    esRef.current?.close();
    setStatus("IDLE");
    setProgress(0);
    setTotal(0);
    setDailyResults([]);
    setSelectedDay(null);
    setAudit(null);
    setRepairing(false);
    setError(null);
  }, []);

  // Computed values
  const failedDays = useMemo(
    () => dailyResults.filter((d) => d.rules.some((r) => !r.passed)),
    [dailyResults]
  );

  const passedDays = useMemo(
    () => dailyResults.filter((d) => d.rules.every((r) => r.passed)),
    [dailyResults]
  );

  const hasIssues = useMemo(
    () => failedDays.length > 0 || (audit?.dailyAudits?.length ?? 0) > 0,
    [failedDays, audit]
  );

  return {
    status,
    progress,
    total,
    dailyResults,
    selectedDay,
    audit,
    repairing,
    error,
    startValidation,
    stopValidation,
    selectDay,
    runRepair,
    reset,
    failedDays,
    passedDays,
    hasIssues,
  };
}
