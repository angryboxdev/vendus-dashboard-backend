import type {
  InvoiceStatus,
  InvoiceLineType,
  InvoiceSource,
  AiExtractionStatus,
} from "../../entities/invoice.js";

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface InvoiceLineDTO {
  id: string;
  invoiceId: string;
  description: string;
  type: InvoiceLineType;
  costCenterCategoryId: string | null;
  stockItemId: string | null;
  quantity: number;
  unit: string | null;
  unitCostWithoutVat: number;
  vatRate: number;
  vatAmount: number;
  totalWithVat: number;
  stockEntryId: string | null;
  affectsDre: boolean;
  affectsCashflow: boolean;
  affectsProfitability: boolean;
  createdAt: string;
}

export interface InvoiceDTO {
  id: string;
  supplierId: string | null;
  supplierName: string;
  supplierNifSnapshot: string | null;
  invoiceNumber: string;
  invoiceDate: string;    // YYYY-MM-DD
  dueDate: string | null;
  paidAt: string | null;
  isDirectDebit: boolean;
  directDebitDate: string | null; // YYYY-MM-DD
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
  costCenterCategoryId: string | null;
  financialType: string | null;
  affectsDre: boolean;
  affectsCashflow: boolean;
  affectsProfitability: boolean;
  currency: string;
  createdAt: string;
  updatedAt: string;
  lines?: InvoiceLineDTO[];
}

export interface SupplierMatchDTO {
  id: string;
  name: string;
  nif: string | null;
  defaultCostCenterGroupId: string | null;
  defaultCostCenterCategoryId: string | null;
  defaultFinancialType: string | null;
}

export interface AiExtractedLineDTO {
  description: string;
  quantity: number | null;
  unitPriceWithoutVat: number | null;
  vatRate: number | null;
  vatAmount: number | null;
  totalWithoutVat: number | null;
  totalWithVat: number | null;
}

export interface InvoiceImportResultDTO {
  invoice: InvoiceDTO;
  aiConfidence: number;
  validationIssues: string[];
  supplierMatch: SupplierMatchDTO | null;
  extractedLines: AiExtractedLineDTO[];
}

export interface InvoiceAlertsDTO {
  overdue: { count: number; totalAmount: number };
  dueToday: { count: number; totalAmount: number };
  dueIn7Days: { count: number; totalAmount: number };
  noDueDateCount: number;
  noSupplierCount: number;
  pendingReviewCount: number;
  lowAiConfidenceCount: number;
  valueDiscrepancyCount: number;
}

// ── Commands ──────────────────────────────────────────────────────────────────

export interface CreateInvoiceLineCommand {
  description: string;
  type?: InvoiceLineType;
  costCenterCategoryId?: string | null;
  stockItemId?: string | null;
  quantity: number;
  unit?: string | null;
  unitCostWithoutVat: number;
  vatRate: number;
  vatAmount: number;
  totalWithVat: number;
  affectsDre?: boolean;
  affectsCashflow?: boolean;
  affectsProfitability?: boolean;
}

export interface CreateInvoiceCommand {
  supplierId?: string | null;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  dueDate?: string | null;
  isDirectDebit?: boolean;
  directDebitDate?: string | null; // YYYY-MM-DD
  subtotalWithoutVat: number;
  totalVat: number;
  totalWithVat: number;
  notes?: string | null;
  attachmentUrl?: string | null;
  costCenterGroupId?: string | null;
  costCenterCategoryId?: string | null;
  financialType?: string | null;
  affectsDre?: boolean;
  affectsCashflow?: boolean;
  affectsProfitability?: boolean;
  currency?: string;
  lines?: CreateInvoiceLineCommand[];
}

export interface UpdateInvoiceCommand {
  id: string;
  supplierId?: string | null;
  supplierName?: string;
  supplierNifSnapshot?: string | null;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string | null;
  isDirectDebit?: boolean;
  directDebitDate?: string | null; // YYYY-MM-DD
  subtotalWithoutVat?: number;
  totalVat?: number;
  totalWithVat?: number;
  notes?: string | null;
  attachmentUrl?: string | null;
  costCenterGroupId?: string | null;
  costCenterCategoryId?: string | null;
  financialType?: string | null;
  affectsDre?: boolean;
  affectsCashflow?: boolean;
  affectsProfitability?: boolean;
  currency?: string;
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
  classify: {
    type?: InvoiceLineType;
    costCenterCategoryId?: string | null;
    stockItemId?: string | null;
  };
  saveAsRule?: boolean;
}

export interface ListInvoicesFilter {
  supplierId?: string;
  costCenterId?: string;
  status?: InvoiceStatus;
  from?: string; // YYYY-MM-DD
  to?: string;
  isDirectDebit?: boolean;
}

export interface SuggestClassificationResult {
  costCenterId: string | null;
  costCenterCategoryId: string | null;
  lineType: InvoiceLineType | null;
  category: string | null;
  confidenceScore: number; // 0.0 – 1.0
}

export interface ImportInvoiceCommand {
  fileBuffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface NewSupplierCommand {
  name: string;
  nif?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  iban?: string | null;
  defaultCostCenterGroupId?: string | null;
  defaultCostCenterCategoryId?: string | null;
  paymentTermsDays?: number | null;
}

export interface ConfirmImportedInvoiceCommand {
  id: string;
  supplierId?: string | null;
  /** Criar novo fornecedor com os dados da fatura — se presente, supplierId é ignorado */
  newSupplier?: NewSupplierCommand;
  supplierName?: string;
  supplierNifSnapshot?: string | null;
  invoiceNumber?: string;
  invoiceDate?: string; // YYYY-MM-DD
  dueDate?: string | null;
  isDirectDebit?: boolean;
  directDebitDate?: string | null; // YYYY-MM-DD
  subtotalWithoutVat?: number;
  totalVat?: number;
  totalWithVat?: number;
  notes?: string | null;
  costCenterGroupId?: string | null;
  costCenterCategoryId?: string | null;
  financialType?: string | null;
  affectsDre?: boolean;
  affectsCashflow?: boolean;
  affectsProfitability?: boolean;
  currency?: string;
  saveAsPayable?: boolean;
  markAsPaid?: boolean;
  paidAt?: string; // YYYY-MM-DD — used when markAsPaid is true; defaults to invoiceDate
  lines?: CreateInvoiceLineCommand[];
}

export interface AddInvoiceLineCommand {
  invoiceId: string;
  description: string;
  type?: InvoiceLineType;
  costCenterCategoryId?: string | null;
  quantity: number;
  unit?: string | null;
  unitCostWithoutVat: number;
  vatRate: number;
  vatAmount: number;
  totalWithVat: number;
  affectsDre?: boolean;
  affectsCashflow?: boolean;
  affectsProfitability?: boolean;
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

export interface AddInvoiceLinePort {
  execute(command: AddInvoiceLineCommand): Promise<InvoiceLineDTO>;
}

export interface ClassifyInvoiceLinePort {
  execute(command: ClassifyInvoiceLineCommand): Promise<InvoiceLineDTO>;
}

export interface ListInvoicesPort {
  execute(filter?: ListInvoicesFilter): Promise<InvoiceDTO[]>;
}

export interface ListInvoiceLinesPort {
  execute(): Promise<InvoiceLineDTO[]>;
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

export interface ImportInvoicePort {
  execute(command: ImportInvoiceCommand): Promise<InvoiceImportResultDTO>;
}

export interface ConfirmImportedInvoicePort {
  execute(command: ConfirmImportedInvoiceCommand): Promise<InvoiceDTO>;
}

export interface GetInvoiceAlertsPort {
  execute(): Promise<InvoiceAlertsDTO>;
}

export interface ProcessDirectDebitsPort {
  execute(): Promise<{ processed: number }>;
}
