export type RecurrenceType = "none" | "monthly" | "quarterly" | "annual";
export type PayableStatus = "pending" | "paid" | "overdue" | "cancelled";

export const RECURRENCE_TYPES: RecurrenceType[] = ["none", "monthly", "quarterly", "annual"];
export const PAYABLE_STATUSES: PayableStatus[] = ["pending", "paid", "overdue", "cancelled"];

interface PayableEntryProps {
  id: string;
  invoiceId: string | null;
  supplierId: string | null;
  supplierName: string;
  description: string;
  costCenterId: string | null;
  category: string | null;
  amount: number; // cents
  dueDate: Date;
  paidAt: Date | null;
  recurrence: RecurrenceType;
  status: PayableStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdatePayableEntryData {
  supplierName?: string;
  description?: string;
  costCenterId?: string | null;
  category?: string | null;
  amount?: number;
  dueDate?: Date;
  recurrence?: RecurrenceType;
  notes?: string | null;
}

export class PayableEntry {
  readonly id: string;
  readonly invoiceId: string | null;
  readonly supplierId: string | null;
  readonly supplierName: string;
  readonly description: string;
  readonly costCenterId: string | null;
  readonly category: string | null;
  readonly amount: number;
  readonly dueDate: Date;
  readonly paidAt: Date | null;
  readonly recurrence: RecurrenceType;
  readonly status: PayableStatus;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: PayableEntryProps) {
    this.id = props.id;
    this.invoiceId = props.invoiceId;
    this.supplierId = props.supplierId;
    this.supplierName = props.supplierName;
    this.description = props.description;
    this.costCenterId = props.costCenterId;
    this.category = props.category;
    this.amount = props.amount;
    this.dueDate = props.dueDate;
    this.paidAt = props.paidAt;
    this.recurrence = props.recurrence;
    this.status = props.status;
    this.notes = props.notes;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: {
    invoiceId?: string | null;
    supplierId?: string | null;
    supplierName: string;
    description: string;
    costCenterId?: string | null;
    category?: string | null;
    amount: number;
    dueDate: Date;
    recurrence?: RecurrenceType;
    notes?: string | null;
  }): PayableEntry {
    if (props.amount <= 0) throw new Error("Amount must be greater than zero");
    if (!props.description.trim()) throw new Error("Description is required");
    const now = new Date();
    return new PayableEntry({
      id: crypto.randomUUID(),
      invoiceId: props.invoiceId ?? null,
      supplierId: props.supplierId ?? null,
      supplierName: props.supplierName.trim(),
      description: props.description.trim(),
      costCenterId: props.costCenterId ?? null,
      category: props.category ?? null,
      amount: props.amount,
      dueDate: props.dueDate,
      paidAt: null,
      recurrence: props.recurrence ?? "none",
      status: "pending",
      notes: props.notes ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: PayableEntryProps): PayableEntry {
    return new PayableEntry(props);
  }

  markPaid(paidAt: Date): PayableEntry {
    if (this.status === "cancelled") {
      throw new Error(`Cannot mark a cancelled payable entry as paid: ${this.id}`);
    }
    if (this.status === "paid") {
      throw new Error(`Payable entry is already paid: ${this.id}`);
    }
    return new PayableEntry({ ...this.toProps(), paidAt, status: "paid", updatedAt: new Date() });
  }

  markOverdue(): PayableEntry {
    if (this.status !== "pending") return this;
    return new PayableEntry({ ...this.toProps(), status: "overdue", updatedAt: new Date() });
  }

  cancel(): PayableEntry {
    if (this.status === "paid") {
      throw new Error(`Cannot cancel a paid payable entry: ${this.id}`);
    }
    return new PayableEntry({ ...this.toProps(), status: "cancelled", updatedAt: new Date() });
  }

  update(data: UpdatePayableEntryData): PayableEntry {
    if (this.status === "cancelled") {
      throw new Error(`Cannot update a cancelled payable entry: ${this.id}`);
    }
    const p = this.toProps();
    if (data.supplierName !== undefined) p.supplierName = data.supplierName.trim();
    if (data.description !== undefined) p.description = data.description.trim();
    if (data.costCenterId !== undefined) p.costCenterId = data.costCenterId;
    if (data.category !== undefined) p.category = data.category;
    if (data.amount !== undefined) {
      if (data.amount <= 0) throw new Error("Amount must be greater than zero");
      p.amount = data.amount;
    }
    if (data.dueDate !== undefined) p.dueDate = data.dueDate;
    if (data.recurrence !== undefined) p.recurrence = data.recurrence;
    if (data.notes !== undefined) p.notes = data.notes;
    p.updatedAt = new Date();
    return new PayableEntry(p);
  }

  private toProps(): PayableEntryProps {
    return {
      id: this.id,
      invoiceId: this.invoiceId,
      supplierId: this.supplierId,
      supplierName: this.supplierName,
      description: this.description,
      costCenterId: this.costCenterId,
      category: this.category,
      amount: this.amount,
      dueDate: this.dueDate,
      paidAt: this.paidAt,
      recurrence: this.recurrence,
      status: this.status,
      notes: this.notes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
