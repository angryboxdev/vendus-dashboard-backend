import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface SupplierSummary {
  id: string;
  name: string;
  nif: string | null;
  defaultCostCenterGroupId: string | null;
  defaultCostCenterCategoryId: string | null;
  defaultFinancialType: string | null;
}

export interface SupplierLookupPort {
  findByNif(organizationId: OrganizationId, nif: string): Promise<SupplierSummary | null>;
  findByName(organizationId: OrganizationId, query: string): Promise<SupplierSummary[]>;
  /** Devolve todos os fornecedores — usado para fuzzy matching em memória. */
  findAll(organizationId: OrganizationId): Promise<SupplierSummary[]>;
}
