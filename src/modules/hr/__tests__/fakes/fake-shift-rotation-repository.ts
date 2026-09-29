import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ShiftRotation } from "../../domain/entities/shift-rotation.js";
import type { ShiftRotationRepositoryPort } from "../../domain/ports/out/shift-rotation-repository.port.js";

export class FakeShiftRotationRepository implements ShiftRotationRepositoryPort {
  private readonly byOrg = new Map<string, Map<string, ShiftRotation>>();

  private store(organizationId: OrganizationId): Map<string, ShiftRotation> {
    const key = String(organizationId);
    if (!this.byOrg.has(key)) this.byOrg.set(key, new Map());
    return this.byOrg.get(key)!;
  }

  seed(organizationId: OrganizationId, rotation: ShiftRotation): void {
    this.store(organizationId).set(rotation.id, rotation);
  }

  async findAll(organizationId: OrganizationId): Promise<ShiftRotation[]> {
    return [...this.store(organizationId).values()];
  }

  async findById(organizationId: OrganizationId, id: string): Promise<ShiftRotation | null> {
    return this.store(organizationId).get(id) ?? null;
  }

  async create(organizationId: OrganizationId, rotation: ShiftRotation): Promise<ShiftRotation> {
    this.store(organizationId).set(rotation.id, rotation);
    return rotation;
  }

  async update(organizationId: OrganizationId, rotation: ShiftRotation): Promise<ShiftRotation> {
    this.store(organizationId).set(rotation.id, rotation);
    return rotation;
  }
}
