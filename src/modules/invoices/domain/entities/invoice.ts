export type InvoiceStatus =
  | "draft_ai"
  | "pending_review"
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

export type InvoiceSource = "manual" | "pdf_import" | "image_import";

export type AiExtractionStatus = "processing" | "done" | "failed";

export const INVOICE_STATUSES: InvoiceStatus[] = [
  "draft_ai", "pending_review", "pending", "paid", "overdue", "partial", "cancelled", "review",
];

export const INVOICE_LINE_TYPES: InvoiceLineType[] = [
  "stock_purchase", "operational_expense", "fixed_cost", "variable_cost",
  "tax", "bank_fee", "salary", "internal_transfer", "service", "mixed", "other",
];

interface InvoiceProps {
  id: string;
  supplierId: string | null;
  supplierName: string;
  supplierNifSnapshot: string | null;
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
  source: InvoiceSource;
  aiExtractionStatus: AiExtractionStatus | null;
  aiConfidence: number | null;
  requiresReview: boolean;
  costCenterGroupId: string | null;
  financialType: string | null;
  affectsDre: boolean;
  affectsCashflow: boolean;
  affectsProfitability: boolean;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateInvoiceData {
  supplierId?: string | null;
  supplierName?: string;
  supplierNifSnapshot?: string | null;
  invoiceNumber?: string;
  invoiceDate?: Date;
  dueDate?: Date | null;
  subtotalWithoutVat?: number;
  totalVat?: number;
  totalWithVat?: number;
  notes?: string | null;
  attachmentUrl?: string | null;
  costCenterGroupId?: string | null;
  financialType?: string | null;
  affectsDre?: boolean;
  affectsCashflow?: boolean;
  affectsProfitability?: boolean;
  currency?: string;
}

export interface ConfirmImportData {
  supplierId?: string | null;
  supplierName?: string;
  supplierNifSnapshot?: string | null;
  invoiceNumber?: string;
  invoiceDate?: Date;
  dueDate?: Date | null;
  subtotalWithoutVat?: number;
  totalVat?: number;
  totalWithVat?: number;
  notes?: string | null;
  costCenterGroupId?: string | null;
  financialType?: string | null;
  affectsDre?: boolean;
  affectsCashflow?: boolean;
  affectsProfitability?: boolean;
  currency?: string;
}

export class Invoice {
  readonly id: string;
  readonly supplierId: string | null;
  readonly supplierName: string;
  readonly supplierNifSnapshot: string | null;
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
  readonly source: InvoiceSource;
  readonly aiExtractionStatus: AiExtractionStatus | null;
  readonly aiConfidence: number | null;
  readonly requiresReview: boolean;
  readonly costCenterGroupId: string | null;
  readonly financialType: string | null;
  readonly affectsDre: boolean;
  readonly affectsCashflow: boolean;
  readonly affectsProfitability: boolean;
  readonly currency: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: InvoiceProps) {
    this.id = props.id;
    this.supplierId = props.supplierId;
    this.supplierName = props.supplierName;
    this.supplierNifSnapshot = props.supplierNifSnapshot;
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
    this.source = props.source;
    this.aiExtractionStatus = props.aiExtractionStatus;
    this.aiConfidence = props.aiConfidence;
    this.requiresReview = props.requiresReview;
    this.costCenterGroupId = props.costCenterGroupId;
    this.financialType = props.financialType;
    this.affectsDre = props.affectsDre;
    this.affectsCashflow = props.affectsCashflow;
    this.affectsProfitability = props.affectsProfitability;
    this.currency = props.currency;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  // ── Factories ──────────────────────────────────────────────────────────────

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
    costCenterGroupId?: string | null;
    financialType?: string | null;
    affectsDre?: boolean;
    affectsCashflow?: boolean;
    affectsProfitability?: boolean;
    currency?: string;
  }): Invoice {
    const now = new Date();
    return new Invoice({
      id: crypto.randomUUID(),
      supplierId: props.supplierId ?? null,
      supplierName: props.supplierName.trim(),
      supplierNifSnapshot: null,
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
      source: "manual",
      aiExtractionStatus: null,
      aiConfidence: null,
      requiresReview: false,
      costCenterGroupId: props.costCenterGroupId ?? null,
      financialType: props.financialType ?? null,
      affectsDre: props.affectsDre ?? true,
      affectsCashflow: props.affectsCashflow ?? true,
      affectsProfitability: props.affectsProfitability ?? false,
      currency: props.currency ?? "EUR",
      createdAt: now,
      updatedAt: now,
    });
  }

  static createFromImport(props: {
    supplierId?: string | null;
    supplierName: string;
    supplierNifSnapshot?: string | null;
    invoiceNumber: string;
    invoiceDate: Date;
    dueDate?: Date | null;
    subtotalWithoutVat: number;
    totalVat: number;
    totalWithVat: number;
    source: InvoiceSource;
    attachmentUrl?: string | null;
    aiConfidence: number;
    requiresReview: boolean;
    currency?: string;
  }): Invoice {
    const now = new Date();
    return new Invoice({
      id: crypto.randomUUID(),
      supplierId: props.supplierId ?? null,
      supplierName: props.supplierName.trim(),
      supplierNifSnapshot: props.supplierNifSnapshot ?? null,
      invoiceNumber: props.invoiceNumber.trim(),
      invoiceDate: props.invoiceDate,
      dueDate: props.dueDate ?? null,
      paidAt: null,
      subtotalWithoutVat: props.subtotalWithoutVat,
      totalVat: props.totalVat,
      totalWithVat: props.totalWithVat,
      status: "draft_ai",
      notes: null,
      attachmentUrl: props.attachmentUrl ?? null,
      source: props.source,
      aiExtractionStatus: "done",
      aiConfidence: props.aiConfidence,
      requiresReview: props.requiresReview,
      costCenterGroupId: null,
      financialType: null,
      affectsDre: true,
      affectsCashflow: true,
      affectsProfitability: false,
      currency: props.currency ?? "EUR",
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: InvoiceProps): Invoice {
    return new Invoice(props);
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  update(data: UpdateInvoiceData): Invoice {
    const p = this.toProps();
    if (data.supplierId !== undefined) p.supplierId = data.supplierId;
    if (data.supplierName !== undefined) p.supplierName = data.supplierName.trim();
    if (data.supplierNifSnapshot !== undefined) p.supplierNifSnapshot = data.supplierNifSnapshot;
    if (data.invoiceNumber !== undefined) p.invoiceNumber = data.invoiceNumber.trim();
    if (data.invoiceDate !== undefined) p.invoiceDate = data.invoiceDate;
    if (data.dueDate !== undefined) p.dueDate = data.dueDate;
    if (data.subtotalWithoutVat !== undefined) p.subtotalWithoutVat = data.subtotalWithoutVat;
    if (data.totalVat !== undefined) p.totalVat = data.totalVat;
    if (data.totalWithVat !== undefined) p.totalWithVat = data.totalWithVat;
    if (data.notes !== undefined) p.notes = data.notes;
    if (data.attachmentUrl !== undefined) p.attachmentUrl = data.attachmentUrl;
    if (data.costCenterGroupId !== undefined) p.costCenterGroupId = data.costCenterGroupId;
    if (data.financialType !== undefined) p.financialType = data.financialType;
    if (data.affectsDre !== undefined) p.affectsDre = data.affectsDre;
    if (data.affectsCashflow !== undefined) p.affectsCashflow = data.affectsCashflow;
    if (data.affectsProfitability !== undefined) p.affectsProfitability = data.affectsProfitability;
    if (data.currency !== undefined) p.currency = data.currency;
    p.updatedAt = new Date();
    return new Invoice(p);
  }

  confirmImport(data: ConfirmImportData): Invoice {
    const p = this.toProps();
    if (data.supplierId !== undefined) p.supplierId = data.supplierId;
    if (data.supplierName !== undefined) p.supplierName = data.supplierName.trim();
    if (data.supplierNifSnapshot !== undefined) p.supplierNifSnapshot = data.supplierNifSnapshot;
    if (data.invoiceNumber !== undefined) p.invoiceNumber = data.invoiceNumber.trim();
    if (data.invoiceDate !== undefined) p.invoiceDate = data.invoiceDate;
    if (data.dueDate !== undefined) p.dueDate = data.dueDate;
    if (data.subtotalWithoutVat !== undefined) p.subtotalWithoutVat = data.subtotalWithoutVat;
    if (data.totalVat !== undefined) p.totalVat = data.totalVat;
    if (data.totalWithVat !== undefined) p.totalWithVat = data.totalWithVat;
    if (data.notes !== undefined) p.notes = data.notes;
    if (data.costCenterGroupId !== undefined) p.costCenterGroupId = data.costCenterGroupId;
    if (data.financialType !== undefined) p.financialType = data.financialType;
    if (data.affectsDre !== undefined) p.affectsDre = data.affectsDre;
    if (data.affectsCashflow !== undefined) p.affectsCashflow = data.affectsCashflow;
    if (data.affectsProfitability !== undefined) p.affectsProfitability = data.affectsProfitability;
    if (data.currency !== undefined) p.currency = data.currency;
    p.status = "pending";
    p.requiresReview = false;
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
      supplierNifSnapshot: this.supplierNifSnapshot,
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
      source: this.source,
      aiExtractionStatus: this.aiExtractionStatus,
      aiConfidence: this.aiConfidence,
      requiresReview: this.requiresReview,
      costCenterGroupId: this.costCenterGroupId,
      financialType: this.financialType,
      affectsDre: this.affectsDre,
      affectsCashflow: this.affectsCashflow,
      affectsProfitability: this.affectsProfitability,
      currency: this.currency,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
