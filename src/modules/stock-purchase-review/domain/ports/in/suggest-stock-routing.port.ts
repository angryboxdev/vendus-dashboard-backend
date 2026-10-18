import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { StockRoutingSuggestion } from "../../services/stock-routing-suggestion.service.js";

export interface SuggestStockRoutingCommand {
  organizationId: OrganizationId;
  supplierId: string | null;
  /** Loja do documento, quando inequívoca (null = desconhecida/várias). */
  locationId: string | null;
  categoryIds: string[];
}

export interface SuggestStockRoutingPort {
  execute(command: SuggestStockRoutingCommand): Promise<StockRoutingSuggestion>;
}
