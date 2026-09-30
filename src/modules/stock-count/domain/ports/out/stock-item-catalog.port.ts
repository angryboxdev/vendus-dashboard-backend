import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { TolerancePolicy } from "../../services/tolerance.service.js";

export interface StockItemAlternateUnit {
  unitLabel: string;
  conversionFactorToBase: number;
}

export interface StockItemForCountSnapshot {
  id: string;
  name: string;
  categoryId: string;
  baseUnit: string;
  isActive: boolean;
  stockTrackingEnabled: boolean;
  tolerance: TolerancePolicy | null;
  purchaseReferenceUnitCostWithoutVat: number | null;
  alternateUnits: StockItemAlternateUnit[];
}

export interface CreateStockItemForCountData {
  name: string;
  categoryId: string;
  type: string;
  baseUnit: string;
}

export interface StockItemScopeFilter {
  categoryIds?: string[];
  itemIds?: string[];
}

/**
 * Lê/cria diretamente a tabela legacy `stock_items` (nunca via
 * `src/services/stockItemService.ts` — CLAUDE.md). Um item criado aqui
 * começa sempre com quantidade 0 implícita — nunca com um movimento
 * inicial (secção 57).
 */
export interface StockItemCatalogPort {
  /** Elegíveis para escopo: `is_active=true` e `stock_tracking_enabled=true` (secção 7/19). */
  listEligibleForScope(organizationId: OrganizationId, filter: StockItemScopeFilter): Promise<StockItemForCountSnapshot[]>;
  findById(organizationId: OrganizationId, id: string): Promise<StockItemForCountSnapshot | null>;
  create(organizationId: OrganizationId, data: CreateStockItemForCountData): Promise<StockItemForCountSnapshot>;
}
