import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { RestaurantSales } from "../../entities/dre.js";

export interface RestaurantSalesReadPort {
  /** Vendas do restaurante (Vendus, sem o canal antigo «apps») entre `from` e `to`, com o bruto por classe de pagamento. */
  sales(organizationId: OrganizationId, from: string, to: string): Promise<RestaurantSales>;
}
