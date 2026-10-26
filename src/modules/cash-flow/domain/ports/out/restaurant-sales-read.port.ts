import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { SalesFigures } from "../../entities/dre.js";

export interface RestaurantSalesReadPort {
  /** Vendas do restaurante (Vendus, sem o canal antigo «apps») entre `from` e `to`. */
  sales(organizationId: OrganizationId, from: string, to: string): Promise<SalesFigures>;
}
