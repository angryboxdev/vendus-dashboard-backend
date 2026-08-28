import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PayableEntry, PayableStatus } from "../../entities/payable-entry.js";

export interface PayableEntryFilter {
  supplierId?: string;
  costCenterId?: string;
  status?: PayableStatus;
  from?: Date;
  to?: Date;
}

export interface PayableEntryRepositoryPort {
  save(organizationId: OrganizationId, entry: PayableEntry): Promise<void>;
  findById(organizationId: OrganizationId, id: string): Promise<PayableEntry | null>;
  findAll(organizationId: OrganizationId, filter?: PayableEntryFilter): Promise<PayableEntry[]>;
  update(organizationId: OrganizationId, entry: PayableEntry): Promise<void>;
  delete(organizationId: OrganizationId, id: string): Promise<void>;
}
