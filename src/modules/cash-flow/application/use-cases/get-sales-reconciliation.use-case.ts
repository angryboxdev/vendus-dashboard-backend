import type { SalesReconciliation } from "../../domain/entities/sales-reconciliation.js";
import type { GetSalesReconciliationPort } from "../../domain/ports/in/get-sales-reconciliation.port.js";
import type { BankMovementReadPort } from "../../domain/ports/out/bank-movement-read.port.js";
import type { DreParametersRepositoryPort } from "../../domain/ports/out/dre-parameters-repository.port.js";
import type { MovementKindPort } from "../../domain/ports/out/movement-kind.port.js";
import type { RestaurantDailyPaymentsReadPort } from "../../domain/ports/out/restaurant-daily-payments-read.port.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { cashFlowPeriod } from "../../domain/services/cash-flow-period.js";
import { resolveDreParameters } from "../../domain/services/dre-parameters.service.js";
import { addDays, buildSalesReconciliation, SETTLEMENT_MARGIN_DAYS } from "../../domain/services/sales-reconciliation.service.js";

export class GetSalesReconciliationUseCase implements GetSalesReconciliationPort {
  constructor(
    private readonly bankMovements: BankMovementReadPort,
    private readonly movementKind: MovementKindPort,
    private readonly dailyPayments: RestaurantDailyPaymentsReadPort,
    private readonly parameters: DreParametersRepositoryPort,
    /** Hoje, YYYY-MM-DD (injetado para os testes). */
    private readonly today: () => string = () => new Date().toISOString().slice(0, 10),
  ) {}

  async execute({ organizationId, year, month }: { organizationId: OrganizationId; year: number; month: number }): Promise<SalesReconciliation> {
    const today = this.today();
    const { from, to, isCurrentMonth } = cashFlowPeriod(year, month, today);
    // Folga dos dois lados: o crédito de dia 1 paga vendas do mês anterior; o do fim do mês chega no seguinte.
    const salesFrom = addDays(from, -SETTLEMENT_MARGIN_DAYS);
    const creditsTo = [addDays(to, SETTLEMENT_MARGIN_DAYS), today].sort()[0]!;

    const [sales, storedCredits, stored] = await Promise.all([
      this.dailyPayments.dailyPayments(organizationId, salesFrom, to),
      this.bankMovements.listCredits(organizationId, salesFrom, creditsTo),
      this.parameters.forMonth(organizationId, year, month),
    ]);
    const credits = storedCredits.map(({ description, ...c }) => ({ ...c, ...this.movementKind.describe(description, "credit") }));

    return buildSalesReconciliation({
      period: { year, month, from, to, isCurrentMonth },
      sales,
      credits,
      expectedCardFeePct: resolveDreParameters(stored.own, stored.previous).cardFeePct,
    });
  }
}
