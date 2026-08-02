// app/Components/CashSlip/types.ts

import { ICashSlip } from "@/models/schemas/cashslip.schema";

export type PaymentMethod = "Cheque" | "Online" | "Cash" | "";

export interface IConfigResponse {
  currentCopyNumber: string;
  uniqueNumberPrefix: string;
  start: number;
  limit: number;
  error: string
  updatedAt?: string;
  availableCopyNumbers?: string[];
}

export interface CashSlipHook {
  slips: ICashSlip[];
  error: string;
  amount: string;
  description: string;
  paymentMethod: PaymentMethod;
  copyNumbers: string[];
  selectedCopy: string;
  availableSlots: string[];
  selectedSlot: string;
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  isSubmitting: boolean;
  configLoading: boolean;
  slotsLoading: boolean;
  slipsLoading: boolean;
  currentCopyNumber: string;
  newCopyNumber: string;
  newUniquePrefix: string;
  newLimit: string;
  limit: number;
  selectedSlip: ICashSlip | null;
  username: string;
  setNewCopyNumber: (v: string) => void;
  setNewUniquePrefix: (v: string) => void;
  setNewLimit: (v: string) => void;
  setSelectedSlip: (v: ICashSlip | null) => void;
  currentUsedCount: number;
  setCurrentUsedCount: (v: number | ((prev: number) => number)) => void;
  methods?: PaymentMethod;
  fetchSlips: (opts?: { page?: number; limit?: number }) => Promise<void>;
  fetchConfig: () => Promise<void>;
  loadSlots: (copy?: string) => Promise<void>;
  addSlip: (e: React.FormEvent) => Promise<void>;
  deleteSlip: (id: string) => Promise<void>;
  saveEdit: (
    id: string,
    payload: { amount: number; description: string; paymentMethod?: string }
  ) => Promise<void>;
  handleSignedByCEOChange: (id: string, signed: boolean) => Promise<void>;
  updateSlipConfig: () => Promise<void>;
  clearForm: () => void;
  triggerPrint: (slip: ICashSlip) => void;
  setAmount: (v: string) => void;
  setDescription: (v: string) => void;
  setPaymentMethod: (v: PaymentMethod) => void;
  setSelectedCopy: (v: string) => void;
  setSelectedSlot: (v: string) => void;
  setPage: (v: number) => void;
  setPerPage: (v: number) => void;
}
