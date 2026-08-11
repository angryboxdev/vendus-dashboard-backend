import type {
  BankMovementEntityLink,
  BankMovementEntityLinkRepositoryPort,
} from "../../domain/ports/out/bank-movement-entity-link-repository.port.js";

export class FakeBankMovementEntityLinkRepository implements BankMovementEntityLinkRepositoryPort {
  private links: BankMovementEntityLink[] = [];

  async saveAll(links: BankMovementEntityLink[]): Promise<void> {
    this.links.push(...links);
  }

  async findByMovementIds(movementIds: string[]): Promise<BankMovementEntityLink[]> {
    return this.links.filter((l) => movementIds.includes(l.movementId));
  }

  async findByEntityIds(
    entityType: "invoice" | "payable_entry",
    entityIds: string[]
  ): Promise<BankMovementEntityLink[]> {
    return this.links.filter((l) => l.entityType === entityType && entityIds.includes(l.entityId));
  }

  async deleteByMovementId(movementId: string): Promise<void> {
    this.links = this.links.filter((l) => l.movementId !== movementId);
  }

  async findAllByEntityType(entityType: "invoice" | "payable_entry"): Promise<BankMovementEntityLink[]> {
    return this.links.filter((l) => l.entityType === entityType);
  }

  /** Test helper — returns all stored links. */
  all(): BankMovementEntityLink[] {
    return [...this.links];
  }
}
