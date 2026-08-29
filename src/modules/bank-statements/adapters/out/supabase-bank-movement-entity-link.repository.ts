import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type {
  BankMovementEntityLink,
  BankMovementEntityLinkRepositoryPort,
} from "../../domain/ports/out/bank-movement-entity-link-repository.port.js";

const SELECT_COLS =
  "id, movement_id, entity_type, entity_id, amount_cents, allocated_amount_cents, entity_label";

function mapRow(row: Record<string, unknown>): BankMovementEntityLink {
  return {
    id: row.id as string,
    movementId: row.movement_id as string,
    entityType: row.entity_type as "invoice" | "payable_entry",
    entityId: row.entity_id as string,
    amountCents: row.amount_cents as number,
    allocatedAmountCents: row.allocated_amount_cents as number,
    entityLabel: row.entity_label as string,
  };
}

export class SupabaseBankMovementEntityLinkRepository
  implements BankMovementEntityLinkRepositoryPort
{
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async saveAll(organizationId: OrganizationId, links: BankMovementEntityLink[]): Promise<void> {
    if (links.length === 0) return;
    const rows = links.map((l) => ({
      id: l.id,
      movement_id: l.movementId,
      entity_type: l.entityType,
      entity_id: l.entityId,
      amount_cents: l.amountCents,
      allocated_amount_cents: l.allocatedAmountCents,
      entity_label: l.entityLabel,
    }));
    const { error } = await this.scopedQuery(organizationId)
      .table("bank_movement_entity_links")
      .insert(rows);
    if (error) throw new Error(error.message);
  }

  async findByMovementIds(
    organizationId: OrganizationId,
    movementIds: string[]
  ): Promise<BankMovementEntityLink[]> {
    if (movementIds.length === 0) return [];
    const { data, error } = await this.scopedQuery(organizationId)
      .table("bank_movement_entity_links")
      .select(SELECT_COLS)
      .in("movement_id", movementIds);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapRow(row as unknown as Record<string, unknown>));
  }

  async findByEntityIds(
    organizationId: OrganizationId,
    entityType: "invoice" | "payable_entry",
    entityIds: string[]
  ): Promise<BankMovementEntityLink[]> {
    if (entityIds.length === 0) return [];
    const { data, error } = await this.scopedQuery(organizationId)
      .table("bank_movement_entity_links")
      .select(SELECT_COLS)
      .eq("entity_type", entityType)
      .in("entity_id", entityIds);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapRow(row as unknown as Record<string, unknown>));
  }

  async deleteByMovementId(organizationId: OrganizationId, movementId: string): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("bank_movement_entity_links")
      .delete()
      .eq("movement_id", movementId);
    if (error) throw new Error(error.message);
  }

  async findAllByEntityType(
    organizationId: OrganizationId,
    entityType: "invoice" | "payable_entry"
  ): Promise<BankMovementEntityLink[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("bank_movement_entity_links")
      .select(SELECT_COLS)
      .eq("entity_type", entityType);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapRow(row as unknown as Record<string, unknown>));
  }
}
