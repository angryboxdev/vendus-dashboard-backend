import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import type { InvoiceLineType } from "../../domain/entities/invoice.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";

function toEntity(row: Record<string, unknown>): InvoiceLine {
  return InvoiceLine.reconstitute({
    id: row.id as string,
    invoiceId: row.invoice_id as string,
    description: row.description as string,
    type: row.type as InvoiceLineType,
    costCenterId: (row.cost_center_id as string | null) ?? null,
    costCenterCategoryId: (row.cost_center_category_id as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    subcategory: (row.subcategory as string | null) ?? null,
    stockItemId: (row.stock_item_id as string | null) ?? null,
    quantity: row.quantity as number,
    unit: (row.unit as string | null) ?? null,
    unitCostWithoutVat: row.unit_cost_without_vat as number,
    vatRate: row.vat_rate as number,
    vatAmount: row.vat_amount as number,
    totalWithVat: row.total_with_vat as number,
    stockEntryId: (row.stock_entry_id as string | null) ?? null,
    affectsDre: (row.affects_dre as boolean | null) ?? true,
    affectsCashflow: (row.affects_cashflow as boolean | null) ?? true,
    affectsProfitability: (row.affects_profitability as boolean | null) ?? false,
    locationId: (row.location_id as string | null) ?? null,
    financialType: (row.financial_type as string | null) ?? null,
    channelId: (row.channel_id as string | null) ?? null,
    requiresChannel: (row.requires_channel as boolean | null) ?? false,
    requiresAllocation: (row.requires_allocation as boolean | null) ?? false,
    aiSuggestedCategoryId: (row.ai_suggested_category_id as string | null) ?? null,
    aiConfidence: (row.ai_confidence as number | null) ?? null,
    createdAt: new Date(row.created_at as string),
  });
}

/**
 * Nunca guarda um `SupabaseClient` — recebe o factory `createScopedQuery`
 * (`ScopedQueryFactory`) injectado pelo composition root e constrói um
 * `ScopedQuery` por chamada (D2).
 */
export class SupabaseInvoiceLineRepository implements InvoiceLineRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async saveAll(organizationId: OrganizationId, lines: InvoiceLine[]): Promise<void> {
    if (lines.length === 0) return;
    const rows = lines.map((l) => ({
      id: l.id,
      invoice_id: l.invoiceId,
      description: l.description,
      type: l.type,
      cost_center_id: l.costCenterId,
      cost_center_category_id: l.costCenterCategoryId,
      category: l.category,
      subcategory: l.subcategory,
      stock_item_id: l.stockItemId,
      quantity: l.quantity,
      unit: l.unit,
      unit_cost_without_vat: l.unitCostWithoutVat,
      vat_rate: l.vatRate,
      vat_amount: l.vatAmount,
      total_with_vat: l.totalWithVat,
      stock_entry_id: l.stockEntryId,
      affects_dre: l.affectsDre,
      affects_cashflow: l.affectsCashflow,
      affects_profitability: l.affectsProfitability,
      location_id: l.locationId,
      financial_type: l.financialType,
      channel_id: l.channelId,
      requires_channel: l.requiresChannel,
      requires_allocation: l.requiresAllocation,
      ai_suggested_category_id: l.aiSuggestedCategoryId,
      ai_confidence: l.aiConfidence,
      created_at: l.createdAt.toISOString(),
    }));
    const { error } = await this.scopedQuery(organizationId).table("invoice_lines").insert(rows);
    if (error) throw new Error(error.message);
  }

  async findAll(organizationId: OrganizationId): Promise<InvoiceLine[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("invoice_lines")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => toEntity(r));
  }

  async findByInvoiceId(organizationId: OrganizationId, invoiceId: string): Promise<InvoiceLine[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("invoice_lines")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => toEntity(r));
  }

  async updateLine(organizationId: OrganizationId, line: InvoiceLine): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("invoice_lines")
      .update({
        description: line.description,
        type: line.type,
        cost_center_id: line.costCenterId,
        cost_center_category_id: line.costCenterCategoryId,
        category: line.category,
        subcategory: line.subcategory,
        stock_item_id: line.stockItemId,
        quantity: line.quantity,
        unit: line.unit,
        unit_cost_without_vat: line.unitCostWithoutVat,
        vat_rate: line.vatRate,
        vat_amount: line.vatAmount,
        total_with_vat: line.totalWithVat,
        stock_entry_id: line.stockEntryId,
        affects_dre: line.affectsDre,
        affects_cashflow: line.affectsCashflow,
        affects_profitability: line.affectsProfitability,
        location_id: line.locationId,
        financial_type: line.financialType,
        channel_id: line.channelId,
        requires_channel: line.requiresChannel,
        requires_allocation: line.requiresAllocation,
        ai_suggested_category_id: line.aiSuggestedCategoryId,
        ai_confidence: line.aiConfidence,
      })
      .eq("id", line.id);
    if (error) throw new Error(error.message);
  }

  async deleteByInvoiceId(organizationId: OrganizationId, invoiceId: string): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("invoice_lines")
      .delete()
      .eq("invoice_id", invoiceId);
    if (error) throw new Error(error.message);
  }

  async deleteLineById(organizationId: OrganizationId, lineId: string): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("invoice_lines")
      .delete()
      .eq("id", lineId);
    if (error) throw new Error(error.message);
  }

  async updateCostCenterCategoryForInvoice(
    organizationId: OrganizationId,
    invoiceId: string,
    categoryId: string | null,
  ): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("invoice_lines")
      .update({ cost_center_category_id: categoryId })
      .eq("invoice_id", invoiceId);
    if (error) throw new Error(error.message);
  }
}
