import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DreRestaurantSales } from "../../entities/dre.js";

/** Vendas do restaurante do mês para a DRE (Vendus) — pedidas à parte dos custos, que são rápidos. */
export interface GetDreRestaurantSalesPort {
  execute(params: { organizationId: OrganizationId; year: number; month: number }): Promise<DreRestaurantSales>;
}
