import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type {
  BankMovementEntityLink,
  BankMovementEntityLinkRepositoryPort,
} from "../../domain/ports/out/bank-movement-entity-link-repository.port.js";

export class FakeBankMovementEntityLinkRepository implements BankMovementEntityLinkRepositoryPort {
  private links = new Map<OrganizationId, BankMovementEntityLink[]>();

  private linksFor(organizationId: OrganizationId): BankMovementEntityLink[] {
    let list = this.links.get(organizationId);
    if (!list) {
      list = [];
      this.links.set(organizationId, list);
    }
    return list;
  }

  async saveAll(organizationId: OrganizationId, links: BankMovementEntityLink[]): Promise<void> {
    this.linksFor(organizationId).push(...links);
  }

  async findByMovementIds(
    organizationId: OrganizationId,
    movementIds: string[]
  ): Promise<BankMovementEntityLink[]> {
    return this.linksFor(organizationId).filter((l) => movementIds.includes(l.movementId));
  }

  async findByEntityIds(
    organizationId: OrganizationId,
    entityType: "invoice" | "payable_entry",
    entityIds: string[]
  ): Promise<BankMovementEntityLink[]> {
    return this.linksFor(organizationId).filter(
      (l) => l.entityType === entityType && entityIds.includes(l.entityId)
    );
  }

  async deleteByMovementId(organizationId: OrganizationId, movementId: string): Promise<void> {
    const list = this.linksFor(organizationId);
    this.links.set(
      organizationId,
      list.filter((l) => l.movementId !== movementId)
    );
  }

  async findAllByEntityType(
    organizationId: OrganizationId,
    entityType: "invoice" | "payable_entry"
  ): Promise<BankMovementEntityLink[]> {
    return this.linksFor(organizationId).filter((l) => l.entityType === entityType);
  }

  /** Test helper — returns all stored links for an organization. */
  all(organizationId: OrganizationId): BankMovementEntityLink[] {
    return [...this.linksFor(organizationId)];
  }
}
