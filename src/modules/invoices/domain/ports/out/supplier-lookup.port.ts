export interface SupplierSummary {
  id: string;
  name: string;
  nif: string | null;
  defaultCostCenterGroupId: string | null;
  defaultCostCenterCategoryId: string | null;
  defaultFinancialType: string | null;
}

export interface SupplierLookupPort {
  findByNif(nif: string): Promise<SupplierSummary | null>;
  findByName(query: string): Promise<SupplierSummary[]>;
}
