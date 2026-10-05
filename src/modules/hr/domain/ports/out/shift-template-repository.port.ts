import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { ShiftTemplate } from "../../entities/shift-template.js";

export interface ShiftTemplateRepositoryPort {
  findAll(organizationId: OrganizationId): Promise<ShiftTemplate[]>;
  findById(organizationId: OrganizationId, id: string): Promise<ShiftTemplate | null>;
  /** Lança `DuplicateShiftTemplateNameError` se o nome normalizado já existir na organização. */
  insert(organizationId: OrganizationId, template: ShiftTemplate): Promise<void>;
  /** Lança `DuplicateShiftTemplateNameError` se o nome normalizado já existir na organização. */
  update(organizationId: OrganizationId, template: ShiftTemplate): Promise<void>;
}
