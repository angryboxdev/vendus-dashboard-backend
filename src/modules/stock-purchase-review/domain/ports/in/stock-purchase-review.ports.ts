import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DecisionSource, StockPurchaseReviewStatus } from "../../entities/stock-purchase-review.js";
import type { ResolutionType } from "../../entities/stock-review-line.js";

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface StockReviewLineDTO {
  id: string;
  invoiceLineId: string;
  description: string;
  purchaseQuantity: number;
  purchaseUnit: string;
  unitCostWithoutVat: number;
  totalWithVat: number;
  resolutionType: ResolutionType;
  stockItemId: string | null;
  conversionFactor: number | null;
  stockQuantity: number | null;
  locationId: string | null;
  unitCostPerBaseUnitWithVat: number | null;
  unitCostPerBaseUnitWithoutVat: number | null;
  flaggedSuspiciousConversion: boolean;
  flagReason: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export interface StockPurchaseReviewDTO {
  id: string;
  invoiceId: string;
  status: StockPurchaseReviewStatus;
  version: number;
  decisionSource: DecisionSource;
  decisionCategoryId: string | null;
  decisionSupplierId: string | null;
  decisionPolicyUsed: string;
  decisionActor: string | null;
  decisionOverrideReason: string | null;
  decisionAt: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  locationId: string | null;
  appliedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  lines: StockReviewLineDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface StockPurchaseReviewRowDTO {
  id: string;
  invoiceId: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  status: StockPurchaseReviewStatus;
  linesCount: number;
}

// ── List ──────────────────────────────────────────────────────────────────

export interface ListStockPurchaseReviewsCommand {
  organizationId: OrganizationId;
  status?: StockPurchaseReviewStatus;
  supplierId?: string;
  from?: string;
  to?: string;
  search?: string;
}

export interface ListStockPurchaseReviewsPort {
  execute(command: ListStockPurchaseReviewsCommand): Promise<StockPurchaseReviewRowDTO[]>;
}

// ── Get ───────────────────────────────────────────────────────────────────

export interface GetStockPurchaseReviewCommand {
  organizationId: OrganizationId;
  id: string;
}

export interface GetStockPurchaseReviewPort {
  execute(command: GetStockPurchaseReviewCommand): Promise<StockPurchaseReviewDTO>;
}

// ── Resolve line ──────────────────────────────────────────────────────────

export interface ResolveReviewLineCommand {
  organizationId: OrganizationId;
  reviewId: string;
  lineId: string;
  expectedVersion: number;
  resolution: "existing_item" | "new_item" | "no_stock_effect";
  stockItemId?: string | null;
  newItem?: { name: string; categoryId: string; type: string; baseUnit: string };
  conversionFactor?: number;
  locationId?: string | null;
  actor: string;
}

export interface ResolveReviewLinePort {
  execute(command: ResolveReviewLineCommand): Promise<StockPurchaseReviewDTO>;
}

// ── Decide unresolved ─────────────────────────────────────────────────────

export interface DecideUnresolvedReviewCommand {
  organizationId: OrganizationId;
  reviewId: string;
  outcome: "create" | "skip";
  actor: string;
  expectedVersion: number;
}

export interface DecideUnresolvedReviewPort {
  execute(command: DecideUnresolvedReviewCommand): Promise<StockPurchaseReviewDTO>;
}

// ── Suggest mapping ───────────────────────────────────────────────────────

export interface SuggestedMappingDTO {
  resolutionType: "existing_item" | "no_stock_effect";
  stockItemId: string | null;
  conversionFactor: number | null;
  purchaseUnit: string | null;
  isItemActive: boolean;
}

export interface SuggestLineMappingCommand {
  organizationId: OrganizationId;
  reviewId: string;
  lineId: string;
}

export interface SuggestLineMappingPort {
  execute(command: SuggestLineMappingCommand): Promise<SuggestedMappingDTO | null>;
}

// ── Confirm ───────────────────────────────────────────────────────────────

export interface ConfirmStockPurchaseReviewCommand {
  organizationId: OrganizationId;
  id: string;
  expectedVersion: number;
  actor: string;
  effectiveDate?: string;
  /** Só necessário quando alguma linha não tem `locationId` e há mais que uma loja ativa. */
  locationId?: string | null;
}

export interface ConfirmStockPurchaseReviewPort {
  execute(command: ConfirmStockPurchaseReviewCommand): Promise<StockPurchaseReviewDTO>;
}

// ── Cancel ────────────────────────────────────────────────────────────────

export interface CancelStockPurchaseReviewCommand {
  organizationId: OrganizationId;
  id: string;
  reason: string;
  actor: string;
  expectedVersion: number;
}

export interface CancelStockPurchaseReviewPort {
  execute(command: CancelStockPurchaseReviewCommand): Promise<StockPurchaseReviewDTO>;
}

// ── Cancelar em lote as revisões sem linhas (remediação, ver README) ──────

export interface CancelEmptyStockPurchaseReviewsCommand {
  organizationId: OrganizationId;
  actor: string;
}

export interface CancelledEmptyReviewSummary {
  id: string;
  invoiceNumber: string;
  supplierName: string;
}

export interface CancelEmptyStockPurchaseReviewsResult {
  cancelledCount: number;
  cancelled: CancelledEmptyReviewSummary[];
}

export interface CancelEmptyStockPurchaseReviewsPort {
  execute(command: CancelEmptyStockPurchaseReviewsCommand): Promise<CancelEmptyStockPurchaseReviewsResult>;
}

// ── Gancho interno (chamado por `invoices`, D10) ─────────────────────────

export interface RecordInvoiceFinalizedForStockLineData {
  id: string;
  description: string;
  quantity: number;
  unit: string | null;
  unitCostWithoutVat: number;
  totalWithVat: number;
  costCenterCategoryId: string | null;
  locationId: string | null;
}

export interface RecordInvoiceFinalizedForStockCommand {
  organizationId: OrganizationId;
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  supplierId: string | null;
  supplierName: string;
  supplierNif: string | null;
  override: "auto" | "force_create" | "force_skip";
  overrideReason: string | null;
  lines: RecordInvoiceFinalizedForStockLineData[];
  actor: string | null;
}

export interface RecordInvoiceFinalizedForStockPort {
  execute(command: RecordInvoiceFinalizedForStockCommand): Promise<void>;
}

// ── Varredura de recuperação (cron) ───────────────────────────────────────

export interface ReprocessMissingStockReviewsCommand {
  organizationId: OrganizationId;
}

export interface ReprocessMissingStockReviewsResult {
  invoicesScanned: number;
  reviewsCreated: number;
}

export interface ReprocessMissingStockReviewsPort {
  execute(command: ReprocessMissingStockReviewsCommand): Promise<ReprocessMissingStockReviewsResult>;
}

// ── Estado da revisão de uma fatura (chamado por `invoices`, D10) ────────

export interface GetStockPurchaseReviewStatusCommand {
  organizationId: OrganizationId;
  invoiceId: string;
}

export interface StockPurchaseReviewStatusSnapshotDTO {
  reviewId: string;
  status: StockPurchaseReviewStatus;
}

export interface GetStockPurchaseReviewStatusPort {
  execute(command: GetStockPurchaseReviewStatusCommand): Promise<StockPurchaseReviewStatusSnapshotDTO | null>;
}

// ── Hard-delete de rascunho nunca aplicado (chamado por `invoices`, D10) ──

/**
 * Única exceção deliberada e estreita à regra "nunca hard delete" deste
 * módulo — ver `DeleteDraftStockPurchaseReviewUseCase` e o README (Design
 * decisions). Chamado quando o utilizador de `invoices` confirma que quer
 * mudar o impacto em stock duma fatura cuja revisão associada ainda não
 * foi aplicada.
 */
export interface DeleteDraftStockPurchaseReviewCommand {
  organizationId: OrganizationId;
  invoiceId: string;
  actor: string;
}

export interface DeleteDraftStockPurchaseReviewResult {
  deleted: boolean;
}

export interface DeleteDraftStockPurchaseReviewPort {
  execute(command: DeleteDraftStockPurchaseReviewCommand): Promise<DeleteDraftStockPurchaseReviewResult>;
}
