import type { ListPlanningAlertsCommand, ListPlanningAlertsPort, PlanningAlertRowDTO } from "../../domain/ports/in/stock-planning.ports.js";
import type { PlanningAlertRepositoryPort } from "../../domain/ports/out/planning-alert-repository.port.js";
import type { StockItemPlanningReadPort } from "../../domain/ports/out/stock-item-planning-read.port.js";
import { toAlertRowDTO } from "./shared-alert.js";

export class ListPlanningAlertsUseCase implements ListPlanningAlertsPort {
  constructor(
    private readonly planningAlertRepo: PlanningAlertRepositoryPort,
    private readonly stockItemPlanningRead: StockItemPlanningReadPort,
  ) {}

  async execute(command: ListPlanningAlertsCommand): Promise<PlanningAlertRowDTO[]> {
    const filter: Parameters<typeof this.planningAlertRepo.findAll>[1] = { locationId: command.locationId };
    if (command.state) filter.state = command.state;
    if (command.alertType) filter.alertType = command.alertType;
    const alerts = await this.planningAlertRepo.findAll(command.organizationId, filter);

    const rows: PlanningAlertRowDTO[] = [];
    for (const alert of alerts) {
      const item = await this.stockItemPlanningRead.findById(command.organizationId, alert.itemId);
      rows.push(toAlertRowDTO(alert, item?.name ?? alert.itemId));
    }
    return rows.sort((a, b) => b.lastUpdatedAt.localeCompare(a.lastUpdatedAt));
  }
}
