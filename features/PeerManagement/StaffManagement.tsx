"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import StaffPaymentHistoryDrawer from "./StaffPaymentHistoryDrawer";

const IconSearch = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
);
const IconUsers = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><path d="M20 8v6M23 11h-6"/></svg>
);
const IconPlus = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
);
const IconEdit = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
);
const IconTrash = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
);
const IconHistory = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v10l4 4"></path><path d="M22 12A10 10 0 1 0 12 2v10z"></path></svg>
);
const IconDollarSign = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
);
const IconArrowUpRight = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17l10-10M7 7h10v10"/></svg>
);
const IconCheck = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
);
const IconRefresh = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
);
const IconDownload = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
);
const IconHelp = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
);
const IconSquare = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
);
const IconCheckSquare = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
);


interface IPayment {
  _id: string;
  type: "advance" | "partial" | "salary" | "advance_deduction";
  amount: number;
  date: string;
  note?: string;
  cycleMonth?: number;
  effectiveSalary?: number;
}

interface IStaff {
  _id: string;
  name: string;
  jobTitle: string;
  salary: number;
  salaryDueDate: string;
  isSalaryPaid: boolean;
  advanceSalary?: number;
  advanceDeducted?: number;
  totalPaid?: number; // current cycle total paid (API-provided)
  totalPaidToDate?: number;
  remainingSalary?: number;
  pendingAdvance?: number;
  // API-provided effective salary fields
  effectiveSalary?: number;
  salaryMultiplier?: number;
  monthsOverdue?: number;
  effectiveRemaining?: number;
  remarks?: string;
  payments?: IPayment[];
}

// Utility function to format currency (assuming PKR)
const formatCurrency = (amount: number): string => {
  return `PKR ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
};

// Calculate days until due or overdue days
const getDueDaysInfo = (dueDate: string): { days: number; isOverdue: boolean; label: string; monthsOverdue: number } => {
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  
  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  // Calculate months overdue (salary cycles are monthly)
  const monthsOverdue = diffDays < 0 ? Math.floor(Math.abs(diffDays) / 30) + 1 : 0;
  
  if (diffDays < 0) {
    const label = monthsOverdue > 1 
      ? `${monthsOverdue} months overdue (${Math.abs(diffDays)} days)` 
      : `${Math.abs(diffDays)} days overdue`;
    return { days: Math.abs(diffDays), isOverdue: true, label, monthsOverdue };
  } else if (diffDays === 0) {
    return { days: 0, isOverdue: false, label: "Due today", monthsOverdue: 0 };
  } else if (diffDays <= 7) {
    return { days: diffDays, isOverdue: false, label: `Due in ${diffDays} days`, monthsOverdue: 0 };
  }
  return { days: diffDays, isOverdue: false, label: `Due in ${diffDays} days`, monthsOverdue: 0 };
};

// Calculate effective salary based on months overdue
const getEffectiveSalary = (baseSalary: number, dueDate: string): { effectiveSalary: number; multiplier: number } => {
  const { monthsOverdue } = getDueDaysInfo(dueDate);
  const multiplier = Math.max(1, monthsOverdue);
  return { effectiveSalary: baseSalary * multiplier, multiplier };
};

export default function StaffPage() {
  // --- State Hooks ---
  const [activeTab, setActiveTab] = useState<"list" | "form">("list");
  const [staffList, setStaffList] = useState<IStaff[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [formData, setFormData] = useState({
    name: "",
    jobTitle: "",
    salary: "",
    salaryDueDate: "",
  });

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<IStaff | null>(null);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [isAdvance, setIsAdvance] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkSettling, setIsBulkSettling] = useState(false);
  const [showHelpTooltip, setShowHelpTooltip] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // --- Toast Logic ---
  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  // -------------------- Fetch Staff --------------------
  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/staff");
      const data: IStaff[] = await res.json();

      // API now provides effectiveSalary, salaryMultiplier, monthsOverdue, effectiveRemaining, pendingAdvance
      // We just need to calculate local display values
      const processedData = data.map((s) => {
        const advance =
          s.payments?.filter((p) => p.type === "advance").reduce((sum, p) => sum + p.amount, 0) || 0;
        const advanceDeducted =
          s.payments?.filter((p) => p.type === "advance_deduction").reduce((sum, p) => sum + p.amount, 0) || 0;
        
        return {
          ...s,
          advanceSalary: advance,
          advanceDeducted,
          // Use API-provided values if available, otherwise calculate
          totalPaid: s.totalPaid || 0, // Current cycle payments
          totalPaidToDate: s.totalPaidToDate || 0, // Lifetime total
          remainingSalary: s.remainingSalary || 0,
          effectiveSalary: s.effectiveSalary || s.salary,
          salaryMultiplier: s.salaryMultiplier || 1,
          monthsOverdue: s.monthsOverdue || 0,
          effectiveRemaining: s.effectiveRemaining || s.remainingSalary || 0,
          pendingAdvance: s.pendingAdvance || 0,
        };
      });

      setStaffList(processedData);
    } catch {
      showToast("Failed to fetch staff list", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (activeTab === "list") fetchStaff();
  }, [activeTab, fetchStaff]);

  // -------------------- Stats Summary --------------------
  const stats = useMemo(() => {
    const totalStaff = staffList.length;
    const totalSalaryBudget = staffList.reduce((sum, s) => sum + s.salary, 0);
    const totalPaid = staffList.reduce((sum, s) => sum + (s.totalPaidToDate || 0), 0);
    const totalRemaining = staffList.reduce((sum, s) => sum + (s.remainingSalary || 0), 0);
    const overdueCount = staffList.filter((s) => {
      const remaining = s.remainingSalary || 0;
      return remaining > 0 && new Date(s.salaryDueDate) < new Date(new Date().toDateString());
    }).length;
    const settledCount = staffList.filter((s) => (s.remainingSalary || 0) === 0).length;

    return { totalStaff, totalSalaryBudget, totalPaid, totalRemaining, overdueCount, settledCount };
  }, [staffList]);

  // -------------------- Add / Edit / Delete Staff --------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = editingStaffId ? "PUT" : "POST";
    const url = editingStaffId ? `/api/staff/${editingStaffId}` : "/api/staff";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error("Failed to save staff");

      showToast(
        editingStaffId ? "Staff updated successfully!" : "Staff added successfully!"
      );
      setFormData({ name: "", jobTitle: "", salary: "", salaryDueDate: "" });
      setEditingStaffId(null);
      setActiveTab("list");
      fetchStaff();
    } catch {
      showToast(`Failed to save staff`, "error");
    }
  };

  const handleEdit = (staff: IStaff) => {
    setFormData({
      name: staff.name,
      jobTitle: staff.jobTitle,
      salary: staff.salary.toString(),
      salaryDueDate: staff.salaryDueDate.split("T")[0],
    });
    setEditingStaffId(staff._id);
    setActiveTab("form");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Confirm deletion of this staff member? All payment history will be lost.")) return;
    setProcessingId(id);
    try {
      const res = await fetch(`/api/staff/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchStaff();
        showToast("Staff deleted successfully!");
      } else {
        throw new Error("API error.");
      }
    } catch {
      showToast("Failed to delete staff", "error");
    } finally {
      setProcessingId(null);
    }
  };

  // -------------------- Payment Handling --------------------
  const handlePaymentSubmit = async () => {
    if (!selectedStaff || !paymentAmount || Number(paymentAmount) <= 0) {
      showToast("Enter a valid amount.", "error");
      return;
    }

    setIsSubmittingPayment(true);
    const payload = {
      amount: Number(paymentAmount),
      type: isAdvance ? "advance" : "partial",
      note: remarks,
    };

    try {
      const res = await fetch(`/api/staff/${selectedStaff._id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to record payment");
      
      const data = await res.json();
      const cyclesAdvanced = data.cyclesAdvanced || 0;

      const message = isAdvance
        ? `Advance of ${formatCurrency(Number(paymentAmount))} recorded.`
        : cyclesAdvanced > 0
          ? `Payment of ${formatCurrency(Number(paymentAmount))} recorded. ${cyclesAdvanced} cycle(s) settled!`
          : `Payment of ${formatCurrency(Number(paymentAmount))} recorded.`;
      
      showToast(message);
      setShowPaymentModal(false);
      setPaymentAmount("");
      setRemarks("");
      setIsAdvance(false);
      fetchStaff();
    } catch {
      showToast("Failed to record payment", "error");
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // -------------------- Mark as Fully Paid & Roll to Next Cycle --------------------
  const handleMarkAsPaid = async (staff: IStaff) => {
    const effectiveRemaining = staff.effectiveRemaining || 0;
    const monthsOverdue = staff.monthsOverdue || 0;
    
    if (effectiveRemaining === 0) {
      showToast("Staff salary is already settled.", "error");
      return;
    }

    const cycleText = monthsOverdue > 1 ? `${monthsOverdue} months` : "the current cycle";
    const confirmMsg = `This will settle the remaining ${formatCurrency(effectiveRemaining)} (for ${cycleText}) and advance ${staff.name} to the next cycle. Continue?`;
    if (!confirm(confirmMsg)) return;

    setProcessingId(staff._id);
    try {
      const res = await fetch(`/api/staff/${staff._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markSalaryPaid: true }),
      });

      if (!res.ok) throw new Error("Failed to mark as paid");
      
      const data = await res.json();
      const cyclesSettled = data.settlement?.cyclesSettled || 1;

      showToast(`${staff.name}'s salary settled! ${cyclesSettled} cycle(s) advanced.`);
      fetchStaff();
    } catch {
      showToast("Failed to mark salary as paid", "error");
    } finally {
      setProcessingId(null);
    }
  };

  // -------------------- Export to CSV --------------------
  const exportToCSV = () => {
    const headers = ["Name", "Job Title", "Salary", "Advance", "Total Paid", "Remaining", "Due Date", "Status"];
    const rows = filteredStaff.map((s) => {
      const remaining = s.remainingSalary || 0;
      const isPaid = remaining === 0;
      const isOverdue = !isPaid && new Date(s.salaryDueDate) < new Date(new Date().toDateString());
      const status = isPaid ? "Settled" : isOverdue ? "Overdue" : "Pending";
      return [
        s.name,
        s.jobTitle,
        s.salary,
        s.advanceSalary || 0,
        s.totalPaidToDate || 0,
        remaining,
        new Date(s.salaryDueDate).toLocaleDateString(),
        status,
      ];
    });

    const csvContent = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `staff-payroll-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("CSV exported successfully!");
  };

  // -------------------- Filtering & Status Logic --------------------
  const filteredStaff = useMemo(() => {
    const filtered = staffList.filter((s) => {
      const matchText =
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.jobTitle.toLowerCase().includes(searchTerm.toLowerCase());
      
      const isPaid = (s.remainingSalary || 0) === 0;
      const isOverdue =
        !isPaid && new Date(s.salaryDueDate) < new Date(new Date().toDateString());
      
      const status = isPaid ? "paid" : isOverdue ? "overdue" : "pending";

      return matchText && (filterStatus === "all" || filterStatus === status);
    });

    // Sort: Overdue first, then by due date ascending, then settled last
    return filtered.sort((a, b) => {
      const aRemaining = a.remainingSalary || 0;
      const bRemaining = b.remainingSalary || 0;
      const aIsPaid = aRemaining === 0;
      const bIsPaid = bRemaining === 0;
      const aIsOverdue = !aIsPaid && new Date(a.salaryDueDate) < new Date(new Date().toDateString());
      const bIsOverdue = !bIsPaid && new Date(b.salaryDueDate) < new Date(new Date().toDateString());

      // Overdue comes first
      if (aIsOverdue && !bIsOverdue) return -1;
      if (!aIsOverdue && bIsOverdue) return 1;
      
      // Settled comes last
      if (aIsPaid && !bIsPaid) return 1;
      if (!aIsPaid && bIsPaid) return -1;
      
      // Among same status, sort by due date
      return new Date(a.salaryDueDate).getTime() - new Date(b.salaryDueDate).getTime();
    });
  }, [staffList, searchTerm, filterStatus]);

  // Staff that can be settled (have remaining balance)
  const settlableStaff = useMemo(() => {
    return filteredStaff.filter((s) => (s.remainingSalary || 0) > 0);
  }, [filteredStaff]);

  // Check if all settlable staff are selected
  const allSettlableSelected = useMemo(() => {
    return settlableStaff.length > 0 && settlableStaff.every((s) => selectedIds.has(s._id));
  }, [settlableStaff, selectedIds]);

  // Toggle selection for a single staff
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle all settlable staff
  const toggleSelectAll = () => {
    if (allSettlableSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(settlableStaff.map((s) => s._id)));
    }
  };

  // Bulk settle selected staff
  const handleBulkSettle = async () => {
    if (selectedIds.size === 0) {
      showToast("No staff selected for settlement.", "error");
      return;
    }

    const selectedStaffList = staffList.filter((s) => selectedIds.has(s._id) && (s.effectiveRemaining || 0) > 0);
    
    // Use API-provided effective salary data
    const totalAmount = selectedStaffList.reduce((sum, s) => {
      return sum + (s.effectiveRemaining || 0);
    }, 0);
    
    const totalPendingAdvance = selectedStaffList.reduce((sum, s) => {
      return sum + (s.pendingAdvance || 0);
    }, 0);

    let confirmMsg = `This will settle ${selectedStaffList.length} staff members with a total payment of ${formatCurrency(totalAmount)}`;
    if (totalPendingAdvance > 0) {
      confirmMsg += ` (includes ${formatCurrency(totalPendingAdvance)} pending advance to be deducted)`;
    }
    confirmMsg += ` and roll them to the next cycle. Continue?`;
    
    if (!confirm(confirmMsg)) return;

    setIsBulkSettling(true);
    let successCount = 0;
    let failCount = 0;
    let totalAdvanceDeducted = 0;

    for (const staff of selectedStaffList) {
      try {
        const res = await fetch(`/api/staff/${staff._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markSalaryPaid: true }),
        });
        if (res.ok) {
          const result = await res.json();
          successCount++;
          if (result.settlement?.advanceDeducted) {
            totalAdvanceDeducted += result.settlement.advanceDeducted;
          }
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    setIsBulkSettling(false);
    setSelectedIds(new Set());
    fetchStaff();

    if (failCount === 0) {
      let msg = `Successfully settled ${successCount} staff members!`;
      if (totalAdvanceDeducted > 0) {
        msg += ` (${formatCurrency(totalAdvanceDeducted)} advance deducted)`;
      }
      showToast(msg);
    } else {
      showToast(`Settled ${successCount} staff, ${failCount} failed.`, "error");
    }
  };

  const getStatusBadge = (staff: IStaff) => {
    const remaining = staff.effectiveRemaining || 0;
    const isPaid = remaining === 0;
    const monthsOverdue = staff.monthsOverdue || 0;

    const badgeClasses = "inline-flex items-center px-2 py-0.5 text-xs font-semibold uppercase tracking-wide border rounded-sm";

    if (isPaid) {
      return (
        <span className={`${badgeClasses} text-green-600 border-green-600`}>
          Settled
        </span>
      );
    }
    if (monthsOverdue > 0) {
      return (
        <span className={`${badgeClasses} text-red-600 border-red-600 animate-pulse`}>
          {monthsOverdue > 1 ? `${monthsOverdue}M OVERDUE` : "OVERDUE"}
        </span>
      );
    }
    const dueInfo = getDueDaysInfo(staff.salaryDueDate);
    if (dueInfo.days <= 3) {
      return (
        <span className={`${badgeClasses} text-amber-600 border-amber-600`}>
          Due Soon
        </span>
      );
    }
    return (
      <span className={`${badgeClasses} text-gray-700 border-gray-400`}>
        Pending
      </span>
    );
  };

  // -------------------- UI Rendering --------------------
  return (
    <div className="bg-transparent min-h-screen text-gray-900 font-mono">
      <div className="border border-gray-900 rounded-sm overflow-hidden bg-transparent">
        
        {/* Toast Notification System */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className={`fixed top-4 right-4 p-3 border rounded-sm text-sm z-50 flex items-center gap-2 ${
                toast.type === "success"
                  ? "bg-green-600 border-green-700 text-white"
                  : "bg-red-600 border-red-700 text-white"
              }`}
            >
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>

        <header className="px-6 py-4 border-b border-gray-900 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold uppercase flex items-center gap-3">
                <IconUsers className="w-5 h-5" />
                STAFF PAYROLL TRACKER
              </h1>
              
              {/* Help Icon with Tooltip */}
              <div 
                className="relative"
                onMouseEnter={() => setShowHelpTooltip(true)}
                onMouseLeave={() => setShowHelpTooltip(false)}
              >
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <IconHelp />
                </motion.button>
                
                <AnimatePresence>
                  {showHelpTooltip && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-0 top-full mt-2 w-80 bg-gray-900 text-white text-xs p-4 rounded-sm shadow-xl z-50 border border-gray-700"
                    >
                      <h3 className="font-bold text-sm mb-2 text-green-400 uppercase">Usage Guide</h3>
                      <ul className="space-y-2 text-gray-300">
                        <li><span className="text-white font-semibold">Pay:</span> Record partial salary payment</li>
                        <li><span className="text-white font-semibold">Advance:</span> Give advance before due date</li>
                        <li><span className="text-white font-semibold">Settle:</span> Pay remaining & roll to next cycle</li>
                        <li><span className="text-white font-semibold">Bulk Settle:</span> Select multiple staff using checkboxes, then click &quot;Settle Selected&quot;</li>
                        <li><span className="text-white font-semibold">History:</span> View all payment transactions</li>
                      </ul>
                      <div className="mt-3 pt-2 border-t border-gray-700">
                        <p className="text-amber-400"><strong>Note:</strong> If salary is overdue by 2+ months, the effective salary is multiplied accordingly.</p>
                      </div>
                      <div className="absolute -top-1.5 left-4 w-3 h-3 bg-gray-900 border-l border-t border-gray-700 transform rotate-45"></div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              {/* Bulk Settle Button - only show when items are selected */}
              {selectedIds.size > 0 && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ opacity: 0.9 }}
                  whileTap={{ scale: 0.98 }}
                  className="text-xs font-semibold px-3 py-1.5 bg-blue-600 text-white border border-blue-600 rounded-sm flex items-center gap-1 transition-opacity hover:bg-blue-700 disabled:opacity-50"
                  onClick={handleBulkSettle}
                  disabled={isBulkSettling}
                >
                  {isBulkSettling ? (
                    <>
                      <span className="animate-spin">⟳</span>
                      SETTLING...
                    </>
                  ) : (
                    <>
                      <IconCheck />
                      SETTLE SELECTED ({selectedIds.size})
                    </>
                  )}
                </motion.button>
              )}

              {/* Refresh Button */}
              <motion.button
                whileHover={{ opacity: 0.8 }}
                whileTap={{ scale: 0.98 }}
                className="text-xs font-semibold px-3 py-1.5 border border-gray-400 rounded-sm flex items-center gap-1 transition-opacity hover:bg-gray-100"
                onClick={fetchStaff}
                disabled={loading}
              >
                <IconRefresh className={loading ? "animate-spin" : ""} />
                {loading ? "LOADING..." : "REFRESH"}
              </motion.button>

              {/* Export CSV */}
              <motion.button
                whileHover={{ opacity: 0.8 }}
                whileTap={{ scale: 0.98 }}
                className="text-xs font-semibold px-3 py-1.5 border border-gray-400 rounded-sm flex items-center gap-1 transition-opacity hover:bg-gray-100"
                onClick={exportToCSV}
                disabled={staffList.length === 0}
              >
                <IconDownload />
                EXPORT
              </motion.button>

              {/* New Staff Button */}
              <motion.button
                  whileHover={{ opacity: 0.8 }}
                  whileTap={{ scale: 0.98 }}
                  className="text-xs font-semibold px-3 py-1.5 border border-gray-900 rounded-sm flex items-center gap-1 transition-opacity hover:bg-gray-200"
                  onClick={() => {
                      setEditingStaffId(null);
                      setFormData({ name: "", jobTitle: "", salary: "", salaryDueDate: "" });
                      setActiveTab("form");
                  }}
              >
                  <IconPlus />
                  NEW RECORD
              </motion.button>
            </div>
        </header>

        {/* Stats Summary */}
        {activeTab === "list" && staffList.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 p-4 bg-gray-50 border-b border-gray-900">
            <div className="text-center p-3 border border-gray-300 rounded-sm bg-white">
              <div className="text-2xl font-bold">{stats.totalStaff}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Total Staff</div>
            </div>
            <div className="text-center p-3 border border-gray-300 rounded-sm bg-white">
              <div className="text-2xl font-bold text-gray-800">{formatCurrency(stats.totalSalaryBudget)}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Monthly Budget</div>
            </div>
            <div className="text-center p-3 border border-gray-300 rounded-sm bg-white">
              <div className="text-2xl font-bold text-green-600">{formatCurrency(stats.totalPaid)}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Total Paid</div>
            </div>
            <div className="text-center p-3 border border-gray-300 rounded-sm bg-white">
              <div className="text-2xl font-bold text-red-600">{formatCurrency(stats.totalRemaining)}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Remaining</div>
            </div>
            <div className="text-center p-3 border border-gray-300 rounded-sm bg-white">
              <div className="text-2xl font-bold text-green-600">{stats.settledCount}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Settled</div>
            </div>
            <div className="text-center p-3 border border-gray-300 rounded-sm bg-white">
              <div className={`text-2xl font-bold ${stats.overdueCount > 0 ? "text-red-600 animate-pulse" : "text-gray-600"}`}>
                {stats.overdueCount}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Overdue</div>
            </div>
          </div>
        )}

        {/* --- Tab Navigation --- */}
        <div className="flex border-b border-gray-900">
            {["list", "form"].map((tab) => (
                <motion.button
                    key={tab}
                    whileTap={{ scale: 0.99 }}
                    className={`py-2 px-6 text-sm font-semibold uppercase tracking-wider transition-all duration-200 border-r border-gray-900 ${
                        activeTab === tab
                            ? "bg-gray-900 text-white"
                            : "text-gray-900 hover:bg-gray-100"
                    }`}
                    onClick={() => setActiveTab(tab as "list" | "form")}
                >
                    {tab === "list" ? "Directory" : editingStaffId ? "Edit Staff" : "Add Staff"}
                </motion.button>
            ))}
        </div>

        {/* -------------------- Tab Content Area -------------------- */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            {/* -------------------- Staff List Tab Content -------------------- */}
            {activeTab === "list" && (
              <motion.div
                key="list"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {/* --- Control Bar: Search & Filter --- */}
                <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-6">
                  {/* Search */}
                  <div className="relative w-full md:w-1/3">
                    <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Search name/title..."
                      className="w-full border border-gray-900 pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-green-600 bg-transparent"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  {/* Filter */}
                  <div className="flex gap-3 items-center">
                    <label htmlFor="status-filter" className="text-sm font-medium">
                      STATUS FILTER:
                    </label>
                    <select
                      id="status-filter"
                      className="border border-gray-900 p-2 text-sm focus:outline-none focus:border-green-600 bg-transparent"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                    >
                      <option value="all">ALL</option>
                      <option value="pending">PENDING</option>
                      <option value="overdue">OVERDUE</option>
                      <option value="paid">SETTLED</option>
                    </select>
                  </div>
                </div>

                {/* --- Staff Table --- */}
                {loading ? (
                  <div className="flex justify-center items-center h-48 text-gray-700">
                    <p>Loading staff records...</p>
                  </div>
                ) : filteredStaff.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-gray-400 text-gray-600">
                    <p className="text-sm">No matching staff records found.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border-t border-gray-900">
                    <table className="min-w-full divide-y divide-gray-900 text-sm">
                      <thead className="bg-gray-100 text-gray-900 uppercase tracking-widest border-b border-gray-900">
                        <tr>
                          {/* Checkbox Column */}
                          <th className="px-2 py-2 text-center w-10">
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={toggleSelectAll}
                              className="text-gray-600 hover:text-gray-900 transition-colors"
                              title={allSettlableSelected ? "Deselect all" : "Select all unsettled"}
                            >
                              {allSettlableSelected ? <IconCheckSquare /> : <IconSquare />}
                            </motion.button>
                          </th>
                          <th className="px-4 py-2 text-left">Staff</th>
                          <th className="px-4 py-2 text-right">Salary</th>
                          <th className="px-4 py-2 text-right">Advance</th>
                          <th className="px-4 py-2 text-right">Paid</th>
                          <th className="px-4 py-2 text-right text-red-600">Remaining</th>
                          <th className="px-4 py-2 text-center">Status</th>
                          <th className="px-4 py-2 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredStaff.map((s) => {
                          // Use API-provided effective salary data
                          const effectiveSalary = s.effectiveSalary || s.salary;
                          const multiplier = s.salaryMultiplier || 1;
                          const effectiveRemaining = s.effectiveRemaining || 0;
                          const isPaid = effectiveRemaining === 0;
                          const isSelected = selectedIds.has(s._id);
                          const monthsOverdue = s.monthsOverdue || 0;
                          const pendingAdvance = s.pendingAdvance || 0;
                          const dueInfo = getDueDaysInfo(s.salaryDueDate);
                          
                          return (
                            <motion.tr
                              key={s._id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: 0.1 }}
                              className={`hover:bg-gray-50 transition-colors duration-150 ${isSelected ? "bg-blue-50" : ""} ${monthsOverdue > 0 && !isPaid ? "border-l-4 border-l-red-500" : ""}`}
                            >
                              {/* Checkbox */}
                              <td className="px-2 py-3 text-center">
                                {!isPaid && (
                                  <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => toggleSelection(s._id)}
                                    className={`transition-colors ${isSelected ? "text-blue-600" : "text-gray-400 hover:text-gray-600"}`}
                                  >
                                    {isSelected ? <IconCheckSquare /> : <IconSquare />}
                                  </motion.button>
                                )}
                              </td>
                              
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="font-semibold">{s.name}</div>
                                <div className="text-xs text-gray-500">{s.jobTitle}</div>
                                {pendingAdvance > 0 && (
                                  <div className="text-xs text-amber-600 font-medium">
                                    ⚠ {formatCurrency(pendingAdvance)} advance pending
                                  </div>
                                )}
                              </td>

                              <td className="px-4 py-3 whitespace-nowrap text-right">
                                <div>{formatCurrency(s.salary)}</div>
                                {multiplier > 1 && !isPaid && (
                                  <div className="text-xs text-red-600 font-semibold">
                                    ×{multiplier} = {formatCurrency(effectiveSalary)}
                                  </div>
                                )}
                              </td>

                              <td className="px-4 py-3 whitespace-nowrap text-right text-green-600">
                                <div>{formatCurrency(s.advanceSalary || 0)}</div>
                                {pendingAdvance > 0 && (
                                  <div className="text-xs text-amber-600">
                                    ({formatCurrency(pendingAdvance)} pending)
                                  </div>
                                )}
                              </td>

                              <td className="px-4 py-3 whitespace-nowrap text-right font-medium">
                                {formatCurrency(s.totalPaidToDate || 0)}
                              </td>

                              <td className={`px-4 py-3 whitespace-nowrap text-right font-bold ${effectiveRemaining > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                {formatCurrency(effectiveRemaining)}
                                {multiplier > 1 && !isPaid && effectiveRemaining !== (s.remainingSalary || 0) && (
                                  <div className="text-xs text-gray-500 font-normal">
                                    (base: {formatCurrency(s.remainingSalary || 0)})
                                  </div>
                                )}
                              </td>
                              
                              <td className="px-4 py-3 text-center">
                                {getStatusBadge(s)}
                                <div className="text-xs text-gray-500 mt-1">
                                  {dueInfo.label}
                                </div>
                              </td>

                              {/* Actions */}
                              <td className="px-1 py-3 whitespace-nowrap text-center">
                                <div className="flex flex-col gap-1 items-center">
                                  {/* Payment Actions */}
                                  <div className="flex gap-1 flex-wrap justify-center">
                                    <motion.button
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      className="text-xs border border-green-600 text-green-600 px-2 py-0.5 rounded-sm flex items-center gap-1 hover:bg-green-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                      onClick={() => { setSelectedStaff(s); setIsAdvance(false); setShowPaymentModal(true); }}
                                      disabled={isPaid || processingId === s._id}
                                    >
                                      <IconDollarSign /> Pay
                                    </motion.button>

                                    <motion.button
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      className="text-xs border border-gray-600 text-gray-600 px-2 py-0.5 rounded-sm flex items-center gap-1 hover:bg-gray-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                      onClick={() => { setSelectedStaff(s); setIsAdvance(true); setShowPaymentModal(true); }}
                                      disabled={processingId === s._id}
                                    >
                                      <IconArrowUpRight /> Advance
                                    </motion.button>

                                    {/* Mark as Paid - settle remaining and roll to next cycle */}
                                    {effectiveRemaining > 0 && (
                                      <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        className="text-xs border border-blue-600 text-blue-600 px-2 py-0.5 rounded-sm flex items-center gap-1 hover:bg-blue-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                        onClick={() => handleMarkAsPaid(s)}
                                        disabled={processingId === s._id}
                                      >
                                        {processingId === s._id ? (
                                          <span className="animate-spin">⟳</span>
                                        ) : (
                                          <IconCheck />
                                        )}
                                        Settle
                                      </motion.button>
                                    )}

                                    <motion.button
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      className="text-xs border border-gray-600 text-gray-600 px-2 py-0.5 rounded-sm flex items-center gap-1 hover:bg-gray-100 transition"
                                      onClick={() => { setSelectedStaff(s); setShowHistoryDrawer(true); }}
                                    >
                                      <IconHistory /> History
                                    </motion.button>
                                  </div>
                                  
                                  {/* Management Actions */}
                                  <div className="flex gap-2 text-gray-600">
                                    <motion.button
                                      whileHover={{ scale: 1.2, color: 'rgb(75 85 99)' }}
                                      whileTap={{ scale: 0.9 }}
                                      className="text-xs border border-gray-600 text-gray-600 px-2 py-0.5 rounded-sm flex items-center gap-1 hover:bg-gray-100 transition disabled:opacity-50"
                                      onClick={() => handleEdit(s)}
                                      disabled={processingId === s._id}
                                    >
                                      <IconEdit /> Edit
                                    </motion.button>
                                    <motion.button
                                      whileHover={{ scale: 1.2, color: 'rgb(220 38 38)' }}
                                      whileTap={{ scale: 0.9 }}
                                      className="text-xs border border-gray-600 text-gray-600 px-2 py-0.5 rounded-sm flex items-center gap-1 hover:bg-gray-100 transition disabled:opacity-50"
                                      onClick={() => handleDelete(s._id)}
                                      disabled={processingId === s._id}
                                    >
                                      <IconTrash /> Delete
                                    </motion.button>
                                  </div>
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            )}

            {/* -------------------- Staff Form Tab Content -------------------- */}
            {activeTab === "form" && (
              <motion.div
                key="form"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                className="max-w-md mx-auto p-8 border border-gray-900 rounded-sm bg-transparent"
              >
                <h2 className="text-lg font-bold mb-6 text-center">
                  {editingStaffId ? "UPDATE STAFF DETAILS" : "REGISTER NEW STAFF"}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="name" className="block text-xs font-semibold uppercase mb-1">Full Name</label>
                    <input
                      id="name"
                      type="text"
                      required
                      className="w-full border border-gray-900 px-3 py-2 text-sm focus:outline-none focus:border-green-600 bg-transparent"
                      placeholder="Rana Sufyan"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  <div>
                    <label htmlFor="jobTitle" className="block text-xs font-semibold uppercase mb-1">Designation</label>
                    <input
                      id="jobTitle"
                      type="text"
                      required
                      className="w-full border border-gray-900 px-3 py-2 text-sm focus:outline-none focus:border-green-600 bg-transparent"
                      placeholder="General Manager"
                      value={formData.jobTitle}
                      onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="salary" className="block text-xs font-semibold uppercase mb-1">Monthly Salary (PKR)</label>
                      <input
                        id="salary"
                        type="number"
                        required
                        min="1"
                        className="w-full border border-gray-900 px-3 py-2 text-sm focus:outline-none focus:border-green-600 bg-transparent"
                        placeholder="50000"
                        value={formData.salary}
                        onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                      />
                    </div>

                    <div>
                      <label htmlFor="salaryDueDate" className="block text-xs font-semibold uppercase mb-1">Salary Due Date</label>
                      <input
                        id="salaryDueDate"
                        type="date"
                        required
                        className="w-full border border-gray-900 px-3 py-2 text-sm focus:outline-none focus:border-green-600 bg-transparent"
                        value={formData.salaryDueDate}
                        onChange={(e) => setFormData({ ...formData, salaryDueDate: e.target.value })}
                      />
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    type="submit"
                    className="w-full mt-6 bg-gray-900 text-white text-sm font-bold py-2.5 px-4 border border-gray-900 rounded-sm transition-all flex items-center justify-center gap-2 hover:bg-gray-800"
                  >
                    {editingStaffId ? (<><IconEdit className="w-3 h-3" /> UPDATE RECORD</>) : (<><IconPlus className="w-3 h-3" /> ADD RECORD</>)}
                  </motion.button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      
      {selectedStaff && (
        <StaffPaymentHistoryDrawer
          open={showHistoryDrawer}
          onClose={() => setShowHistoryDrawer(false)}
          staff={selectedStaff}
        />
      )}

      <AnimatePresence>
        {showPaymentModal && selectedStaff && (() => {
          // Use API-provided effective salary data
          const effectiveSalary = selectedStaff.effectiveSalary || selectedStaff.salary;
          const multiplier = selectedStaff.salaryMultiplier || 1;
          const effectiveRemaining = selectedStaff.effectiveRemaining || 0;
          const pendingAdvance = selectedStaff.pendingAdvance || 0;
          const monthsOverdue = selectedStaff.monthsOverdue || 0;
          const dueInfo = getDueDaysInfo(selectedStaff.salaryDueDate);
          
          return (
          <motion.div
            className="fixed inset-0 bg-black text-white bg-opacity-70 flex justify-center items-center z-[1000] backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 50, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 50, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-gray-900 border border-white p-8 rounded-sm w-full max-w-md mx-4"
            >
              <h2 className="text-lg font-bold mb-2 uppercase">
                {isAdvance ? "Record Advance" : "Record Payment"}
              </h2>
              <p className="text-sm text-gray-400 mb-2">
                Staff: <span className="font-semibold text-white">{selectedStaff.name}</span>
              </p>
              
              {/* Show remaining balance info */}
              {!isAdvance && (
                <div className="mb-4 p-3 bg-gray-800 rounded-sm border border-gray-700">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Base Salary:</span>
                    <span>{formatCurrency(selectedStaff.salary)}</span>
                  </div>
                  {multiplier > 1 && (
                    <>
                      <div className="flex justify-between text-sm text-amber-400">
                        <span>Months Overdue:</span>
                        <span>×{multiplier} ({monthsOverdue} month{monthsOverdue > 1 ? "s" : ""})</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold text-red-400">
                        <span>Effective Salary:</span>
                        <span>{formatCurrency(effectiveSalary)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Paid (this cycle):</span>
                    <span className="text-green-400">{formatCurrency(selectedStaff.totalPaid || 0)}</span>
                  </div>
                  {pendingAdvance > 0 && (
                    <div className="flex justify-between text-sm text-cyan-400">
                      <span>Advance Credit Available:</span>
                      <span>{formatCurrency(pendingAdvance)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold border-t border-gray-700 pt-2 mt-2">
                    <span className="text-gray-400">Remaining to Pay:</span>
                    <span className="text-red-400">{formatCurrency(effectiveRemaining)}</span>
                  </div>
                  {pendingAdvance > 0 && pendingAdvance >= effectiveRemaining && (
                    <p className="text-xs text-cyan-300 mt-2">
                      💡 Advance covers full remaining ({formatCurrency(effectiveRemaining)}). Use "Settle" to auto-deduct.
                    </p>
                  )}
                  {pendingAdvance > 0 && pendingAdvance < effectiveRemaining && (
                    <p className="text-xs text-amber-300 mt-2">
                      ⚠ When settling, {formatCurrency(pendingAdvance)} advance will be auto-deducted (pay {formatCurrency(effectiveRemaining - pendingAdvance)} cash)
                    </p>
                  )}
                </div>
              )}

              <div className="mb-4">
                <label htmlFor="paymentAmount" className="block text-xs font-semibold uppercase mb-1 text-gray-400">Amount (PKR)</label>
                <input
                  id="paymentAmount"
                  type="number"
                  min="1"
                  max={!isAdvance ? effectiveRemaining : undefined}
                  placeholder={isAdvance ? "Enter Advance Amount" : `Max: ${effectiveRemaining}`}
                  className="w-full border border-white px-4 py-3 text-lg focus:outline-none focus:border-green-600 bg-transparent"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  disabled={isSubmittingPayment}
                  required
                />
                {!isAdvance && Number(paymentAmount) > effectiveRemaining && (
                  <p className="text-red-400 text-xs mt-1">Amount exceeds remaining salary</p>
                )}
                {/* Payment preview - show what will happen */}
                {!isAdvance && Number(paymentAmount) > 0 && Number(paymentAmount) <= effectiveRemaining && (() => {
                  const payAmt = Number(paymentAmount);
                  const currentPaid = selectedStaff.totalPaid || 0;
                  const totalAfterPayment = currentPaid + payAmt;
                  const salary = selectedStaff.salary;
                  const cyclesWillSettle = Math.floor(totalAfterPayment / salary);
                  const carryForward = totalAfterPayment % salary;
                  
                  if (cyclesWillSettle > 0) {
                    return (
                      <div className="mt-2 p-2 bg-green-900/30 border border-green-700 rounded text-xs">
                        <p className="text-green-400">
                          ✓ This will settle <strong>{cyclesWillSettle}</strong> month{cyclesWillSettle > 1 ? "s" : ""} salary
                          {carryForward > 0 && (
                            <span className="text-cyan-400"> + {formatCurrency(carryForward)} carries forward</span>
                          )}
                        </p>
                      </div>
                    );
                  } else if (payAmt > 0) {
                    const stillNeeded = salary - totalAfterPayment;
                    return (
                      <div className="mt-2 p-2 bg-amber-900/30 border border-amber-700 rounded text-xs">
                        <p className="text-amber-400">
                          Partial payment: {formatCurrency(stillNeeded)} more needed to settle this month
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <div className="mb-6">
                <label htmlFor="remarks" className="block text-xs font-semibold uppercase mb-1 text-gray-400">Remarks (Optional)</label>
                <textarea
                  id="remarks"
                  placeholder="Note reason or date..."
                  className="w-full border border-white px-3 py-2 text-sm resize-none focus:outline-none focus:border-green-600 bg-transparent"
                  rows={3}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  disabled={isSubmittingPayment}
                />
              </div>

              <div className="flex justify-end gap-3">
                <motion.button
                  whileHover={{ opacity: 0.8 }}
                  whileTap={{ scale: 0.98 }}
                  className="text-sm px-4 py-2 border border-white font-medium rounded-sm hover:bg-gray-800 transition disabled:opacity-50"
                  onClick={() => {
                    setShowPaymentModal(false);
                    setPaymentAmount("");
                    setRemarks("");
                    setIsAdvance(false);
                  }}
                  disabled={isSubmittingPayment}
                >
                  CANCEL
                </motion.button>
                <motion.button
                  whileHover={{ opacity: 0.9 }}
                  whileTap={{ scale: 0.98 }}
                  className="bg-green-600 text-white text-sm px-4 py-2 font-medium rounded-sm border border-green-600 hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2"
                  onClick={handlePaymentSubmit}
                  disabled={
                    Number(paymentAmount) <= 0 || 
                    isSubmittingPayment ||
                    (!isAdvance && Number(paymentAmount) > effectiveRemaining)
                  }
                >
                  {isSubmittingPayment ? (
                    <>
                      <span className="animate-spin">⟳</span>
                      SAVING...
                    </>
                  ) : (
                    "SAVE PAYMENT"
                  )}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}