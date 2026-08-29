import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type {
  InvoiceStatus,
  InvoiceLineType,
  InvoiceSource,
  AiExtractionStatus,
  ReconciliationStatus,
  LineDetailMode,
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
  financialType: string | null;
  channelId: string | null;
  requiresChannel: boolean;
  requiresAllocation: boolean;
  /** Loja a que este custo é alocado; null quando o custo é da organização inteira (D3/D4). */
  locationId: string | null;
  /** Valor para DRE/Rentabilidade: totalWithVat − vatAmount (sem IVA) */
  dreValue: number;
  /** Valor para Fluxo de Caixa: totalWithVat (com IVA) */
  cashflowValue: number;
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
  reconciliationStatus: ReconciliationStatus;
  lineDetailMode: LineDetailMode;
  paymentBankAccountId: string | null;
  paymentMethod: string | null;
  paymentNotes: string | null;
  competenceDate: string | null; // YYYY-MM-DD
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
  /** Presente apenas quando lineDetailMode === "detailed" e as linhas foram carregadas. */
  linesSummary?: {
    subtotalWithoutVat: number;
    totalVat: number;
    totalWithVat: number;
    /** true quando qualquer dos três totais difere dos totais da fatura em mais de 1 cêntimo. */
    totalsMismatch: boolean;
  };
  /**
   * Resumo de classificação derivado das linhas reais.
   * - "unique": todas as linhas têm a mesma subcategoria.
   * - "mixed": linhas com subcategorias diferentes.
   * - "none": nenhuma linha está classificada.
   */
  classificationSummary: {
    mode: "unique" | "mixed" | "none";
    entries: Array<{
      costCenterCategoryId: string;
      code: string;
      name: string;
      financialType: string | null;
      /** Soma de totalWithVat das linhas com esta subcategoria (em cêntimos). */
      totalWithVat: number;
    }>;
  };
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
  pendingReconciliation: { count: number; totalAmount: number };
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
  /** Loja a que este custo é alocado (spec B2 D4) — opcional; ausente/null = custo da organização. */
  locationId?: string | null;
}

export interface CreateInvoiceCommand {
  organizationId: OrganizationId;
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
  organizationId: OrganizationId;
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
  organizationId: OrganizationId;
  id: string;
  paidAt?: string; // YYYY-MM-DD — defaults to today
  bankAccountId?: string | null;
  paymentMethod?: string | null;
  paymentNotes?: string | null;
}

export interface SetLineDetailModeCommand {
  organizationId: OrganizationId;
  id: string;
  mode: LineDetailMode;
}

export interface SetInvoiceStatusCommand {
  organizationId: OrganizationId;
  id: string;
  status: InvoiceStatus;
}

export interface ClassifyInvoiceLineCommand {
  organizationId: OrganizationId;
  invoiceId: string;
  lineId: string;
  classify: {
    type?: InvoiceLineType;
    costCenterCategoryId?: string | null;
    stockItemId?: string | null;
    channelId?: string | null;
  };
  saveAsRule?: boolean;
}

export interface ListInvoicesFilter {
  supplierId?: string;
  costCenterId?: string;
  status?: InvoiceStatus;
  reconciliationStatus?: ReconciliationStatus;
  from?: string; // YYYY-MM-DD
  to?: string;
  isDirectDebit?: boolean;
  search?: string; // free-text: supplier name or invoice number
}

export interface SuggestClassificationResult {
  costCenterId: string | null;
  costCenterCategoryId: string | null;
  lineType: InvoiceLineType | null;
  category: string | null;
  channelId: string | null;
  confidenceScore: number; // 0.0 – 1.0
}

export interface ImportInvoiceCommand {
  organizationId: OrganizationId;
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
  organizationId: OrganizationId;
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
  organizationId: OrganizationId;
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
  /** Loja a que este custo é alocado (spec B2 D4) — opcional; ausente/null = custo da organização. */
  locationId?: string | null;
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
  execute(organizationId: OrganizationId, filter?: ListInvoicesFilter): Promise<InvoiceDTO[]>;
}

export interface ListInvoiceLinesPort {
  execute(organizationId: OrganizationId): Promise<InvoiceLineDTO[]>;
}

export interface GetInvoicePort {
  execute(organizationId: OrganizationId, id: string): Promise<InvoiceDTO>;
}

export interface DeleteInvoicePort {
  execute(organizationId: OrganizationId, id: string): Promise<void>;
}

export interface SuggestLineClassificationPort {
  execute(
    organizationId: OrganizationId,
    supplierId: string,
    description?: string,
  ): Promise<SuggestClassificationResult | null>;
}

export interface ImportInvoicePort {
  execute(command: ImportInvoiceCommand): Promise<InvoiceImportResultDTO>;
}

export interface ConfirmImportedInvoicePort {
  execute(command: ConfirmImportedInvoiceCommand): Promise<InvoiceDTO>;
}

export interface GetInvoiceAlertsPort {
  execute(organizationId: OrganizationId): Promise<InvoiceAlertsDTO>;
}

export interface ProcessDirectDebitsPort {
  execute(organizationId: OrganizationId): Promise<{ processed: number }>;
}

export interface SetLineDetailModePort {
  execute(command: SetLineDetailModeCommand): Promise<InvoiceDTO>;
}

export interface UpdateInvoiceLineCommand {
  organizationId: OrganizationId;
  invoiceId: string;
  lineId: string;
  description?: string;
  quantity?: number;
  unit?: string | null;
  unitCostWithoutVat?: number;
  vatRate?: number;
  vatAmount?: number;
  totalWithVat?: number;
  /** Loja a que este custo é alocado (spec B2 D4) — opcional; ausente = não altera; null = desaloca. */
  locationId?: string | null;
}

export interface UpdateInvoiceLinePort {
  execute(command: UpdateInvoiceLineCommand): Promise<InvoiceLineDTO>;
}

export interface DeleteInvoiceLinePort {
  execute(organizationId: OrganizationId, invoiceId: string, lineId: string): Promise<void>;
}
