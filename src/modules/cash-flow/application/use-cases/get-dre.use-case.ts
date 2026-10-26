import type { DreReport } from "../../domain/entities/dre.js";
import type { GetDrePort } from "../../domain/ports/in/get-dre.port.js";
import type { BankMovementReadPort } from "../../domain/ports/out/bank-movement-read.port.js";
import type { CostCenterCatalogReadPort } from "../../domain/ports/out/cost-center-catalog-read.port.js";
import type { ExpenseSourceReadPort } from "../../domain/ports/out/expense-source-read.port.js";
import type { ManualAdjustmentsReadPort } from "../../domain/ports/out/manual-adjustments-read.port.js";
import type { MovementKindPort } from "../../domain/ports/out/movement-kind.port.js";
import type { PlatformSalesReadPort } from "../../domain/ports/out/platform-sales-read.port.js";
import type { RestaurantSalesReadPort } from "../../domain/ports/out/restaurant-sales-read.port.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { cashFlowPeriod } from "../../domain/services/cash-flow-period.js";
import { buildDreReport } from "../../domain/services/dre-report.service.js";
import { collectExpenseReferences } from "../../domain/services/expense-categorizer.service.js";

export class GetDreUseCase implements GetDrePort {
  constructor(
    private readonly bankMovements: BankMovementReadPort,
    private readonly expenseSources: ExpenseSourceReadPort,
    private readonly catalog: CostCenterCatalogReadPort,
    private readonly movementKind: MovementKindPort,
    private readonly restaurantSales: RestaurantSalesReadPort,
    private readonly platformSales: PlatformSalesReadPort,
    private readonly manualAdjustments: ManualAdjustmentsReadPort,
    /** Hoje, YYYY-MM-DD (injetado para os testes). */
    private readonly today: () => string = () => new Date().toISOString().slice(0, 10),
  ) {}

  async execute({ organizationId, year, month }: { organizationId: OrganizationId; year: number; month: number }): Promise<DreReport> {
    const { from, to, isCurrentMonth } = cashFlowPeriod(year, month, this.today());

    const [catalog, storedDebits, storedCredits, restaurant, platformsSold, manual] = await Promise.all([
      this.catalog.load(organizationId),
      this.bankMovements.listDebits(organizationId, from, to),
      this.bankMovements.listCredits(organizationId, from, to),
      this.restaurantSales.sales(organizationId, from, to),
      this.platformSales.sales(organizationId, from, to),
      this.manualAdjustments.forMonth(organizationId, year, month),
    ]);
    const debits = storedDebits.map(({ description, ...d }) => ({ ...d, kind: this.movementKind.describe(description, "debit").kind }));
    const credits = storedCredits.map(({ description, ...c }) => ({ ...c, ...this.movementKind.describe(description, "credit") }));
    const sources = await this.expenseSources.load(organizationId, collectExpenseReferences(debits));

    return buildDreReport({
      period: { year, month, from, to, isCurrentMonth },
      debits,
      credits,
      sources,
      catalog,
      restaurant,
      platformsSold,
      manual,
    });
  }
}
