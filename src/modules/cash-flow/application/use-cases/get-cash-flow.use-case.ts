import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { CashFlowReport } from "../../domain/entities/cash-flow.js";
import type { GetCashFlowParams, GetCashFlowPort } from "../../domain/ports/in/get-cash-flow.port.js";
import type { BankMovementReadPort } from "../../domain/ports/out/bank-movement-read.port.js";
import type { CostCenterCatalogReadPort } from "../../domain/ports/out/cost-center-catalog-read.port.js";
import type { ExpenseSourceReadPort } from "../../domain/ports/out/expense-source-read.port.js";
import type { MovementKindPort } from "../../domain/ports/out/movement-kind.port.js";
import { cashFlowPeriod } from "../../domain/services/cash-flow-period.js";
import { buildCashFlowReport, type CashFlowWindowData } from "../../domain/services/cash-flow-report.service.js";
import { collectExpenseReferences } from "../../domain/services/expense-categorizer.service.js";

export class GetCashFlowUseCase implements GetCashFlowPort {
  constructor(
    private readonly bankMovements: BankMovementReadPort,
    private readonly expenseSources: ExpenseSourceReadPort,
    private readonly catalog: CostCenterCatalogReadPort,
    private readonly movementKind: MovementKindPort,
    /** Hoje, YYYY-MM-DD (injetado para os testes). */
    private readonly today: () => string = () => new Date().toISOString().slice(0, 10),
  ) {}

  async execute({ organizationId, year, month }: GetCashFlowParams): Promise<CashFlowReport> {
    const period = cashFlowPeriod(year, month, this.today());

    const [catalog, current, previous] = await Promise.all([
      this.catalog.load(organizationId),
      this.window(organizationId, period.from, period.to),
      this.window(organizationId, period.previous.from, period.previous.to),
    ]);
    const sources = await this.expenseSources.load(
      organizationId,
      collectExpenseReferences([...current.debits, ...previous.debits]),
    );

    return buildCashFlowReport({ period, current, previous, sources, catalog });
  }

  private async window(organizationId: OrganizationId, from: string, to: string): Promise<CashFlowWindowData> {
    const [debits, credits] = await Promise.all([
      this.bankMovements.listDebits(organizationId, from, to),
      this.bankMovements.listCredits(organizationId, from, to),
    ]);
    return {
      debits: debits.map(({ description, ...d }) => ({ ...d, kind: this.movementKind.kindOf(description, "debit") })),
      credits: credits.map(({ description, ...c }) => ({ ...c, kind: this.movementKind.kindOf(description, "credit") })),
    };
  }
}
