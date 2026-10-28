import type { DreEntries, DreReport } from "../../domain/entities/dre.js";
import type { GetDreEntriesPort } from "../../domain/ports/in/get-dre-entries.port.js";
import type { GetDrePort } from "../../domain/ports/in/get-dre.port.js";
import type { BankMovementReadPort } from "../../domain/ports/out/bank-movement-read.port.js";
import { CATEGORY_VAT_SAMPLE, type CategoryVatRatioReadPort } from "../../domain/ports/out/category-vat-ratio-read.port.js";
import type { CostCenterCatalogReadPort } from "../../domain/ports/out/cost-center-catalog-read.port.js";
import type { DreParametersRepositoryPort } from "../../domain/ports/out/dre-parameters-repository.port.js";
import type { ExpenseSourceReadPort } from "../../domain/ports/out/expense-source-read.port.js";
import type { MovementKindPort } from "../../domain/ports/out/movement-kind.port.js";
import type { RestaurantSalesReadPort } from "../../domain/ports/out/restaurant-sales-read.port.js";
import type { UnpaidInvoicesReadPort } from "../../domain/ports/out/unpaid-invoices-read.port.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { cashFlowPeriod, drePaymentsWindow } from "../../domain/services/cash-flow-period.js";
import { resolveDreParameters } from "../../domain/services/dre-parameters.service.js";
import { buildDreEntries, buildDreReport, type BuildDreInput } from "../../domain/services/dre-report.service.js";
import { collectExpenseReferences } from "../../domain/services/expense-categorizer.service.js";

/** Sem as vendas do restaurante (pedido rápido): receita do restaurante a zero, assinalada no relatório. */
const NO_RESTAURANT_SALES = { netCents: 0, vatCents: 0, byPaymentGrossCents: { card: 0, cash: 0, other: 0 } };

type DreQuery = { organizationId: OrganizationId; year: number; month: number };

/** Junta o que a DRE precisa: pagamentos da janela (competência), entradas do mês, documentos, catálogo, taxas. */
class DreInputLoader {
  constructor(
    private readonly bankMovements: BankMovementReadPort,
    private readonly expenseSources: ExpenseSourceReadPort,
    private readonly catalog: CostCenterCatalogReadPort,
    private readonly movementKind: MovementKindPort,
    private readonly restaurantSales: RestaurantSalesReadPort | null,
    private readonly parameters: DreParametersRepositoryPort,
    private readonly categoryVatRatios: CategoryVatRatioReadPort,
    private readonly unpaid: UnpaidInvoicesReadPort,
    private readonly today: () => string,
  ) {}

  async load({ organizationId, year, month }: DreQuery, withRestaurantSales: boolean): Promise<BuildDreInput> {
    const today = this.today();
    const { from, to, monthEnd, isCurrentMonth } = cashFlowPeriod(year, month, today);
    const window = drePaymentsWindow(year, month, today);

    const [catalog, storedDebits, storedCredits, restaurant, stored, categoryNetRatios, unpaidInvoices] = await Promise.all([
      this.catalog.load(organizationId),
      this.bankMovements.listDebits(organizationId, window.from, window.to),
      this.bankMovements.listCredits(organizationId, from, to),
      withRestaurantSales && this.restaurantSales ? this.restaurantSales.sales(organizationId, from, to) : Promise.resolve(NO_RESTAURANT_SALES),
      this.parameters.forMonth(organizationId, year, month),
      this.categoryVatRatios.recentNetRatios(organizationId, to, CATEGORY_VAT_SAMPLE),
      this.unpaid.unpaidInvoices(organizationId, from, monthEnd),
    ]);
    const debits = storedDebits.map(({ description, ...d }) => {
      const n = this.movementKind.describe(description, "debit");
      return { ...d, kind: n.kind, label: n.label ?? description };
    });
    const credits = storedCredits.map(({ description, ...c }) => ({ ...c, ...this.movementKind.describe(description, "credit") }));
    const sources = await this.expenseSources.load(organizationId, collectExpenseReferences(debits, { withOwnCategory: true }));

    return {
      period: { year, month, from, to, isCurrentMonth },
      debits,
      credits,
      sources,
      catalog,
      restaurant,
      restaurantSalesLoaded: withRestaurantSales,
      parameters: resolveDreParameters(stored.own, stored.previous),
      categoryNetRatios,
      unpaidInvoices,
    };
  }
}

export class GetDreUseCase implements GetDrePort {
  private readonly loader: DreInputLoader;

  constructor(
    bankMovements: BankMovementReadPort,
    expenseSources: ExpenseSourceReadPort,
    catalog: CostCenterCatalogReadPort,
    movementKind: MovementKindPort,
    restaurantSales: RestaurantSalesReadPort,
    parameters: DreParametersRepositoryPort,
    categoryVatRatios: CategoryVatRatioReadPort,
    unpaidInvoices: UnpaidInvoicesReadPort,
    /** Hoje, YYYY-MM-DD (injetado para os testes). */
    today: () => string = () => new Date().toISOString().slice(0, 10),
  ) {
    this.loader = new DreInputLoader(bankMovements, expenseSources, catalog, movementKind, restaurantSales, parameters, categoryVatRatios, unpaidInvoices, today);
  }

  async execute({ withRestaurantSales = true, ...query }: DreQuery & { withRestaurantSales?: boolean }): Promise<DreReport> {
    return buildDreReport(await this.loader.load(query, withRestaurantSales));
  }
}

/** Os pagamentos por trás de cada rubrica da DRE (sem as vendas do Vendus, que não são precisas). */
export class GetDreEntriesUseCase implements GetDreEntriesPort {
  private readonly loader: DreInputLoader;

  constructor(
    bankMovements: BankMovementReadPort,
    expenseSources: ExpenseSourceReadPort,
    catalog: CostCenterCatalogReadPort,
    movementKind: MovementKindPort,
    parameters: DreParametersRepositoryPort,
    categoryVatRatios: CategoryVatRatioReadPort,
    unpaidInvoices: UnpaidInvoicesReadPort,
    /** Hoje, YYYY-MM-DD (injetado para os testes). */
    today: () => string = () => new Date().toISOString().slice(0, 10),
  ) {
    this.loader = new DreInputLoader(bankMovements, expenseSources, catalog, movementKind, null, parameters, categoryVatRatios, unpaidInvoices, today);
  }

  async execute(query: DreQuery): Promise<DreEntries> {
    const input = await this.loader.load(query, false);
    return { period: input.period, entries: buildDreEntries(input) };
  }
}
