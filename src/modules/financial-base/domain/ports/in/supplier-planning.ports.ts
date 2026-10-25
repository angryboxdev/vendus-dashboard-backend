import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** «Resumo no planeamento» do fornecedor (separador Abastecimento). Valores em euros, s/ IVA. */
export interface SupplierPlanningSummaryDTO {
  /** Artigos de stock comprados a este fornecedor nos últimos 12 meses. */
  associatedItems: number;
  /** Compras (líquido s/ IVA) nos últimos 3 meses. */
  purchasesLast3Months: number;
  /** Dias, em média, entre faturas nos últimos 12 meses (`null` com menos de duas datas). */
  purchaseFrequencyDays: number | null;
  invoicesLast12Months: number;
  /** Subcategorias financeiras por valor gasto (12 meses): as 4 maiores + «Outros». */
  categories: { name: string; amount: number; pct: number }[];
  /** Artigos comprados, do mais recente para o mais antigo; preços por unidade de preço (kg, l, un…). */
  items: {
    stockItemId: string;
    name: string;
    priceUnit: string;
    lastPurchaseDate: string;
    lastUnitPrice: number;
    purchaseCount: number;
    /** Preço médio por mês (YYYY-MM), só os meses com compras. */
    monthly: { month: string; avgUnitPrice: number }[];
  }[];
  /** Artigo que o gráfico abre: o mais comprado (nº de compras; empate → o mais recente). */
  defaultItemId: string | null;
}

export interface GetSupplierPlanningSummaryPort {
  execute(command: { organizationId: OrganizationId; supplierId: string }): Promise<SupplierPlanningSummaryDTO>;
}
