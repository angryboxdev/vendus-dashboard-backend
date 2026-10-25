import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { PurchasePresentation, type ContentUnit, type InvoicedBy } from "../../domain/entities/purchase-presentation.js";
import type { PurchasePresentationRepositoryPort } from "../../domain/ports/out/purchase-presentation-repository.port.js";

function toEntity(row: Record<string, unknown>): PurchasePresentation {
  return PurchasePresentation.reconstitute({
    id: row.id as string,
    organizationId: row.org_id as string,
    supplierId: row.supplier_id as string,
    supplierReference: (row.supplier_reference as string | null) ?? null,
    description: row.description as string,
    stockItemId: row.stock_item_id as string,
    packageUnit: (row.package_unit as string | null) ?? null,
    contentQuantity: Number(row.content_quantity),
    contentUnit: row.content_unit as ContentUnit,
    invoicedBy: row.invoiced_by as InvoicedBy,
    minOrderPackages: Number(row.min_order_packages),
    orderIncrementPackages: Number(row.order_increment_packages),
    source: row.source as "user" | "document" | "catalog",
    confidence: row.confidence != null ? Number(row.confidence) : null,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
    supersededAt: row.superseded_at ? new Date(row.superseded_at as string) : null,
  });
}

export class SupabasePurchasePresentationRepository implements PurchasePresentationRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findActive(organizationId: OrganizationId, supplierId: string, matchKey: string): Promise<PurchasePresentation | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("supplier_purchase_presentations")
      .select("*")
      .eq("supplier_id", supplierId)
      .eq("match_key", matchKey)
      .is("superseded_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toEntity(data as unknown as Record<string, unknown>) : null;
  }

  async listActiveBySupplier(organizationId: OrganizationId, supplierId: string): Promise<PurchasePresentation[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("supplier_purchase_presentations")
      .select("*")
      .eq("supplier_id", supplierId)
      .is("superseded_at", null)
      .order("description", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(toEntity);
  }

  async history(organizationId: OrganizationId, supplierId: string, matchKey: string): Promise<PurchasePresentation[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("supplier_purchase_presentations")
      .select("*")
      .eq("supplier_id", supplierId)
      .eq("match_key", matchKey)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(toEntity);
  }

  async supersede(organizationId: OrganizationId, presentation: PurchasePresentation): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("supplier_purchase_presentations")
      .update({ superseded_at: new Date().toISOString() })
      .eq("id", presentation.id)
      .is("superseded_at", null);
    if (error) throw new Error(error.message);
  }

  async replaceActive(organizationId: OrganizationId, matchKey: string, next: PurchasePresentation, previous: PurchasePresentation | null): Promise<void> {
    if (previous) {
      const { error } = await this.scopedQuery(organizationId)
        .table("supplier_purchase_presentations")
        .update({ superseded_at: new Date().toISOString() })
        .eq("id", previous.id)
        .is("superseded_at", null);
      if (error) throw new Error(error.message);
    }
    const p = next.toProps();
    const { error } = await this.scopedQuery(organizationId).table("supplier_purchase_presentations").insert({
      id: p.id,
      supplier_id: p.supplierId,
      match_key: matchKey,
      supplier_reference: p.supplierReference,
      description: p.description,
      stock_item_id: p.stockItemId,
      package_unit: p.packageUnit,
      content_quantity: p.contentQuantity,
      content_unit: p.contentUnit,
      invoiced_by: p.invoicedBy,
      min_order_packages: p.minOrderPackages,
      order_increment_packages: p.orderIncrementPackages,
      source: p.source,
      confidence: p.confidence,
      created_by: p.createdBy,
    });
    if (error) throw new Error(error.message);
  }
}
