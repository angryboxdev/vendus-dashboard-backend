import type { ListPlanningItemsCommand, ListPlanningItemsPort, PlanningItemRowDTO } from "../../domain/ports/in/stock-planning.ports.js";
import type { ForecastRunRepositoryPort } from "../../domain/ports/out/forecast-run-repository.port.js";
import type { PendingPurchaseReviewReadPort } from "../../domain/ports/out/pending-purchase-review-read.port.js";
import type { PlanningAlertRepositoryPort } from "../../domain/ports/out/planning-alert-repository.port.js";
import type { StockCountSignalReadPort } from "../../domain/ports/out/stock-count-signal-read.port.js";
import type { StockItemPlanningReadPort } from "../../domain/ports/out/stock-item-planning-read.port.js";
import type { StockQuantityReadPort } from "../../domain/ports/out/stock-quantity-read.port.js";
import { yesterdayISO } from "./date-utils.js";
import { buildItemProjectionContext, buildRow, buildRowWithoutRun } from "./shared.js";

/** Tela principal de Planeamento — projeção sempre recalculada em leitura a partir do último run (nunca persistida, ver README). */
export class ListPlanningItemsUseCase implements ListPlanningItemsPort {
  constructor(
    private readonly stockItemPlanningRead: StockItemPlanningReadPort,
    private readonly stockQuantityRead: StockQuantityReadPort,
    private readonly forecastRunRepo: ForecastRunRepositoryPort,
    private readonly planningAlertRepo: PlanningAlertRepositoryPort,
    private readonly pendingPurchaseReviewRead: PendingPurchaseReviewReadPort,
    private readonly stockCountSignalRead: StockCountSignalReadPort,
  ) {}

  async execute(command: ListPlanningItemsCommand): Promise<PlanningItemRowDTO[]> {
    let items = await this.stockItemPlanningRead.listActive(command.organizationId);
    if (command.categoryId) items = items.filter((i) => i.categoryId === command.categoryId);
    if (command.search) {
      const needle = command.search.toLowerCase();
      items = items.filter((i) => i.name.toLowerCase().includes(needle));
    }

    const quantities = await this.stockQuantityRead.getQuantities(
      command.organizationId,
      items.map((i) => i.id),
    );
    const latestRun = await this.forecastRunRepo.findLatestRun(command.organizationId, command.locationId);

    if (!latestRun) {
      return items.map((item) => buildRowWithoutRun(item, quantities.get(item.id)));
    }

    const recommendations = await this.forecastRunRepo.findRecommendations(command.organizationId, latestRun.id);
    const recsByItem = new Map(recommendations.map((r) => [r.stockItemId, r]));
    const today = yesterdayISO();

    const rows: PlanningItemRowDTO[] = [];
    for (const item of items) {
      const snapshot = quantities.get(item.id) ?? { stockItemId: item.id, currentQuantity: 0, lastPurchaseUnitCostWithoutVat: null };
      const rec = recsByItem.get(item.id) ?? null;
      const ctx = await buildItemProjectionContext({
        organizationId: command.organizationId,
        runId: latestRun.id,
        item,
        snapshot,
        forecastRunRepo: this.forecastRunRepo,
        planningAlertRepo: this.planningAlertRepo,
        pendingPurchaseReviewRead: this.pendingPurchaseReviewRead,
        stockCountSignalRead: this.stockCountSignalRead,
        recommendation: rec,
        // Recomputado em leitura: o sinal de "mapeamento incompleto" só é
        // avaliado com precisão durante o run diário (exigiria repetir a
        // conversão receita↔venda); itens com recomendação já herdam a
        // confiança calculada nesse momento (que já inclui este sinal) — ver
        // README "Design decisions".
        hasIncompleteMapping: false,
        today,
      });

      const row = buildRow(ctx);
      if (command.riskLevel && row.riskLevel !== command.riskLevel) continue;
      if (command.supplierId && row.supplierId !== command.supplierId) continue;
      rows.push(row);
    }
    return rows;
  }
}
