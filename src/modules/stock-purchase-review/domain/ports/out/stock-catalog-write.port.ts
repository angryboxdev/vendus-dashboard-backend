import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface StockItemSnapshot {
  id: string;
  name: string;
  baseUnit: string;
  isActive: boolean;
}

export interface CreateStockItemData {
  name: string;
  categoryId: string;
  type: string;
  baseUnit: string;
}

/**
 * Escreve diretamente na tabela legacy `stock_items` (nunca através dos
 * serviços legacy `src/services/stockItemService.ts` — CLAUDE.md: nunca
 * imitar/estender um módulo legacy). Criar o item NÃO é entrada de
 * mercadoria — começa sempre sem nenhum movimento (quantidade 0 implícita).
 */
export interface StockCatalogWritePort {
  create(organizationId: OrganizationId, data: CreateStockItemData): Promise<StockItemSnapshot>;
  findById(organizationId: OrganizationId, id: string): Promise<StockItemSnapshot | null>;
}
