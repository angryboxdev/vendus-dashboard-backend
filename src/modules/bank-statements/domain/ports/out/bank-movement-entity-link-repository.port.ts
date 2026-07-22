export interface BankMovementEntityLink {
  id: string;
  movementId: string;
  entityType: "invoice" | "payable_entry";
  entityId: string;
  amountCents: number;  // amount of this entity at time of reconciliation
  entityLabel: string;  // e.g. "Galp Energia — FT 2026/42"
}

export interface BankMovementEntityLinkRepositoryPort {
  saveAll(links: BankMovementEntityLink[]): Promise<void>;
  /** Bulk load — returns all links for the given movement IDs. */
  findByMovementIds(movementIds: string[]): Promise<BankMovementEntityLink[]>;
  /** Deletes all entity links for a movement (used when re-reconciling). */
  deleteByMovementId(movementId: string): Promise<void>;
}
