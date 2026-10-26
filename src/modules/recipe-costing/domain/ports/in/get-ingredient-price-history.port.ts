import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { IngredientPriceHistory } from "../../entities/price-history.js";

export interface GetIngredientPriceHistoryCommand {
  organizationId: OrganizationId;
  stockItemId: string;
  /** Semanas até à semana atual (1–104). */
  weeks?: number;
}

/** Histórico semanal do preço de compra de um ingrediente; `null` = artigo inexistente nesta empresa. */
export interface GetIngredientPriceHistoryPort {
  execute(command: GetIngredientPriceHistoryCommand): Promise<IngredientPriceHistory | null>;
}
