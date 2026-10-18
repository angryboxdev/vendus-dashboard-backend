import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { SuggestStockRoutingPort } from "../../../stock-purchase-review/domain/ports/in/suggest-stock-routing.port.js";
import type { StockRoutingPort, StockRoutingView } from "../../domain/ports/out/stock-routing.port.js";

/** D10 — delega no input port do módulo stock-purchase-review. */
export class StockPurchaseReviewRoutingAdapter implements StockRoutingPort {
  constructor(private readonly suggestStockRouting: SuggestStockRoutingPort) {}

  suggest(organizationId: OrganizationId, input: { supplierId: string | null; locationId: string | null; categoryIds: string[] }): Promise<StockRoutingView> {
    return this.suggestStockRouting.execute({ organizationId, ...input });
  }
}
