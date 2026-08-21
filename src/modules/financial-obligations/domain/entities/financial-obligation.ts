export type ObligationSource = "recurrence" | "manual";
export type ObligationStatus = "pending" | "paid" | "overdue" | "cancelled";
export type PaymentMethod =
  | "transfer"
  | "direct_debit"
  | "check"
  | "cash"
  | "card"
  | "mbway"
  | "other";

interface FinancialObligationProps {
  id: string;
  source: ObligationSource;
  supplierId: string | null;
  supplierName: string;
  description: string;
  amountCents: number;
  dueDate: Date;
  paidAt: Date | null;
  paymentMethod: PaymentMethod | null;
  status: ObligationStatus;
  invoiceId: string | null;
  recurrenceId: string | null;
  recurrenceName: string | null;
  documentUrl: string | null;
  costCenterId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class FinancialObligation {
  readonly id: string;
  readonly source: ObligationSource;
  readonly supplierId: string | null;
  readonly supplierName: string;
  readonly description: string;
  readonly amountCents: number;
  readonly dueDate: Date;
  readonly paidAt: Date | null;
  readonly paymentMethod: PaymentMethod | null;
  readonly status: ObligationStatus;
  readonly invoiceId: string | null;
  readonly recurrenceId: string | null;
  readonly recurrenceName: string | null;
  readonly documentUrl: string | null;
  readonly costCenterId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: FinancialObligationProps) {
    this.id = props.id;
    this.source = props.source;
    this.supplierId = props.supplierId;
    this.supplierName = props.supplierName;
    this.description = props.description;
    this.amountCents = props.amountCents;
    this.dueDate = props.dueDate;
    this.paidAt = props.paidAt;
    this.paymentMethod = props.paymentMethod;
    this.status = props.status;
    this.invoiceId = props.invoiceId;
    this.recurrenceId = props.recurrenceId;
    this.recurrenceName = props.recurrenceName;
    this.documentUrl = props.documentUrl;
    this.costCenterId = props.costCenterId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: {
    source: ObligationSource;
    supplierId?: string | null;
    supplierName: string;
    description: string;
    amountCents: number;
    dueDate: Date;
    paymentMethod?: PaymentMethod | null;
    costCenterId?: string | null;
  }): FinancialObligation {
    if (props.amountCents <= 0) throw new Error("Amount must be greater than zero");
    if (!props.description.trim()) throw new Error("Description is required");
    const now = new Date();
    return new FinancialObligation({
      id: crypto.randomUUID(),
      source: props.source,
      supplierId: props.supplierId ?? null,
      supplierName: props.supplierName.trim(),
      description: props.description.trim(),
      amountCents: props.amountCents,
      dueDate: props.dueDate,
      paidAt: null,
      paymentMethod: props.paymentMethod ?? null,
      status: "pending",
      invoiceId: null,
      recurrenceId: null,
      recurrenceName: null,
      documentUrl: null,
      costCenterId: props.costCenterId ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: FinancialObligationProps): FinancialObligation {
    return new FinancialObligation(props);
  }

  markPaid(paidAt: Date, paymentMethod?: PaymentMethod | null): FinancialObligation {
    if (this.status === "cancelled") {
      throw new Error(`Cannot mark a cancelled obligation as paid: ${this.id}`);
    }
    if (this.status === "paid") {
      throw new Error(`Obligation is already paid: ${this.id}`);
    }
    return new FinancialObligation({
      ...this.toProps(),
      paidAt,
      paymentMethod: paymentMethod ?? this.paymentMethod,
      status: "paid",
      updatedAt: new Date(),
    });
  }

  private toProps(): FinancialObligationProps {
    return {
      id: this.id,
      source: this.source,
      supplierId: this.supplierId,
      supplierName: this.supplierName,
      description: this.description,
      amountCents: this.amountCents,
      dueDate: this.dueDate,
      paidAt: this.paidAt,
      paymentMethod: this.paymentMethod,
      status: this.status,
      invoiceId: this.invoiceId,
      recurrenceId: this.recurrenceId,
      recurrenceName: this.recurrenceName,
      documentUrl: this.documentUrl,
      costCenterId: this.costCenterId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
