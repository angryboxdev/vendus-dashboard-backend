import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** Dados em bruto do fornecedor desde uma data (faturas lançadas; valores em cêntimos, datas YYYY-MM-DD). */
export interface SupplierPlanningReadModel {
  /** Faturas lançadas (sem rascunhos nem anuladas), com o líquido s/ IVA. */
  invoices: { id: string; date: string; netCents: number }[];
  /** Linhas dessas faturas com a subcategoria financeira e o líquido s/ IVA. */
  lines: { categoryId: string | null; categoryName: string | null; netCents: number }[];
  /** Linhas conciliadas com um artigo de stock nas Compras por rever dessas faturas (custo por unidade base). */
  stockPurchases: { stockItemId: string; itemName: string; baseUnit: string; date: string; unitCostPerBaseUnitCents: number }[];
}

export interface SupplierPlanningReadPort {
  read(organizationId: OrganizationId, supplierId: string, since: string): Promise<SupplierPlanningReadModel>;
}
