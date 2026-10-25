import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PresentationShape } from "../../../../../kernel/units/purchase-presentation.js";

/** Última compra de um artigo de stock a um fornecedor (linhas de faturas confirmadas). */
export interface SupplierItemPurchase {
  stockItemId: string;
  lastPurchaseDate: string;
  /** Preço unitário sem IVA da última compra (euros). */
  lastUnitCostWithoutVat: number;
  /** Código do artigo no fornecedor, lido da fatura. */
  supplierItemCode: string | null;
  /** Unidade da linha da fatura (ex.: «Pack 6»). */
  purchaseUnit: string | null;
}

/**
 * Leituras do separador «Abastecimento» da ficha do fornecedor: o que já se
 * comprou a este fornecedor, consumo recente e nomes de categoria. Lê
 * diretamente as tabelas partilhadas (faturas, movimentos, categorias de
 * stock), como os outros adapters de leitura deste módulo.
 */
export interface SupplierReplenishmentReadPort {
  /** Por artigo de stock, a compra mais recente a este fornecedor. */
  lastPurchasesBySupplier(organizationId: OrganizationId, supplierId: string): Promise<SupplierItemPurchase[]>;
  /** Saídas de stock (consumo, venda, quebra) dos últimos `days` dias, em unidade base, por artigo. */
  consumptionLastDays(organizationId: OrganizationId, stockItemIds: string[], days: number): Promise<Map<string, number>>;
  categoryNames(organizationId: OrganizationId, categoryIds: string[]): Promise<Map<string, string>>;
  /** Apresentação de compra ativa deste fornecedor, por artigo (a mais recente, se houver várias referências). */
  presentationsBySupplier(organizationId: OrganizationId, supplierId: string): Promise<Map<string, PresentationShape>>;
}
