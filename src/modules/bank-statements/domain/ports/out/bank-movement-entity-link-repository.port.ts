import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface BankMovementEntityLink {
  id: string;
  movementId: string;
  entityType: "invoice" | "payable_entry";
  entityId: string;
  amountCents: number;           // entity's total at time of reconciliation (historical reference)
  allocatedAmountCents: number;  // portion of the movement's amount allocated to this entity
  entityLabel: string;           // e.g. "Galp Energia — FT 2026/42"
}

export interface BankMovementEntityLinkRepositoryPort {
  saveAll(organizationId: OrganizationId, links: BankMovementEntityLink[]): Promise<void>;
  /** Bulk load — returns all links for the given movement IDs. */
  findByMovementIds(organizationId: OrganizationId, movementIds: string[]): Promise<BankMovementEntityLink[]>;
  /** Returns all links where entity_type matches and entity_id is in the given list. */
  findByEntityIds(
    organizationId: OrganizationId,
    entityType: "invoice" | "payable_entry",
    entityIds: string[]
  ): Promise<BankMovementEntityLink[]>;
  /** Deletes all entity links for a movement (used when re-reconciling). */
  deleteByMovementId(organizationId: OrganizationId, movementId: string): Promise<void>;
  /**
   * Returns ALL links for the given entity type (no ID filter).
   * Used to find partially-reconciled entities by open balance.
   */
  findAllByEntityType(
    organizationId: OrganizationId,
    entityType: "invoice" | "payable_entry"
  ): Promise<BankMovementEntityLink[]>;
}
