import type { AirMenuOrder } from "../../entities/air-menu-order.js";
import type { AirMenuAnalytics } from "../../entities/air-menu-analytics.js";

export interface AirMenuSummary {
  orders: AirMenuOrder[];
  analytics: AirMenuAnalytics;
}

export interface GetSummaryPort {
  execute(enterpriseId: string, startDate: Date, endDate: Date): Promise<AirMenuSummary>;
}
