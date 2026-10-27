import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DailyRestaurantPayments } from "../../entities/sales-reconciliation.js";

export interface RestaurantDailyPaymentsReadPort {
  /** Vendas do restaurante (Vendus) por dia, em cartão e numerário, entre `from` e `to`. */
  dailyPayments(organizationId: OrganizationId, from: string, to: string): Promise<DailyRestaurantPayments[]>;
}
