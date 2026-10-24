import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CatalogEntry, ConfirmedLine } from "../../services/classification/line-classifier.js";

/** Catálogo de Categorias/Subcategorias da organização (ativas e inativas). */
export interface CategoryCatalogReadPort {
  list(organizationId: OrganizationId): Promise<CatalogEntry[]>;
}

/** Linhas de faturas confirmadas (nunca rascunhos) do fornecedor, mais recentes primeiro. */
export interface ConfirmedLineHistoryPort {
  forSupplier(organizationId: OrganizationId, supplierId: string, limit: number): Promise<ConfirmedLine[]>;
}

/**
 * IA só para as linhas que as regras não resolveram: recebe descrições e o
 * catálogo (id, código, nome) e devolve um id do catálogo por linha, ou null.
 * O texto das linhas é dado, nunca instrução. Sem dados fiscais nem NIF.
 */
export interface LineCategoryAiPort {
  suggest(
    lines: { index: number; description: string }[],
    catalog: { id: string; code: string; label: string }[],
  ): Promise<{ index: number; categoryId: string | null }[]>;
}
