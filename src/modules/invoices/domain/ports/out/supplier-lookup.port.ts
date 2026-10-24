import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface SupplierSummary {
  id: string;
  name: string;
  nif: string | null;
  defaultCostCenterGroupId: string | null;
  defaultCostCenterCategoryId: string | null;
  defaultFinancialType: string | null;
  /** F2 v1.2: destino habitual (loja concreta) e modo financeiro preferido. */
  defaultLocationId?: string | null;
  defaultFinancialMode?: "single" | "by_item" | "by_values" | null;
  /** E3b: logótipo já definido (sem logótipo → propor o da fatura). */
  logoUrl?: string | null;
}

export interface SupplierLookupPort {
  findByNif(organizationId: OrganizationId, nif: string): Promise<SupplierSummary | null>;
  findById(organizationId: OrganizationId, id: string): Promise<SupplierSummary | null>;
  findByName(organizationId: OrganizationId, query: string): Promise<SupplierSummary[]>;
  /** Devolve todos os fornecedores — usado para fuzzy matching em memória. */
  findAll(organizationId: OrganizationId): Promise<SupplierSummary[]>;
}
