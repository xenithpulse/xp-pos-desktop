import { Schema, Document, Types } from 'mongoose';

export type PaymentType = "advance" | "partial" | "salary" | "advance_deduction" | "cycle_settlement";

export interface IPayment {
  _id?: Types.ObjectId;
  type: PaymentType;
  amount: number;
  date: Date;
  note?: string;
  cycleMonth?: number; // Which salary cycle this payment belongs to
  forCycleDate?: Date; // The due date this payment was for
  effectiveSalary?: number; // Effective salary at time of payment
  createdAt?: Date;
}

export interface IStaff extends Document {
  name: string;
  jobTitle: string;
  salary: number;
  salaryDueDate: Date; // Always the Nth day of month (preserved)
  originalDueDay: number; // Store the original day of month (e.g., 1 for 1st of each month)
  isSalaryPaid: boolean;

  payments: IPayment[]; // Audit log
  advanceSalary: number;
  totalPaid: number; // Total paid in current cycle
  totalPaidToDate: number; // Lifetime total
  pendingAdvance: number; // Advance not yet deducted
  remarks?: string;

  remainingSalary?: number;
  createdAt: Date;
  updatedAt: Date;

  // Methods
  getMonthsOverdue: () => number;
  getEffectiveSalary: () => { effectiveSalary: number; multiplier: number; monthsOverdue: number };
  recordPayment: (p: { type: PaymentType; amount: number; note?: string; autoAdvanceCycle?: boolean; skipSave?: boolean }) => Promise<{ payment: IPayment; cyclesAdvanced: number }>;
  advanceDueDateByMonths: (months: number) => void;
  settleFullAmount: (note?: string) => Promise<{ payments: IPayment[]; advanceDeducted: number; salaryPaid: number; cyclesSettled: number; remainingAdvance: number }>;
  processPaymentAndAdvanceCycles: () => number;
}

const PaymentSchema = new Schema<IPayment>(
  {
    type: { type: String, enum: ["advance", "partial", "salary", "advance_deduction", "cycle_settlement"], required: true },
    amount: { type: Number, required: true, min: 1 },
    date: { type: Date, default: () => new Date() },
    note: { type: String, trim: true },
    cycleMonth: { type: Number, default: 1 },
    forCycleDate: { type: Date }, // Which cycle this payment was for
    effectiveSalary: { type: Number },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const StaffSchema = new Schema<IStaff>(
  {
    name: { type: String, required: true, trim: true, index: true },
    jobTitle: { type: String, required: true, trim: true },
    salary: { type: Number, required: true, min: 1 }, // Min 1 to prevent infinite loop in cycle processing
    salaryDueDate: { type: Date, required: true },
    originalDueDay: { type: Number, default: 1, min: 1, max: 31 }, // Day of month for due date (1-31)
    isSalaryPaid: { type: Boolean, default: false },

    payments: { type: [PaymentSchema], default: [] },
    advanceSalary: { type: Number, default: 0, min: 0 },
    totalPaid: { type: Number, default: 0, min: 0 },
    totalPaidToDate: { type: Number, default: 0, min: 0 },
    pendingAdvance: { type: Number, default: 0, min: 0 },
    remarks: { type: String, trim: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Pre-save hook to set originalDueDay from salaryDueDate if not set
StaffSchema.pre('save', async function() {
  if (this.isNew || this.isModified('salaryDueDate')) {
    if (!this.originalDueDay || this.isNew) {
      // Use UTC to avoid timezone issues
      this.originalDueDay = new Date(this.salaryDueDate).getUTCDate();
    }
  }
  // Safety: ensure salary is at least 1
  if (this.salary < 1) this.salary = 1;
});

// Virtual — remaining salary for current month only
StaffSchema.virtual("remainingSalary").get(function (this: IStaff) {
  return Math.max(0, (this.salary ?? 0) - (this.totalPaid ?? 0));
});

// Instance — calculate months overdue based on due date
StaffSchema.methods.getMonthsOverdue = function (): number {
  const staff = this as IStaff;
  const dueDate = new Date(staff.salaryDueDate);
  const today = new Date();
  
  // Use UTC to avoid timezone issues
  const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const dueUTC = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());

  if (todayUTC <= dueUTC) return 0;

  // Calculate months between dates using UTC values
  const yearDiff = today.getUTCFullYear() - dueDate.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - dueDate.getUTCMonth();
  let months = yearDiff * 12 + monthDiff;

  // If we haven't passed the day yet this month, subtract 1
  if (today.getUTCDate() < dueDate.getUTCDate()) {
    months = Math.max(0, months - 1);
  }

  // Add 1 because if due date has passed, at least 1 month is overdue
  return months + 1;
};

// Instance — get effective salary based on months overdue
StaffSchema.methods.getEffectiveSalary = function (): { effectiveSalary: number; multiplier: number; monthsOverdue: number } {
  const staff = this as IStaff;
  const monthsOverdue = staff.getMonthsOverdue();
  const multiplier = Math.max(1, monthsOverdue);
  
  // Effective salary = base salary × months overdue
  // But we subtract what's already been paid
  return {
    effectiveSalary: staff.salary * multiplier,
    multiplier,
    monthsOverdue,
  };
};

// Helper — advance due date by N months while preserving the day of month
// Note: Does NOT reset totalPaid - caller is responsible for managing that
StaffSchema.methods.advanceDueDateByMonths = function (months: number = 1) {
  const staff = this as IStaff;
  const currentDue = new Date(staff.salaryDueDate);
  
  // Use originalDueDay or extract from date (using UTC to avoid timezone issues)
  const targetDay = staff.originalDueDay || currentDue.getUTCDate();

  // Calculate target month/year
  let targetMonth = currentDue.getUTCMonth() + months;
  let targetYear = currentDue.getUTCFullYear();

  while (targetMonth > 11) {
    targetMonth -= 12;
    targetYear += 1;
  }
  while (targetMonth < 0) {
    targetMonth += 12;
    targetYear -= 1;
  }

  // Get the last day of target month
  const lastDayOfMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  
  // Set day to original day or last day of month (whichever is smaller)
  const newDue = new Date(Date.UTC(targetYear, targetMonth, Math.min(targetDay, lastDayOfMonth)));

  staff.salaryDueDate = newDue;
  staff.isSalaryPaid = false;
  // Note: totalPaid is managed by processPaymentAndAdvanceCycles, not here
};

// Instance — process payment and auto-advance cycles if full month(s) paid
StaffSchema.methods.processPaymentAndAdvanceCycles = function (): number {
  const staff = this as IStaff;
  let cyclesAdvanced = 0;
  const MAX_CYCLES = 120; // Safety limit: 10 years max to prevent infinite loops

  // Safety check: if salary is 0 or negative, don't process (would infinite loop)
  if (staff.salary <= 0) {
    console.error('processPaymentAndAdvanceCycles: Invalid salary <= 0, skipping');
    return 0;
  }

  // Keep advancing cycles as long as totalPaid covers a full month's salary
  while (staff.totalPaid >= staff.salary && cyclesAdvanced < MAX_CYCLES) {
    // Capture the cycle date BEFORE advancing
    const cycleDueDate = new Date(staff.salaryDueDate);
    const monthName = cycleDueDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    
    // Subtract one month's salary from totalPaid (excess carries forward)
    staff.totalPaid -= staff.salary;
    
    // Record cycle settlement with the date of the cycle being settled
    staff.payments.push({
      type: "cycle_settlement",
      amount: staff.salary,
      date: new Date(),
      note: `Cycle settled for ${monthName}`,
      forCycleDate: cycleDueDate,
      effectiveSalary: staff.salary,
      cycleMonth: 1, // Each settlement is for exactly 1 month
    });
    
    // Advance due date by 1 month (preserving day)
    // Note: totalPaid is NOT reset here - we carry forward the remainder
    staff.advanceDueDateByMonths(1);
    cyclesAdvanced++;
  }

  if (cyclesAdvanced >= MAX_CYCLES) {
    console.error('processPaymentAndAdvanceCycles: Hit MAX_CYCLES limit, possible data corruption');
  }

  // After all cycles processed, whatever remains in totalPaid is the carryforward
  // for the new current cycle (no reset needed - it's already the correct amount)
  
  // Update isSalaryPaid - should be false since we exited when totalPaid < salary
  staff.isSalaryPaid = false;

  return cyclesAdvanced;
};

// Instance — record payment (with optional auto-cycle advancement)
StaffSchema.methods.recordPayment = async function ({
  type,
  amount,
  note,
  autoAdvanceCycle = true,
  skipSave = false, // For batch operations where caller will save
}: {
  type: PaymentType;
  amount: number;
  note?: string;
  autoAdvanceCycle?: boolean;
  skipSave?: boolean;
}): Promise<{ payment: IPayment; cyclesAdvanced: number }> {
  const staff = this as IStaff;
  const amt = Number(amount);

  if (isNaN(amt) || amt <= 0) throw new Error("Payment amount must be positive.");
  if (amt > 100000000) throw new Error("Payment amount exceeds maximum limit."); // 100M limit

  const { effectiveSalary, monthsOverdue } = staff.getEffectiveSalary();
  const cycleDueDate = new Date(staff.salaryDueDate);

  const payment: IPayment = {
    type,
    amount: amt,
    date: new Date(),
    note,
    cycleMonth: monthsOverdue || 1,
    forCycleDate: cycleDueDate,
    effectiveSalary,
  };

  staff.payments.push(payment);
  staff.totalPaidToDate += amt;

  if (type === "advance") {
    staff.advanceSalary += amt;
    staff.pendingAdvance += amt;
    // Advances don't count toward current cycle payment
  } else if (type === "advance_deduction") {
    // Deduction counts as payment toward salary
    staff.totalPaid += amt;
    staff.pendingAdvance = Math.max(0, staff.pendingAdvance - amt);
  } else {
    // partial, salary, cycle_settlement - all count toward totalPaid
    staff.totalPaid += amt;
  }

  let cyclesAdvanced = 0;

  // Auto-advance cycles if enough has been paid
  if (autoAdvanceCycle && type !== "advance") {
    cyclesAdvanced = staff.processPaymentAndAdvanceCycles();
  }

  if (!skipSave) {
    await staff.save();
  }
  return { payment: staff.payments[staff.payments.length - 1], cyclesAdvanced };
};

// Instance — settle full outstanding amount with advance deduction
StaffSchema.methods.settleFullAmount = async function (note?: string) {
  const staff = this as IStaff;
  const { effectiveSalary, multiplier, monthsOverdue } = staff.getEffectiveSalary();
  
  const paymentsRecorded: IPayment[] = [];
  let advanceDeducted = 0;
  let salaryPaid = 0;
  let cyclesSettled = 0;

  // Calculate total remaining (effective salary - what's already paid)
  const currentRemaining = Math.max(0, effectiveSalary - staff.totalPaid);

  if (currentRemaining <= 0) {
    // Already fully paid, just process any pending cycle advancements
    cyclesSettled = staff.processPaymentAndAdvanceCycles();
    await staff.save();
    return { payments: [], advanceDeducted: 0, salaryPaid: 0, cyclesSettled, remainingAdvance: staff.pendingAdvance };
  }

  // Deduct pending advance from the salary payment (only what's needed)
  const advanceToDeduct = Math.min(staff.pendingAdvance, currentRemaining);
  const netSalaryToPay = currentRemaining - advanceToDeduct;

  // Record advance deduction if applicable (skipSave to batch all operations)
  if (advanceToDeduct > 0) {
    const deductionNote = `Advance deducted from settlement${multiplier > 1 ? ` (${monthsOverdue} months overdue)` : ""}`;
    const { payment } = await staff.recordPayment({
      type: "advance_deduction",
      amount: advanceToDeduct,
      note: deductionNote,
      autoAdvanceCycle: false, // We'll process cycles after all payments
      skipSave: true, // Don't save yet - we'll save once at the end
    });
    paymentsRecorded.push(payment);
    advanceDeducted = advanceToDeduct;
    // Note: recordPayment already deducts from pendingAdvance, so remaining advance is preserved
  }

  // Record final salary payment (the cash amount actually paid)
  if (netSalaryToPay > 0) {
    const salaryNote = note || `Full salary settlement${multiplier > 1 ? ` (${monthsOverdue} months @ ${staff.salary.toLocaleString()} each)` : ""}${advanceToDeduct > 0 ? ` - ${advanceToDeduct.toLocaleString()} advance deducted` : ""}`;
    const { payment } = await staff.recordPayment({
      type: "salary",
      amount: netSalaryToPay,
      note: salaryNote,
      autoAdvanceCycle: false,
      skipSave: true, // Don't save yet - we'll save once at the end
    });
    paymentsRecorded.push(payment);
    salaryPaid = netSalaryToPay;
  }

  // Now process cycle advancements based on total paid
  cyclesSettled = staff.processPaymentAndAdvanceCycles();
  
  // Only reduce advanceSalary by what was actually deducted (for reporting purposes)
  // pendingAdvance is already correctly reduced by recordPayment
  staff.advanceSalary = Math.max(0, staff.advanceSalary - advanceDeducted);
  
  // Single save for all operations (atomic)
  await staff.save();

  return {
    payments: paymentsRecorded,
    advanceDeducted,
    salaryPaid,
    cyclesSettled,
    remainingAdvance: staff.pendingAdvance, // Return remaining advance for visibility
  };
};