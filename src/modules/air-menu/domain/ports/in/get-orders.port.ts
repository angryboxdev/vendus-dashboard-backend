import type { AirMenuOrder } from "../../entities/air-menu-order.js";

export interface GetOrdersPort {
  execute(enterpriseId: string, startDate: Date, endDate: Date): Promise<AirMenuOrder[]>;
}
