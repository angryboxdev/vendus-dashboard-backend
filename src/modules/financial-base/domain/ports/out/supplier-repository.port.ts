import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Supplier } from "../../entities/supplier.js";

export interface SupplierFilter {
  status?: "active" | "inactive";
  search?: string;
}

export interface SupplierRepositoryPort {
  save(organizationId: OrganizationId, supplier: Supplier): Promise<void>;
  findById(organizationId: OrganizationId, id: string): Promise<Supplier | null>;
  findAll(organizationId: OrganizationId, filter?: SupplierFilter): Promise<Supplier[]>;
  update(organizationId: OrganizationId, supplier: Supplier): Promise<void>;
}
