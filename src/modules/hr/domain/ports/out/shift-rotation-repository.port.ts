import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { ShiftRotation } from "../../entities/shift-rotation.js";

export interface ShiftRotationRepositoryPort {
  findAll(organizationId: OrganizationId): Promise<ShiftRotation[]>;
  findById(organizationId: OrganizationId, id: string): Promise<ShiftRotation | null>;
  create(organizationId: OrganizationId, rotation: ShiftRotation): Promise<ShiftRotation>;
  update(organizationId: OrganizationId, rotation: ShiftRotation): Promise<ShiftRotation>;
  /** Hard delete da regra — `hr_work_shifts.rotation_id` passa a NULL (FK `on delete set null`); os turnos ficam. */
  delete(organizationId: OrganizationId, id: string): Promise<void>;
}
