import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Recurrence, RecurrenceStatus, RecurrenceType } from "../../entities/recurrence.js";

export interface RecurrenceFilter {
  status?: RecurrenceStatus;
  type?: RecurrenceType;
  supplierId?: string;
}

export interface RecurrenceRepositoryPort {
  save(organizationId: OrganizationId, recurrence: Recurrence): Promise<void>;
  update(organizationId: OrganizationId, recurrence: Recurrence): Promise<void>;
  findById(organizationId: OrganizationId, id: string): Promise<Recurrence | null>;
  findAll(organizationId: OrganizationId, filter?: RecurrenceFilter): Promise<Recurrence[]>;
}
