import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BankMovementEntityLink,
  BankMovementEntityLinkRepositoryPort,
} from "../../domain/ports/out/bank-movement-entity-link-repository.port.js";

export class SupabaseBankMovementEntityLinkRepository
  implements BankMovementEntityLinkRepositoryPort
{
  constructor(private readonly supabase: SupabaseClient) {}

  async saveAll(links: BankMovementEntityLink[]): Promise<void> {
    if (links.length === 0) return;
    const rows = links.map((l) => ({
      id: l.id,
      movement_id: l.movementId,
      entity_type: l.entityType,
      entity_id: l.entityId,
      amount_cents: l.amountCents,
      entity_label: l.entityLabel,
    }));
    const { error } = await this.supabase
      .from("bank_movement_entity_links")
      .insert(rows);
    if (error) throw new Error(error.message);
  }

  async findByMovementIds(movementIds: string[]): Promise<BankMovementEntityLink[]> {
    if (movementIds.length === 0) return [];
    const { data, error } = await this.supabase
      .from("bank_movement_entity_links")
      .select("id, movement_id, entity_type, entity_id, amount_cents, entity_label")
      .in("movement_id", movementIds);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string,
        movementId: r.movement_id as string,
        entityType: r.entity_type as "invoice" | "payable_entry",
        entityId: r.entity_id as string,
        amountCents: r.amount_cents as number,
        entityLabel: r.entity_label as string,
      };
    });
  }

  async findByEntityIds(
    entityType: "invoice" | "payable_entry",
    entityIds: string[]
  ): Promise<BankMovementEntityLink[]> {
    if (entityIds.length === 0) return [];
    const { data, error } = await this.supabase
      .from("bank_movement_entity_links")
      .select("id, movement_id, entity_type, entity_id, amount_cents, entity_label")
      .eq("entity_type", entityType)
      .in("entity_id", entityIds);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string,
        movementId: r.movement_id as string,
        entityType: r.entity_type as "invoice" | "payable_entry",
        entityId: r.entity_id as string,
        amountCents: r.amount_cents as number,
        entityLabel: r.entity_label as string,
      };
    });
  }

  async deleteByMovementId(movementId: string): Promise<void> {
    const { error } = await this.supabase
      .from("bank_movement_entity_links")
      .delete()
      .eq("movement_id", movementId);
    if (error) throw new Error(error.message);
  }
}
