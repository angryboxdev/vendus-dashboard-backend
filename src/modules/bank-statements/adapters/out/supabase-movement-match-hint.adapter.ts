import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { MovementMatchHintPort } from "../../domain/ports/out/movement-match-hint.port.js";

export class SupabaseMovementMatchHintAdapter implements MovementMatchHintPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findSupplierByDescription(
    organizationId: OrganizationId,
    normalizedDesc: string
  ): Promise<string | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("bank_movement_match_hints")
      .select("supplier_id")
      .eq("normalized_description", normalizedDesc)
      .order("use_count", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return (data as unknown as Record<string, unknown>).supplier_id as string;
  }

  async save(organizationId: OrganizationId, normalizedDesc: string, supplierId: string): Promise<void> {
    const { data: existing, error: selectError } = await this.scopedQuery(organizationId)
      .table("bank_movement_match_hints")
      .select("id, use_count")
      .match({ normalized_description: normalizedDesc, supplier_id: supplierId })
      .maybeSingle();

    if (selectError) throw new Error(selectError.message);

    if (existing) {
      const row = existing as unknown as Record<string, unknown>;
      const { error } = await this.scopedQuery(organizationId)
        .table("bank_movement_match_hints")
        .update({
          use_count: (row.use_count as number) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id as string);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await this.scopedQuery(organizationId)
        .table("bank_movement_match_hints")
        .insert({ normalized_description: normalizedDesc, supplier_id: supplierId });
      if (error) throw new Error(error.message);
    }
  }
}
