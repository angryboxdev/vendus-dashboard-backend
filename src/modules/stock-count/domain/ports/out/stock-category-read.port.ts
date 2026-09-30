import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { TolerancePolicy } from "../../services/tolerance.service.js";

export interface StockCategorySnapshot {
  id: string;
  name: string;
  tolerance: TolerancePolicy | null;
}

/**
 * Adapter direto à tabela LEGACY `stock_categories` — nunca um D10 sobre
 * `financial-base` (Centro de Custo é um conceito diferente, não
 * relacionado com stock físico; ver README/plano). Nunca importa
 * `stockCategoryService.ts` (CLAUDE.md: nunca imitar/estender legacy).
 */
export interface StockCategoryReadPort {
  findById(organizationId: OrganizationId, categoryId: string): Promise<StockCategorySnapshot | null>;
  listAll(organizationId: OrganizationId): Promise<StockCategorySnapshot[]>;
}
