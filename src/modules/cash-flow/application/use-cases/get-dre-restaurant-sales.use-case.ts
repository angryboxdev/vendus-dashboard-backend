import type { DreRestaurantSales } from "../../domain/entities/dre.js";
import type { GetDreRestaurantSalesPort } from "../../domain/ports/in/get-dre-restaurant-sales.port.js";
import type { RestaurantSalesReadPort } from "../../domain/ports/out/restaurant-sales-read.port.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { cashFlowPeriod } from "../../domain/services/cash-flow-period.js";
import { restaurantByPayment } from "../../domain/services/dre-report.service.js";

export class GetDreRestaurantSalesUseCase implements GetDreRestaurantSalesPort {
  constructor(
    private readonly restaurantSales: RestaurantSalesReadPort,
    /** Hoje, YYYY-MM-DD (injetado para os testes). */
    private readonly today: () => string = () => new Date().toISOString().slice(0, 10),
  ) {}

  async execute({ organizationId, year, month }: { organizationId: OrganizationId; year: number; month: number }): Promise<DreRestaurantSales> {
    const { from, to, isCurrentMonth } = cashFlowPeriod(year, month, this.today());
    const sales = await this.restaurantSales.sales(organizationId, from, to);
    return {
      period: { year, month, from, to, isCurrentMonth },
      netCents: sales.netCents,
      vatCents: sales.vatCents,
      byPayment: restaurantByPayment(sales),
    };
  }
}
