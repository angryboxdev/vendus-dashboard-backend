import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Bank } from "../../entities/bank.js";

export interface BankRepositoryPort {
  save(organizationId: OrganizationId, bank: Bank): Promise<void>;
  findById(organizationId: OrganizationId, id: string): Promise<Bank | null>;
  findAll(organizationId: OrganizationId): Promise<Bank[]>;
  update(organizationId: OrganizationId, bank: Bank): Promise<void>;
  delete(organizationId: OrganizationId, id: string): Promise<void>;
}
