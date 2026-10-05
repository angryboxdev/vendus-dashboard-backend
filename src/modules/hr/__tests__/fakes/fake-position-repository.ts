import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Position } from "../../domain/entities/position.js";
import { DuplicatePositionNameError } from "../../domain/errors.js";
import type { PositionRepositoryPort } from "../../domain/ports/out/position-repository.port.js";

/** Reproduz a restrição `unique (org_id, normalized_name)` da BD. */
export class FakePositionRepository implements PositionRepositoryPort {
  private readonly byOrg = new Map<string, Map<string, Position>>();

  private store(organizationId: OrganizationId): Map<string, Position> {
    const key = String(organizationId);
    if (!this.byOrg.has(key)) this.byOrg.set(key, new Map());
    return this.byOrg.get(key)!;
  }

  seed(organizationId: OrganizationId, position: Position): void {
    this.store(organizationId).set(position.id, position);
  }

  private assertUnique(organizationId: OrganizationId, position: Position): void {
    for (const p of this.store(organizationId).values()) {
      if (p.id !== position.id && p.normalizedName === position.normalizedName) throw new DuplicatePositionNameError(position.name);
    }
  }

  async findAll(organizationId: OrganizationId): Promise<Position[]> {
    return [...this.store(organizationId).values()];
  }

  async findById(organizationId: OrganizationId, id: string): Promise<Position | null> {
    return this.store(organizationId).get(id) ?? null;
  }

  async insert(organizationId: OrganizationId, position: Position): Promise<void> {
    this.assertUnique(organizationId, position);
    this.store(organizationId).set(position.id, position);
  }

  async update(organizationId: OrganizationId, position: Position): Promise<void> {
    this.assertUnique(organizationId, position);
    this.store(organizationId).set(position.id, position);
  }
}
