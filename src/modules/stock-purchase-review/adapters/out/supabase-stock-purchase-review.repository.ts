import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { StockPurchaseReview, type DecisionSource, type StockPurchaseReviewStatus } from "../../domain/entities/stock-purchase-review.js";
import { StockReviewLine, type ResolutionType } from "../../domain/entities/stock-review-line.js";
import { StaleReviewVersionError } from "../../domain/errors.js";
import type {
  StockPurchaseReviewFilter,
  StockPurchaseReviewRepositoryPort,
} from "../../domain/ports/out/stock-purchase-review-repository.port.js";

function reviewToEntity(row: Record<string, unknown>): StockPurchaseReview {
  return StockPurchaseReview.reconstitute({
    id: row.id as string,
    organizationId: row.org_id as string,
    invoiceId: row.invoice_id as string,
    status: row.status as StockPurchaseReviewStatus,
    version: row.version as number,
    sourceInvoiceVersion: row.source_invoice_version as number,
    sourceHash: row.source_hash as string,
    decisionSource: row.decision_source as DecisionSource,
    decisionCategoryId: (row.decision_category_id as string | null) ?? null,
    decisionSupplierId: (row.decision_supplier_id as string | null) ?? null,
    decisionPolicyUsed: row.decision_policy_used as string,
    decisionActor: (row.decision_actor as string | null) ?? null,
    decisionOverrideReason: (row.decision_override_reason as string | null) ?? null,
    decisionAt: new Date(row.decision_at as string),
    supplierName: row.supplier_name as string,
    invoiceNumber: row.invoice_number as string,
    invoiceDate: row.invoice_date as string,
    locationId: (row.location_id as string | null) ?? null,
    appliedAt: row.applied_at ? new Date(row.applied_at as string) : null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at as string) : null,
    cancellationReason: (row.cancellation_reason as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  });
}

function lineToEntity(row: Record<string, unknown>): StockReviewLine {
  return StockReviewLine.reconstitute({
    id: row.id as string,
    organizationId: row.org_id as string,
    reviewId: row.review_id as string,
    invoiceLineId: row.invoice_line_id as string,
    description: row.description as string,
    purchaseQuantity: Number(row.purchase_quantity),
    purchaseUnit: row.purchase_unit as string,
    unitCostWithoutVat: Number(row.unit_cost_without_vat),
    totalWithVat: Number(row.total_with_vat),
    resolutionType: row.resolution_type as ResolutionType,
    stockItemId: (row.stock_item_id as string | null) ?? null,
    conversionFactor: row.conversion_factor != null ? Number(row.conversion_factor) : null,
    stockQuantity: row.stock_quantity != null ? Number(row.stock_quantity) : null,
    locationId: (row.location_id as string | null) ?? null,
    unitCostPerBaseUnitWithVat: row.unit_cost_per_base_unit_with_vat != null ? Number(row.unit_cost_per_base_unit_with_vat) : null,
    unitCostPerBaseUnitWithoutVat: row.unit_cost_per_base_unit_without_vat != null ? Number(row.unit_cost_per_base_unit_without_vat) : null,
    flaggedSuspiciousConversion: Boolean(row.flagged_suspicious_conversion),
    flagReason: (row.flag_reason as string | null) ?? null,
    resolvedBy: (row.resolved_by as string | null) ?? null,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : null,
    createdAt: new Date(row.created_at as string),
  });
}

function lineToRow(line: StockReviewLine): Record<string, unknown> {
  const p = line.toProps();
  return {
    id: p.id,
    review_id: p.reviewId,
    invoice_line_id: p.invoiceLineId,
    description: p.description,
    purchase_quantity: p.purchaseQuantity,
    purchase_unit: p.purchaseUnit,
    unit_cost_without_vat: p.unitCostWithoutVat,
    total_with_vat: p.totalWithVat,
    resolution_type: p.resolutionType,
    stock_item_id: p.stockItemId,
    conversion_factor: p.conversionFactor,
    stock_quantity: p.stockQuantity,
    location_id: p.locationId,
    unit_cost_per_base_unit_with_vat: p.unitCostPerBaseUnitWithVat,
    unit_cost_per_base_unit_without_vat: p.unitCostPerBaseUnitWithoutVat,
    flagged_suspicious_conversion: p.flaggedSuspiciousConversion,
    flag_reason: p.flagReason,
    resolved_by: p.resolvedBy,
    resolved_at: p.resolvedAt ? p.resolvedAt.toISOString() : null,
    created_at: p.createdAt.toISOString(),
  };
}

export class SupabaseStockPurchaseReviewRepository implements StockPurchaseReviewRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findById(organizationId: OrganizationId, id: string): Promise<StockPurchaseReview | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("stock_purchase_reviews")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? reviewToEntity(data as unknown as Record<string, unknown>) : null;
  }

  async findByInvoiceId(organizationId: OrganizationId, invoiceId: string): Promise<StockPurchaseReview | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("stock_purchase_reviews")
      .select("*")
      .eq("invoice_id", invoiceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? reviewToEntity(data as unknown as Record<string, unknown>) : null;
  }

  async findAll(organizationId: OrganizationId, filter?: StockPurchaseReviewFilter): Promise<StockPurchaseReview[]> {
    let q = this.scopedQuery(organizationId).table("stock_purchase_reviews").select("*").order("invoice_date", { ascending: false });
    if (filter?.status) q = q.eq("status", filter.status);
    if (filter?.supplierId) q = q.eq("decision_supplier_id", filter.supplierId);
    if (filter?.from) q = q.gte("invoice_date", filter.from);
    if (filter?.to) q = q.lte("invoice_date", filter.to);
    if (filter?.search) {
      const like = `%${filter.search}%`;
      q = q.or(`supplier_name.ilike.${like},invoice_number.ilike.${like}`);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(reviewToEntity);
  }

  async save(organizationId: OrganizationId, review: StockPurchaseReview, expectedVersion?: number): Promise<void> {
    const p = review.toProps();
    const row = {
      status: p.status,
      version: p.version,
      decision_source: p.decisionSource,
      decision_category_id: p.decisionCategoryId,
      decision_supplier_id: p.decisionSupplierId,
      decision_policy_used: p.decisionPolicyUsed,
      decision_actor: p.decisionActor,
      decision_override_reason: p.decisionOverrideReason,
      decision_at: p.decisionAt.toISOString(),
      location_id: p.locationId,
      applied_at: p.appliedAt ? p.appliedAt.toISOString() : null,
      cancelled_at: p.cancelledAt ? p.cancelledAt.toISOString() : null,
      cancellation_reason: p.cancellationReason,
      updated_at: p.updatedAt.toISOString(),
    };
    let q = this.scopedQuery(organizationId).table("stock_purchase_reviews").update(row).eq("id", p.id);
    if (expectedVersion !== undefined) q = q.eq("version", expectedVersion);
    const { data, error } = await q.select("id");
    if (error) throw new Error(error.message);
    if (expectedVersion !== undefined && (!data || data.length === 0)) {
      throw new StaleReviewVersionError(p.version);
    }
  }

  async findLinesByReviewId(organizationId: OrganizationId, reviewId: string): Promise<StockReviewLine[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("stock_review_lines")
      .select("*")
      .eq("review_id", reviewId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(lineToEntity);
  }

  async saveLines(organizationId: OrganizationId, lines: StockReviewLine[]): Promise<void> {
    if (lines.length === 0) return;
    const { error } = await this.scopedQuery(organizationId).table("stock_review_lines").insert(lines.map(lineToRow));
    if (error) throw new Error(error.message);
  }

  async saveLine(organizationId: OrganizationId, line: StockReviewLine): Promise<void> {
    const { id, ...row } = lineToRow(line);
    const { error } = await this.scopedQuery(organizationId).table("stock_review_lines").update(row).eq("id", id as string);
    if (error) throw new Error(error.message);
  }
}
