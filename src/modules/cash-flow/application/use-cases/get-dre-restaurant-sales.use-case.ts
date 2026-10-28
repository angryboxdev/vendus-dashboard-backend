import type { DreRestaurantSales } from "../../domain/entities/dre.js";
import type { GetDreRestaurantSalesPort } from "../../domain/ports/in/get-dre-restaurant-sales.port.js";
import type { DreParametersRepositoryPort } from "../../domain/ports/out/dre-parameters-repository.port.js";
import type { RestaurantSalesReadPort } from "../../domain/ports/out/restaurant-sales-read.port.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { cashFlowPeriod } from "../../domain/services/cash-flow-period.js";
import { resolveDreParameters } from "../../domain/services/dre-parameters.service.js";
import { cardFees, restaurantByPayment } from "../../domain/services/dre-report.service.js";

export class GetDreRestaurantSalesUseCase implements GetDreRestaurantSalesPort {
  constructor(
    private readonly restaurantSales: RestaurantSalesReadPort,
    private readonly parameters: DreParametersRepositoryPort,
    /** Hoje, YYYY-MM-DD (injetado para os testes). */
    private readonly today: () => string = () => new Date().toISOString().slice(0, 10),
  ) {}

  async execute({ organizationId, year, month }: { organizationId: OrganizationId; year: number; month: number }): Promise<DreRestaurantSales> {
    const { from, to, isCurrentMonth } = cashFlowPeriod(year, month, this.today());
    const [sales, stored] = await Promise.all([this.restaurantSales.sales(organizationId, from, to), this.parameters.forMonth(organizationId, year, month)]);
    return {
      period: { year, month, from, to, isCurrentMonth },
      netCents: sales.netCents,
      vatCents: sales.vatCents,
      byPayment: restaurantByPayment(sales),
      cardFees: cardFees(sales, resolveDreParameters(stored.own, stored.previous)),
    };
  }
}
