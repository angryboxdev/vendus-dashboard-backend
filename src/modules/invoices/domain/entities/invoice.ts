export type InvoiceStatus =
  | "pending"
  | "paid"
  | "overdue"
  | "partial"
  | "cancelled"
  | "review";

export type InvoiceLineType =
  | "stock_purchase"
  | "operational_expense"
  | "fixed_cost"
  | "variable_cost"
  | "tax"
  | "bank_fee"
  | "salary"
  | "internal_transfer"
  | "service"
  | "mixed"
  | "other";

export const INVOICE_STATUSES: InvoiceStatus[] = [
  "pending", "paid", "overdue", "partial", "cancelled", "review",
];

export const INVOICE_LINE_TYPES: InvoiceLineType[] = [
  "stock_purchase", "operational_expense", "fixed_cost", "variable_cost",
  "tax", "bank_fee", "salary", "internal_transfer", "service", "mixed", "other",
];

interface InvoiceProps {
  id: string;
  supplierId: string | null;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date | null;
  paidAt: Date | null;
  subtotalWithoutVat: number;
  totalVat: number;
  totalWithVat: number;
  status: InvoiceStatus;
  notes: string | null;
  attachmentUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateInvoiceData {
  supplierId?: string | null;
  supplierName?: string;
  invoiceNumber?: string;
  invoiceDate?: Date;
  dueDate?: Date | null;
  subtotalWithoutVat?: number;
  totalVat?: number;
  totalWithVat?: number;
  notes?: string | null;
  attachmentUrl?: string | null;
}

export class Invoice {
  readonly id: string;
  readonly supplierId: string | null;
  readonly supplierName: string;
  readonly invoiceNumber: string;
  readonly invoiceDate: Date;
  readonly dueDate: Date | null;
  readonly paidAt: Date | null;
  readonly subtotalWithoutVat: number;
  readonly totalVat: number;
  readonly totalWithVat: number;
  readonly status: InvoiceStatus;
  readonly notes: string | null;
  readonly attachmentUrl: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: InvoiceProps) {
    this.id = props.id;
    this.supplierId = props.supplierId;
    this.supplierName = props.supplierName;
    this.invoiceNumber = props.invoiceNumber;
    this.invoiceDate = props.invoiceDate;
    this.dueDate = props.dueDate;
    this.paidAt = props.paidAt;
    this.subtotalWithoutVat = props.subtotalWithoutVat;
    this.totalVat = props.totalVat;
    this.totalWithVat = props.totalWithVat;
    this.status = props.status;
    this.notes = props.notes;
    this.attachmentUrl = props.attachmentUrl;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: {
    supplierId?: string | null;
    supplierName: string;
    invoiceNumber: string;
    invoiceDate: Date;
    dueDate?: Date | null;
    subtotalWithoutVat: number;
    totalVat: number;
    totalWithVat: number;
    notes?: string | null;
    attachmentUrl?: string | null;
  }): Invoice {
    const now = new Date();
    return new Invoice({
      id: crypto.randomUUID(),
      supplierId: props.supplierId ?? null,
      supplierName: props.supplierName.trim(),
      invoiceNumber: props.invoiceNumber.trim(),
      invoiceDate: props.invoiceDate,
      dueDate: props.dueDate ?? null,
      paidAt: null,
      subtotalWithoutVat: props.subtotalWithoutVat,
      totalVat: props.totalVat,
      totalWithVat: props.totalWithVat,
      status: "pending",
      notes: props.notes ?? null,
      attachmentUrl: props.attachmentUrl ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: InvoiceProps): Invoice {
    return new Invoice(props);
  }

  update(data: UpdateInvoiceData): Invoice {
    const p = this.toProps();
    if (data.supplierId !== undefined) p.supplierId = data.supplierId;
    if (data.supplierName !== undefined) p.supplierName = data.supplierName.trim();
    if (data.invoiceNumber !== undefined) p.invoiceNumber = data.invoiceNumber.trim();
    if (data.invoiceDate !== undefined) p.invoiceDate = data.invoiceDate;
    if (data.dueDate !== undefined) p.dueDate = data.dueDate;
    if (data.subtotalWithoutVat !== undefined) p.subtotalWithoutVat = data.subtotalWithoutVat;
    if (data.totalVat !== undefined) p.totalVat = data.totalVat;
    if (data.totalWithVat !== undefined) p.totalWithVat = data.totalWithVat;
    if (data.notes !== undefined) p.notes = data.notes;
    if (data.attachmentUrl !== undefined) p.attachmentUrl = data.attachmentUrl;
    p.updatedAt = new Date();
    return new Invoice(p);
  }

  markPaid(paidAt: Date): Invoice {
    if (this.status === "cancelled") {
      throw new Error(`Cannot mark a cancelled invoice as paid: ${this.id}`);
    }
    return new Invoice({ ...this.toProps(), paidAt, status: "paid", updatedAt: new Date() });
  }

  markOverdue(): Invoice {
    if (this.status !== "pending") return this;
    return new Invoice({ ...this.toProps(), status: "overdue", updatedAt: new Date() });
  }

  cancel(): Invoice {
    return new Invoice({ ...this.toProps(), status: "cancelled", updatedAt: new Date() });
  }

  setStatus(status: InvoiceStatus): Invoice {
    return new Invoice({ ...this.toProps(), status, updatedAt: new Date() });
  }

  private toProps(): InvoiceProps {
    return {
      id: this.id,
      supplierId: this.supplierId,
      supplierName: this.supplierName,
      invoiceNumber: this.invoiceNumber,
      invoiceDate: this.invoiceDate,
      dueDate: this.dueDate,
      paidAt: this.paidAt,
      subtotalWithoutVat: this.subtotalWithoutVat,
      totalVat: this.totalVat,
      totalWithVat: this.totalWithVat,
      status: this.status,
      notes: this.notes,
      attachmentUrl: this.attachmentUrl,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
