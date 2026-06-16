import type { InvoiceStatus, InvoiceLineType } from "../../entities/invoice.js";
import type { ClassifyLineData } from "../../entities/invoice-line.js";

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface InvoiceLineDTO {
  id: string;
  invoiceId: string;
  description: string;
  type: InvoiceLineType;
  costCenterId: string | null;
  category: string | null;
  subcategory: string | null;
  stockItemId: string | null;
  quantity: number;
  unit: string | null;
  unitCostWithoutVat: number;
  vatRate: number;
  vatAmount: number;
  totalWithVat: number;
  stockEntryId: string | null;
  createdAt: string;
}

export interface InvoiceDTO {
  id: string;
  supplierId: string | null;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;    // YYYY-MM-DD
  dueDate: string | null;
  paidAt: string | null;
  subtotalWithoutVat: number;
  totalVat: number;
  totalWithVat: number;
  status: InvoiceStatus;
  notes: string | null;
  attachmentUrl: string | null;
  createdAt: string;
  updatedAt: string;
  lines?: InvoiceLineDTO[];
}

// ── Commands ──────────────────────────────────────────────────────────────────

export interface CreateInvoiceLineCommand {
  description: string;
  type?: InvoiceLineType;
  costCenterId?: string | null;
  category?: string | null;
  subcategory?: string | null;
  stockItemId?: string | null;
  quantity: number;
  unit?: string | null;
  unitCostWithoutVat: number;
  vatRate: number;
  vatAmount: number;
  totalWithVat: number;
}

export interface CreateInvoiceCommand {
  supplierId?: string | null;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  dueDate?: string | null;
  subtotalWithoutVat: number;
  totalVat: number;
  totalWithVat: number;
  notes?: string | null;
  attachmentUrl?: string | null;
  lines?: CreateInvoiceLineCommand[];
}

export interface UpdateInvoiceCommand {
  id: string;
  supplierId?: string | null;
  supplierName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string | null;
  subtotalWithoutVat?: number;
  totalVat?: number;
  totalWithVat?: number;
  notes?: string | null;
  attachmentUrl?: string | null;
}

export interface MarkInvoicePaidCommand {
  id: string;
  paidAt?: string; // YYYY-MM-DD — defaults to today
}

export interface SetInvoiceStatusCommand {
  id: string;
  status: InvoiceStatus;
}

export interface ClassifyInvoiceLineCommand {
  invoiceId: string;
  lineId: string;
  classify: ClassifyLineData;
  saveAsRule?: boolean;
}

export interface ListInvoicesFilter {
  supplierId?: string;
  costCenterId?: string;
  status?: InvoiceStatus;
  from?: string; // YYYY-MM-DD
  to?: string;
}

export interface SuggestClassificationResult {
  costCenterId: string | null;
  lineType: InvoiceLineType | null;
  category: string | null;
  confidenceScore: number; // 0.0 – 1.0
}

// ── Input ports ───────────────────────────────────────────────────────────────

export interface CreateInvoicePort {
  execute(command: CreateInvoiceCommand): Promise<InvoiceDTO>;
}

export interface UpdateInvoicePort {
  execute(command: UpdateInvoiceCommand): Promise<InvoiceDTO>;
}

export interface MarkInvoicePaidPort {
  execute(command: MarkInvoicePaidCommand): Promise<InvoiceDTO>;
}

export interface SetInvoiceStatusPort {
  execute(command: SetInvoiceStatusCommand): Promise<InvoiceDTO>;
}

export interface ClassifyInvoiceLinePort {
  execute(command: ClassifyInvoiceLineCommand): Promise<InvoiceLineDTO>;
}

export interface ListInvoicesPort {
  execute(filter?: ListInvoicesFilter): Promise<InvoiceDTO[]>;
}

export interface GetInvoicePort {
  execute(id: string): Promise<InvoiceDTO>;
}

export interface DeleteInvoicePort {
  execute(id: string): Promise<void>;
}

export interface SuggestLineClassificationPort {
  execute(supplierId: string): Promise<SuggestClassificationResult | null>;
}
