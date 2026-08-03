import type { GetSummaryPort, AirMenuSummary } from "../../domain/ports/in/get-summary.port.js";
import type { GetOrdersPort } from "../../domain/ports/in/get-orders.port.js";
import type { MenuCatalogPort } from "../../domain/ports/out/menu-catalog.port.js";
import { computeAnalytics } from "./get-analytics.use-case.js";

export class GetSummaryUseCase implements GetSummaryPort {
  constructor(
    private readonly getOrders: GetOrdersPort,
    private readonly menuCatalog: MenuCatalogPort,
  ) {}

  async execute(enterpriseId: string, startDate: Date, endDate: Date): Promise<AirMenuSummary> {
    const [orders, catalog] = await Promise.all([
      this.getOrders.execute(enterpriseId, startDate, endDate),
      this.menuCatalog.getMenuItems(enterpriseId),
    ]);
    const analytics = computeAnalytics(orders, catalog, startDate, endDate);
    return { orders, analytics };
  }
}
