"use client";

import { useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { useSession } from "next-auth/react";
import { ICashSlip } from "@/models/schemas/cashslip.schema";
import { IConfigResponse, PaymentMethod, CashSlipHook } from "./types";

export const useCashSlipLogic = (): CashSlipHook => {
  const [slips, setSlips] = useState<ICashSlip[]>([]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("");

  const [copyNumbers, setCopyNumbers] = useState<string[]>([]);
  const [selectedCopy, setSelectedCopy] = useState<string>("");
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>("");

  const [currentCopyNumber, setCurrentCopyNumber] = useState("");
  const [limit, setLimit] = useState<number>(20);
  const [newCopyNumber, setNewCopyNumber] = useState("");
  const [newUniquePrefix, setNewUniquePrefix] = useState("");
  const [newLimit, setNewLimit] = useState("");

  const [currentUsedCount, setCurrentUsedCount] = useState<number>(0);

  // ---------------- Loading / Error States ----------------
  const [configLoading, setConfigLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slipsLoading, setSlipsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // ---------------- Pagination ----------------
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(40);
  const [total, setTotal] = useState(0);

  // ---------------- Selected Slip & Print ----------------
  const [selectedSlip, setSelectedSlip] = useState<ICashSlip | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();
  const username = session?.user?.name || "";
  // ---------------- Printing ----------------
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    onAfterPrint: () => setSelectedSlip(null),
  });

  const triggerPrint = (slip: ICashSlip) => {
    setSelectedSlip(slip);
    setTimeout(() => handlePrint(), 100);
  };

  // ---------------- Helpers ----------------
  const clearForm = () => {
    setAmount("");
    setDescription("");
    setPaymentMethod("Cash");
    setSelectedSlot("");
  };

  // ---------------- Fetch Slips ----------------
  const fetchSlips = async (opts?: { page?: number; limit?: number }) => {
    const p = opts?.page ?? page;
    const l = opts?.limit ?? perPage;
    setSlipsLoading(true);
    try {
      const res = await fetch(`/api/cash-slips/fetchPagination?page=${p}&limit=${l}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load slips");

      setSlips(data.data || []);
      setTotal(data.total || 0);
      setPage(data.page || p);
      setPerPage(data.limit || l);
    } catch (err) {
      setError(err as string);
      setSlips([]);
    } finally {
      setSlipsLoading(false);
    }
  };

  // ---------------- Fetch Config ----------------
  const fetchConfig = async () => {
    setConfigLoading(true);
    try {
      const res = await fetch("/api/cash-slips/config");
      const data: IConfigResponse = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load configuration");

      setCurrentCopyNumber(data.currentCopyNumber);
      setLimit(data.limit || 20);
      setNewCopyNumber(data.currentCopyNumber);
      setNewUniquePrefix(data.uniqueNumberPrefix ?? "");
      setNewLimit(String(data.limit ?? 20));

      const available = data.availableCopyNumbers?.length
        ? data.availableCopyNumbers
        : [data.currentCopyNumber];
      setCopyNumbers(available);
      setSelectedCopy(available[0] || "");
    } catch (err) {
      setError(err as string);
    } finally {
      setConfigLoading(false);
    }
  };

  // ---------------- Load Slots ----------------
  const loadSlots = async (copy?: string) => {
    const copyToUse = copy ?? selectedCopy;
    if (!copyToUse) return;
    setSlotsLoading(true);
    try {
      const res = await fetch(`/api/cash-slips/slots?copy=${encodeURIComponent(copyToUse)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load slots");

      setAvailableSlots(data.availableSlots || []);
      if (data.copyNumbers) setCopyNumbers(data.copyNumbers);

      // 🆕 Update used count based on available slots
      const usedCount = (limit ?? 20) - (data.availableSlots?.length ?? 0);
      setCurrentUsedCount(usedCount);
    } catch (err) {
      setError(err as string);
    } finally {
      setSlotsLoading(false);
    }
  };

  // ---------------- Add Slip ----------------
  const addSlip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description || !selectedCopy || !selectedSlot) {
      setError("All fields including Copy Number and Unique Number are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/cash-slips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          copyNumber: selectedCopy,
          uniqueNumber: selectedSlot,
          amount: parseFloat(amount),
          description,
          paymentMethod,
          createdBy: username,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create slip.");

      clearForm();
      await fetchSlips({ page: 1, limit: perPage });
      await loadSlots(selectedCopy);
    } catch (err) {
      setError(err as string);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------- Update Config ----------------
  const updateSlipConfig = async () => {
    try {
      const res = await fetch("/api/cash-slips/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentCopyNumber: newCopyNumber,
          uniqueNumberPrefix: newUniquePrefix,
          start: 1,
          limit: parseInt(newLimit),
        }),
      });

      if (!res.ok) throw new Error("Failed to update configuration");

      await fetchConfig();
      await fetchSlips({ page: 1, limit: perPage });
    } catch (err) {
      setError(err as string);
    }
  };

  // ---------------- Delete Slip ----------------
  const deleteSlip = async (id: string) => {
    try {
      const res = await fetch(`/api/cash-slips/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete slip");

      await fetchSlips({ page, limit: perPage });
      await loadSlots(selectedCopy);
    } catch (err) {
      setError(err as string);
    }
  };

  // ---------------- Save Edit ----------------
  const saveEdit = async (
    id: string,
    payload: { amount: number; description: string; paymentMethod?: string }
  ) => {
    try {
      const res = await fetch(`/api/cash-slips/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update slip");

      await fetchSlips({ page, limit: perPage });
    } catch (err) {
      setError(err as string);
    }
  };

  // ---------------- Signed by CEO ----------------
  const handleSignedByCEOChange = async (id: string, signed: boolean) => {
    try {
      const res = await fetch(`/api/cash-slips/isSigned/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedByCEO: signed }),
      });

      if (!res.ok) throw new Error("Failed to update signed status");
      await fetchSlips({ page, limit: perPage });
    } catch (err) {
      setError(err as string);
    }
  };

  // ---------------- Effects ----------------
  useEffect(() => {
    fetchConfig();
    fetchSlips({ page: page, limit: perPage });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    if (selectedCopy) loadSlots(selectedCopy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCopy]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // ---------------- Return ----------------
  return {
    slips,
    error,
    amount,
    description,
    paymentMethod,
    copyNumbers,
    selectedCopy,
    availableSlots,
    selectedSlot,
    total,
    page,
    perPage,
    totalPages,
    isSubmitting,
    configLoading,
    slotsLoading,
    slipsLoading,
    currentCopyNumber,
    newCopyNumber,
    newUniquePrefix,
    newLimit,
    limit,
    selectedSlip,
    username,
    currentUsedCount,
    setCurrentUsedCount,
    setNewCopyNumber,
    setNewUniquePrefix,
    setNewLimit,
    setSelectedSlip,
    fetchSlips,
    fetchConfig,
    loadSlots,
    addSlip,
    deleteSlip,
    saveEdit,
    handleSignedByCEOChange,
    updateSlipConfig,
    clearForm,
    triggerPrint,
    setAmount,
    setDescription,
    setPaymentMethod,
    setSelectedCopy,
    setSelectedSlot,
    setPage,
    setPerPage,
  };
};
