import {
  RecurrenceClosedError,
  RecurrenceAlreadyPausedError,
  RecurrenceNotPausedError,
} from "../errors.js";

// ── Value types ────────────────────────────────────────────────────────────────

export type RecurrenceType =
  | "fixed_contract"    // aluguel, prestação fixa
  | "variable_invoice"  // energia, água, telecom (exige fatura mensal)
  | "recurring_service" // contabilidade, software, manutenção
  | "payroll"           // salários, encargos, folhas salariais
  | "bank_auto"         // tarifas bancárias, seguros debitados automaticamente
  | "fiscal";           // IVA, guias fiscais, impostos

export type RecurrenceFrequency =
  | "monthly"     // MVP — única frequência implementada
  | "quarterly"
  | "annual";

export type PaymentMethod =
  | "transfer"
  | "direct_debit"
  | "check"
  | "cash"
  | "card"
  | "mbway"
  | "other";

export type RecurrenceStatus = "active" | "paused" | "closed";

// ── Internal props ─────────────────────────────────────────────────────────────

interface RecurrenceProps {
  id: string;
  name: string;
  supplierId: string | null;
  supplierName: string;
  type: RecurrenceType;
  frequency: RecurrenceFrequency;
  costCenterId: string | null;
  /** Sub-category within the cost center group (optional). */
  costCenterCategoryId: string | null;
  category: string | null;
  /** Estimated amount in cents. Used for cash-flow preview until real invoice arrives. */
  estimatedAmountCents: number;
  /** Day of month on which the obligation is due (1–31; capped to last day of month when generating). */
  dayOfMonth: number;
  startDate: Date;
  endDate: Date | null;
  paymentMethod: PaymentMethod;
  /**
   * If true, a payable entry is created automatically when the occurrence is generated
   * (only valid for fixed_contract where no invoice is needed each month).
   */
  autoCreatePayable: boolean;
  /**
   * If true, an invoice/document must be linked before a payable entry can be created.
   * Forced to true for variable_invoice and fiscal types.
   */
  requireInvoice: boolean;
  status: RecurrenceStatus;
  notes: string | null;
  /** URL of the base contract/document stored in Supabase Storage. */
  documentUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Entity ─────────────────────────────────────────────────────────────────────

export class Recurrence {
  readonly id: string;
  readonly name: string;
  readonly supplierId: string | null;
  readonly supplierName: string;
  readonly type: RecurrenceType;
  readonly frequency: RecurrenceFrequency;
  readonly costCenterId: string | null;
  readonly costCenterCategoryId: string | null;
  readonly category: string | null;
  readonly estimatedAmountCents: number;
  readonly dayOfMonth: number;
  readonly startDate: Date;
  readonly endDate: Date | null;
  readonly paymentMethod: PaymentMethod;
  readonly autoCreatePayable: boolean;
  readonly requireInvoice: boolean;
  readonly status: RecurrenceStatus;
  readonly notes: string | null;
  readonly documentUrl: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: RecurrenceProps) {
    this.id = props.id;
    this.name = props.name;
    this.supplierId = props.supplierId;
    this.supplierName = props.supplierName;
    this.type = props.type;
    this.frequency = props.frequency;
    this.costCenterId = props.costCenterId;
    this.costCenterCategoryId = props.costCenterCategoryId;
    this.category = props.category;
    this.estimatedAmountCents = props.estimatedAmountCents;
    this.dayOfMonth = props.dayOfMonth;
    this.startDate = props.startDate;
    this.endDate = props.endDate;
    this.paymentMethod = props.paymentMethod;
    this.autoCreatePayable = props.autoCreatePayable;
    this.requireInvoice = props.requireInvoice;
    this.status = props.status;
    this.notes = props.notes;
    this.documentUrl = props.documentUrl;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  // ── Factories ────────────────────────────────────────────────────────────────

  static create(props: {
    name: string;
    supplierId?: string | null;
    supplierName: string;
    type: RecurrenceType;
    frequency?: RecurrenceFrequency;
    costCenterId?: string | null;
    costCenterCategoryId?: string | null;
    category?: string | null;
    estimatedAmountCents: number;
    dayOfMonth: number;
    startDate: Date;
    endDate?: Date | null;
    paymentMethod: PaymentMethod;
    autoCreatePayable?: boolean;
    requireInvoice?: boolean;
    notes?: string | null;
  }): Recurrence {
    Recurrence.validate(props);

    // variable_invoice and fiscal always require an invoice
    const requireInvoice =
      props.type === "variable_invoice" || props.type === "fiscal"
        ? true
        : (props.requireInvoice ?? false);

    // autoCreatePayable only makes sense when requireInvoice is false
    const autoCreatePayable = requireInvoice ? false : (props.autoCreatePayable ?? false);

    const now = new Date();
    return new Recurrence({
      id: crypto.randomUUID(),
      name: props.name.trim(),
      supplierId: props.supplierId ?? null,
      supplierName: props.supplierName.trim(),
      type: props.type,
      frequency: props.frequency ?? "monthly",
      costCenterId: props.costCenterId ?? null,
      costCenterCategoryId: props.costCenterCategoryId ?? null,
      category: props.category ?? null,
      estimatedAmountCents: props.estimatedAmountCents,
      dayOfMonth: props.dayOfMonth,
      startDate: props.startDate,
      endDate: props.endDate ?? null,
      paymentMethod: props.paymentMethod,
      autoCreatePayable,
      requireInvoice,
      status: "active",
      notes: props.notes ?? null,
      documentUrl: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: RecurrenceProps): Recurrence {
    return new Recurrence(props);
  }

  // ── Transitions ──────────────────────────────────────────────────────────────

  pause(): Recurrence {
    if (this.status === "closed") throw new RecurrenceClosedError(this.id);
    if (this.status === "paused") throw new RecurrenceAlreadyPausedError(this.id);
    return new Recurrence({ ...this.toProps(), status: "paused", updatedAt: new Date() });
  }

  resume(): Recurrence {
    if (this.status === "closed") throw new RecurrenceClosedError(this.id);
    if (this.status !== "paused") throw new RecurrenceNotPausedError(this.id);
    return new Recurrence({ ...this.toProps(), status: "active", updatedAt: new Date() });
  }

  close(): Recurrence {
    if (this.status === "closed") throw new RecurrenceClosedError(this.id);
    return new Recurrence({ ...this.toProps(), status: "closed", updatedAt: new Date() });
  }

  update(data: {
    name?: string;
    supplierId?: string | null;
    supplierName?: string;
    costCenterId?: string | null;
    costCenterCategoryId?: string | null;
    category?: string | null;
    estimatedAmountCents?: number;
    dayOfMonth?: number;
    endDate?: Date | null;
    paymentMethod?: PaymentMethod;
    autoCreatePayable?: boolean;
    requireInvoice?: boolean;
    notes?: string | null;
  }): Recurrence {
    if (this.status === "closed") throw new RecurrenceClosedError(this.id);

    const p = this.toProps();
    if (data.name !== undefined) p.name = data.name.trim();
    if (data.supplierId !== undefined) p.supplierId = data.supplierId;
    if (data.supplierName !== undefined) p.supplierName = data.supplierName.trim();
    if (data.costCenterId !== undefined) p.costCenterId = data.costCenterId;
    if (data.costCenterCategoryId !== undefined) p.costCenterCategoryId = data.costCenterCategoryId;
    if (data.category !== undefined) p.category = data.category;
    if (data.estimatedAmountCents !== undefined) {
      if (data.estimatedAmountCents <= 0) throw new Error("estimatedAmountCents must be greater than zero");
      p.estimatedAmountCents = data.estimatedAmountCents;
    }
    if (data.dayOfMonth !== undefined) {
      if (data.dayOfMonth < 1 || data.dayOfMonth > 31) throw new Error("dayOfMonth must be between 1 and 31");
      p.dayOfMonth = data.dayOfMonth;
    }
    if (data.endDate !== undefined) p.endDate = data.endDate;
    if (data.paymentMethod !== undefined) p.paymentMethod = data.paymentMethod;
    if (data.notes !== undefined) p.notes = data.notes;

    // requireInvoice and autoCreatePayable: only update if type allows it
    const newRequireInvoice =
      p.type === "variable_invoice" || p.type === "fiscal"
        ? true
        : (data.requireInvoice ?? p.requireInvoice);
    p.requireInvoice = newRequireInvoice;
    p.autoCreatePayable = newRequireInvoice ? false : (data.autoCreatePayable ?? p.autoCreatePayable);

    p.updatedAt = new Date();
    return new Recurrence(p);
  }

  setDocumentUrl(url: string | null): Recurrence {
    if (this.status === "closed") throw new RecurrenceClosedError(this.id);
    return new Recurrence({ ...this.toProps(), documentUrl: url, updatedAt: new Date() });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  isActiveAt(date: Date): boolean {
    if (this.status !== "active") return false;
    if (date < this.startDate) return false;
    if (this.endDate && date > this.endDate) return false;
    return true;
  }

  private static validate(props: {
    name: string;
    supplierName: string;
    estimatedAmountCents: number;
    dayOfMonth: number;
    startDate: Date;
    endDate?: Date | null;
  }): void {
    if (!props.name.trim()) throw new Error("Recurrence name is required");
    if (!props.supplierName.trim()) throw new Error("Supplier name is required");
    if (props.estimatedAmountCents <= 0) throw new Error("estimatedAmountCents must be greater than zero");
    if (props.dayOfMonth < 1 || props.dayOfMonth > 31) throw new Error("dayOfMonth must be between 1 and 31");
    if (props.endDate && props.endDate < props.startDate) throw new Error("endDate must be after startDate");
  }

  private toProps(): RecurrenceProps {
    return {
      id: this.id,
      name: this.name,
      supplierId: this.supplierId,
      supplierName: this.supplierName,
      type: this.type,
      frequency: this.frequency,
      costCenterId: this.costCenterId,
      costCenterCategoryId: this.costCenterCategoryId,
      category: this.category,
      estimatedAmountCents: this.estimatedAmountCents,
      dayOfMonth: this.dayOfMonth,
      startDate: this.startDate,
      endDate: this.endDate,
      paymentMethod: this.paymentMethod,
      autoCreatePayable: this.autoCreatePayable,
      requireInvoice: this.requireInvoice,
      status: this.status,
      notes: this.notes,
      documentUrl: this.documentUrl,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
