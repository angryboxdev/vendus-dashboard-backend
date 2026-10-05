import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ShiftTemplate } from "../../domain/entities/shift-template.js";
import { DuplicateShiftTemplateNameError } from "../../domain/errors.js";
import type { ShiftTemplateRepositoryPort } from "../../domain/ports/out/shift-template-repository.port.js";

/** Reproduz a restrição `unique (org_id, normalized_name)` da BD. */
export class FakeShiftTemplateRepository implements ShiftTemplateRepositoryPort {
  private readonly byOrg = new Map<string, Map<string, ShiftTemplate>>();

  private store(organizationId: OrganizationId): Map<string, ShiftTemplate> {
    const key = String(organizationId);
    if (!this.byOrg.has(key)) this.byOrg.set(key, new Map());
    return this.byOrg.get(key)!;
  }

  seed(organizationId: OrganizationId, template: ShiftTemplate): void {
    this.store(organizationId).set(template.id, template);
  }

  private assertUnique(organizationId: OrganizationId, template: ShiftTemplate): void {
    for (const t of this.store(organizationId).values()) {
      if (t.id !== template.id && t.normalizedName === template.normalizedName) throw new DuplicateShiftTemplateNameError(template.name);
    }
  }

  async findAll(organizationId: OrganizationId): Promise<ShiftTemplate[]> {
    return [...this.store(organizationId).values()];
  }

  async findById(organizationId: OrganizationId, id: string): Promise<ShiftTemplate | null> {
    return this.store(organizationId).get(id) ?? null;
  }

  async insert(organizationId: OrganizationId, template: ShiftTemplate): Promise<void> {
    this.assertUnique(organizationId, template);
    this.store(organizationId).set(template.id, template);
  }

  async update(organizationId: OrganizationId, template: ShiftTemplate): Promise<void> {
    this.assertUnique(organizationId, template);
    this.store(organizationId).set(template.id, template);
  }
}
