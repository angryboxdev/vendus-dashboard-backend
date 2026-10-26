import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CategoryDivergence, DecisionSource, StockPurchaseReviewStatus } from "../../entities/stock-purchase-review.js";
import type { LocationSplit, ResolutionType } from "../../entities/stock-review-line.js";
import type { ReviewConference } from "../../services/review-conference.service.js";
import type { ContentUnit, InvoicedBy } from "../../entities/purchase-presentation.js";
import type { InvoiceLineToStock } from "../../services/presentation-conversion.service.js";

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface StockReviewLineDTO {
  id: string;
  invoiceLineId: string;
  description: string;
  purchaseQuantity: number;
  purchaseUnit: string;
  unitCostWithoutVat: number;
  totalWithVat: number;
  /** F3a — null em revisões anteriores (sem IVA da linha guardado). */
  vatAmount: number | null;
  netAmount: number | null;
  discountAmount: number | null;
  supplierItemCode: string | null;
  costCenterCategoryId: string | null;
  locationSplits: LocationSplit[] | null;
  /** F3b: conciliação proposta (não confirmada). */
  suggestion: {
    source: "learned" | "name_match" | "ai" | "none";
    resolution: "existing_item" | "no_stock_effect" | null;
    stockItemId: string | null;
    conversionFactor: number | null;
    confidence: number | null;
    packagingChanged: boolean;
  } | null;
  /** Apresentação de compra ativa e o que esta linha dá em embalagens/Stock/custos (null = por configurar). */
  packaging?: {
    presentation: PurchasePresentationDTO | null;
    preview: InvoiceLineToStock | null;
    baseUnit: string | null;
  };
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
  /** Resolvida sozinha por uma decisão já confirmada (associação/embalagem) — pode ser corrigida. */
  autoResolved: boolean;
  /** «EST.01 Ingredientes» — nome da categoria financeira da linha, quando conhecido. */
  costCenterCategoryLabel?: string | null;
}

export interface StockPurchaseReviewDTO {
  id: string;
  invoiceId: string;
  /** PDF da fatura de origem (só na leitura do detalhe); `null` sem anexo. */
  attachmentUrl?: string | null;
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
  invoiceNetCents: number | null;
  invoiceVatCents: number | null;
  invoiceTotalCents: number | null;
  /** Registadas ao confirmar (pendência para o Financeiro). */
  categoryDivergences: CategoryDivergence[] | null;
  /** F3c: origem do documento e pendência do Financeiro. */
  origin: "finance" | "stock";
  financePending: boolean;
  /** Conferências da F3a (documento / Stock / categorias), calculadas na leitura. */
  conference?: ReviewConference;
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
  /** F3b: progresso, valor e destino na fila. */
  resolvedLines: number;
  totalCents: number | null;
  locationId: string | null;
  decisionSource: DecisionSource;
  origin: "finance" | "stock";
  financePending: boolean;
}

// ── List ──────────────────────────────────────────────────────────────────

export interface ListStockPurchaseReviewsCommand {
  organizationId: OrganizationId;
  /** F3b: `active` = por tratar (omissão na UI); `history` = movimentadas, excluídas e retiradas. */
  view?: "active" | "history";
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
  /** F3a: divisão por lojas (≥ 2, quantidades explícitas que somam a da linha). */
  locationSplits?: LocationSplit[] | null;
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
  /** A unidade/embalagem da linha mudou desde o mapeamento aprendido — o fator tem de ser conferido de novo. */
  packagingChanged: boolean;
}

export interface SuggestLineMappingCommand {
  organizationId: OrganizationId;
  reviewId: string;
  lineId: string;
}

export interface SuggestLineMappingPort {
  execute(command: SuggestLineMappingCommand): Promise<SuggestedMappingDTO | null>;
}

// ── Conciliação em lote (F3b) ─────────────────────────────────────────────

export interface SuggestReviewMappingsCommand {
  organizationId: OrganizationId;
  reviewId: string;
  /** Volta a procurar mesmo nas linhas que já têm sugestão (ex.: depois de criar artigos). */
  refresh?: boolean;
}

export interface SuggestReviewMappingsPort {
  execute(command: SuggestReviewMappingsCommand): Promise<StockPurchaseReviewDTO>;
}

// ── Repor uma revisão retirada (F3b) ──────────────────────────────────────

export interface RestoreStockPurchaseReviewCommand {
  organizationId: OrganizationId;
  id: string;
  actor: string;
  expectedVersion: number;
}

export interface RestoreStockPurchaseReviewPort {
  execute(command: RestoreStockPurchaseReviewCommand): Promise<StockPurchaseReviewDTO>;
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
  /** F3a: IVA da linha (líquido com descontos = total − IVA). */
  vatAmount?: number | null;
  supplierItemCode?: string | null;
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
  /** F3c: `stock` = importada diretamente no Stock (cria sempre a revisão, pendente do Financeiro). */
  origin?: "finance" | "stock";
  /** F3a: totais da fatura (cêntimos) para a conferência do documento. */
  subtotalWithoutVat?: number | null;
  totalVat?: number | null;
  totalWithVat?: number | null;
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

// ── Apresentação de compra (task «embalagens e conversões») ───────────────

export interface PurchasePresentationDTO {
  id: string;
  supplierId: string;
  supplierReference: string | null;
  description: string;
  stockItemId: string;
  /** saco, caixa, lata… — null = não vem em embalagem. */
  packageUnit: string | null;
  contentQuantity: number;
  contentUnit: ContentUnit;
  invoicedBy: InvoicedBy;
  minOrderPackages: number;
  orderIncrementPackages: number;
  source: "user" | "document" | "catalog";
  confidence: number | null;
  createdBy: string | null;
  createdAt: string;
  supersededAt: string | null;
}

export interface SavePurchasePresentationCommand {
  organizationId: OrganizationId;
  supplierId: string;
  supplierReference: string | null;
  description: string;
  stockItemId: string;
  packageUnit: string | null;
  contentQuantity: number;
  contentUnit: ContentUnit;
  invoicedBy: InvoicedBy;
  minOrderPackages?: number;
  orderIncrementPackages?: number;
  actor: string;
}

export interface SavePurchasePresentationPort {
  execute(command: SavePurchasePresentationCommand): Promise<PurchasePresentationDTO>;
}

export interface ListPurchasePresentationsPort {
  execute(organizationId: OrganizationId, supplierId: string): Promise<PurchasePresentationDTO[]>;
}

// ── Regras de entrada no Stock por tipo de artigo (V4 §2) ─────────────────

export interface SaveEntryRulesCommand {
  organizationId: OrganizationId;
  rules: Record<string, "stock" | "no_stock" | "review">;
  actor: string;
}

export interface EntryRulesPort {
  get(organizationId: OrganizationId): Promise<Record<string, "stock" | "no_stock" | "review">>;
  save(command: SaveEntryRulesCommand): Promise<Record<string, "stock" | "no_stock" | "review">>;
}

// ── Localização principal do Stock (task V5 §2.4) ─────────────────────────

export interface StockSettingsDTO {
  /** Loja das entradas de faturas; `null` = não configurada (ou deixou de estar ativa). */
  defaultLocationId: string | null;
  /** Lojas ativas, para escolher. */
  locations: { id: string; name: string }[];
}

export interface SaveStockSettingsCommand {
  organizationId: OrganizationId;
  defaultLocationId: string | null;
  actor: string;
}

export interface StockSettingsPort {
  get(organizationId: OrganizationId): Promise<StockSettingsDTO>;
  save(command: SaveStockSettingsCommand): Promise<StockSettingsDTO>;
}
